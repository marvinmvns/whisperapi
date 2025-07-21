#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const FormData = require('form-data');
const axios = require('axios');

class EngineBenchmark {
  constructor() {
    this.serverURL = 'http://localhost:3001';
    this.axios = axios.create({ 
      baseURL: this.serverURL,
      timeout: 1800000 // 30 minutes timeout for slow models
    });
    this.serverProcess = null;
    this.envFile = path.join(__dirname, '.env');
    this.results = {
      'whisper.cpp': {},
      'faster-whisper': {},
      'insanely-fast-whisper': {}
    };
    this.testFiles = [];
  }

  async setEngine(engine) {
    console.log(`🔧 Setting WHISPER_ENGINE to ${engine}...`);
    
    if (!fs.existsSync(this.envFile)) {
      // Create .env from .env.example
      const exampleContent = fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8');
      fs.writeFileSync(this.envFile, exampleContent);
    }

    let envContent = fs.readFileSync(this.envFile, 'utf8');
    
    // Update WHISPER_ENGINE
    if (envContent.includes('WHISPER_ENGINE=')) {
      envContent = envContent.replace(/^WHISPER_ENGINE=.+$/m, `WHISPER_ENGINE=${engine}`);
    } else {
      envContent += `\nWHISPER_ENGINE=${engine}\n`;
    }

    fs.writeFileSync(this.envFile, envContent);
    console.log(`✅ Updated .env with WHISPER_ENGINE=${engine}`);
  }

  async startServer(engine) {
    console.log(`🚀 Starting server with ${engine} engine...`);
    
    // Kill existing server if running
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return new Promise((resolve, reject) => {
      const serverScript = path.join(__dirname, 'src/server.js');
      
      this.serverProcess = spawn('node', [serverScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname
      });

      let serverReady = false;
      let startupOutput = '';

      const timeout = setTimeout(() => {
        if (!serverReady) {
          this.serverProcess.kill('SIGTERM');
          reject(new Error(`Server startup timeout for ${engine} engine. Output: ${startupOutput}`));
        }
      }, 120000); // 2 minute timeout

      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        startupOutput += output;
        
        if (output.includes('Server is ready to accept requests!')) {
          serverReady = true;
          clearTimeout(timeout);
          console.log(`✅ Server started successfully with ${engine} engine`);
          
          // Wait for worker initialization
          setTimeout(() => resolve(this.serverProcess), 10000);
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        const error = data.toString();
        startupOutput += error;
        if (error.includes('Error') && !error.includes('nvidia-smi: not found')) {
          console.error(`Server error with ${engine}:`, error);
        }
      });

      this.serverProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start server with ${engine}: ${error.message}`));
      });

      this.serverProcess.on('exit', (code) => {
        clearTimeout(timeout);
        if (!serverReady && code !== 0) {
          reject(new Error(`Server exited with code ${code} for ${engine} engine. Output: ${startupOutput}`));
        }
      });
    });
  }

  async waitForServerHealth() {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await this.axios.get('/health');
        if (response.status === 200) {
          console.log('✅ Server health check passed');
          return true;
        }
      } catch (error) {
        // Server not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error('Server health check failed after maximum attempts');
  }

  async findTestAudioFiles() {
    const candidates = [
      path.join(__dirname, 'examples/demo.mp3'),
      path.join(__dirname, 'test-short.mp3'),
      ...fs.readdirSync(path.join(__dirname, 'uploads'))
        .filter(file => file.match(/\.(mp3|wav|ogg|flac|m4a|aac)$/i))
        .map(file => path.join(__dirname, 'uploads', file))
    ];

    for (const file of candidates) {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        this.testFiles.push({
          path: file,
          name: path.basename(file),
          size: stats.size,
          sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
        });
      }
    }

    if (this.testFiles.length === 0) {
      throw new Error('❌ No audio files found for testing');
    }

    console.log(`📁 Found ${this.testFiles.length} test audio file(s):`);
    this.testFiles.forEach(file => {
      console.log(`   - ${file.name} (${file.sizeMB}MB)`);
    });
  }

  async benchmarkEngine(engine, audioFile) {
    console.log(`\n🔄 Benchmarking ${engine} with ${audioFile.name}...`);

    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioFile.path));
    formData.append('language', 'auto');

    const startTime = Date.now();

    try {
      // Upload
      const uploadResponse = await this.axios.post('/transcribe', formData, {
        headers: formData.getHeaders(),
        timeout: 60000
      });

      const jobId = uploadResponse.data.jobId;
      const uploadTime = Date.now() - startTime;
      console.log(`📊 Job ID: ${jobId} (Upload: ${uploadTime}ms)`);

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 600; // 30 minutes max
      let pollStartTime = Date.now();

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds
        
        try {
          const statusResponse = await this.axios.get(`/status/${jobId}`);
          const result = statusResponse.data;

          if (result.status === 'completed') {
            const totalTime = Date.now() - startTime;
            const processingTime = result.result.processingTime;
            const queueTime = totalTime - (processingTime * 1000) - uploadTime;

            console.log(`✅ ${engine} transcription completed`);
            
            return {
              success: true,
              engine,
              audioFile: audioFile.name,
              audioSize: audioFile.sizeMB,
              uploadTime: uploadTime,
              queueTime: Math.max(0, queueTime),
              processingTime: processingTime * 1000, // Convert to ms
              totalTime: totalTime,
              textLength: result.result.text.length,
              wordCount: result.result.words ? result.result.words.length : 0,
              language: result.result.language || result.result.metadata?.language,
              engineMetadata: result.result.metadata || {}
            };
          }

          if (result.status === 'failed') {
            throw new Error(`Transcription failed: ${result.error}`);
          }

          console.log(`⏳ Status: ${result.status} (${engine}) - Attempt ${attempts + 1}`);
        } catch (statusError) {
          console.log(`⚠️  Status check error (attempt ${attempts + 1}): ${statusError.message}`);
          if (statusError.response?.status === 404) {
            // Job might have completed and been cleaned up
            break;
          }
        }

        attempts++;
      }

      throw new Error(`Timeout waiting for ${engine} transcription to complete`);

    } catch (error) {
      console.error(`❌ ${engine} benchmark failed:`, error.message);
      return {
        success: false,
        engine,
        audioFile: audioFile.name,
        error: error.message
      };
    }
  }

  async runBenchmarkSuite() {
    console.log('🎯 === WHISPER ENGINE BENCHMARK SUITE ===\n');

    try {
      await this.findTestAudioFiles();
      
      const engines = ['whisper.cpp', 'faster-whisper', 'insanely-fast-whisper'];
      
      for (const engine of engines) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🧪 BENCHMARKING ${engine.toUpperCase()}`);
        console.log(`${'='.repeat(60)}`);

        try {
          // Set engine and start server
          await this.setEngine(engine);
          await this.startServer(engine);
          await this.waitForServerHealth();

          // Test with each audio file
          for (const audioFile of this.testFiles) {
            const result = await this.benchmarkEngine(engine, audioFile);
            
            if (!this.results[engine].files) {
              this.results[engine].files = [];
            }
            this.results[engine].files.push(result);
          }

        } catch (error) {
          console.error(`❌ ${engine} benchmark suite failed:`, error.message);
          this.results[engine].error = error.message;
        }
      }

      this.generateReport();

    } catch (error) {
      console.error('\n❌ Benchmark suite failed:', error.message);
      throw error;
    } finally {
      // Kill server
      if (this.serverProcess) {
        console.log('\n🔄 Shutting down server...');
        this.serverProcess.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }

  generateReport() {
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 BENCHMARK REPORT');
    console.log(`${'='.repeat(80)}`);

    // Summary table
    const engines = Object.keys(this.results);
    const reportData = [];

    engines.forEach(engine => {
      if (this.results[engine].files && this.results[engine].files.length > 0) {
        const successfulRuns = this.results[engine].files.filter(r => r.success);
        
        if (successfulRuns.length > 0) {
          const avgProcessingTime = successfulRuns.reduce((sum, r) => sum + r.processingTime, 0) / successfulRuns.length;
          const avgTotalTime = successfulRuns.reduce((sum, r) => sum + r.totalTime, 0) / successfulRuns.length;
          const avgTextLength = successfulRuns.reduce((sum, r) => sum + r.textLength, 0) / successfulRuns.length;
          
          reportData.push({
            engine,
            runs: successfulRuns.length,
            avgProcessingTime: (avgProcessingTime / 1000).toFixed(1),
            avgTotalTime: (avgTotalTime / 1000).toFixed(1),
            avgTextLength: Math.round(avgTextLength),
            fastest: Math.min(...successfulRuns.map(r => r.processingTime / 1000)).toFixed(1),
            slowest: Math.max(...successfulRuns.map(r => r.processingTime / 1000)).toFixed(1)
          });
        }
      }
    });

    // Print summary table
    console.log('\n📋 SUMMARY TABLE:');
    console.log('─'.repeat(100));
    console.log('Engine               | Runs | Avg Process | Avg Total | Avg Text | Fastest | Slowest');
    console.log('─'.repeat(100));
    
    reportData.forEach(data => {
      console.log(
        `${data.engine.padEnd(20)} | ${data.runs.toString().padStart(4)} | ` +
        `${(data.avgProcessingTime + 's').padStart(11)} | ${(data.avgTotalTime + 's').padStart(9)} | ` +
        `${data.avgTextLength.toString().padStart(8)} | ${(data.fastest + 's').padStart(7)} | ${(data.slowest + 's').padStart(7)}`
      );
    });
    console.log('─'.repeat(100));

    // Detailed results
    engines.forEach(engine => {
      console.log(`\n🔧 ${engine.toUpperCase()} DETAILED RESULTS:`);
      console.log('─'.repeat(80));
      
      if (this.results[engine].error) {
        console.log(`❌ Error: ${this.results[engine].error}`);
      } else if (this.results[engine].files) {
        this.results[engine].files.forEach(result => {
          if (result.success) {
            console.log(`✅ ${result.audioFile}:`);
            console.log(`   Processing Time: ${(result.processingTime / 1000).toFixed(1)}s`);
            console.log(`   Total Time: ${(result.totalTime / 1000).toFixed(1)}s`);
            console.log(`   Text Length: ${result.textLength} characters`);
            console.log(`   Word Count: ${result.wordCount} words`);
            console.log(`   Language: ${result.language}`);
            if (result.engineMetadata && Object.keys(result.engineMetadata).length > 0) {
              console.log(`   Metadata: ${JSON.stringify(result.engineMetadata, null, 6)}`);
            }
          } else {
            console.log(`❌ ${result.audioFile}: ${result.error}`);
          }
        });
      }
    });

    // Performance ranking
    if (reportData.length > 1) {
      console.log('\n🏆 PERFORMANCE RANKING:');
      console.log('─'.repeat(50));
      
      const byProcessingTime = [...reportData].sort((a, b) => parseFloat(a.avgProcessingTime) - parseFloat(b.avgProcessingTime));
      console.log('📈 By Average Processing Time:');
      byProcessingTime.forEach((data, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
        console.log(`   ${medal} ${data.engine}: ${data.avgProcessingTime}s`);
      });

      const byTotalTime = [...reportData].sort((a, b) => parseFloat(a.avgTotalTime) - parseFloat(b.avgTotalTime));
      console.log('\n⏱️  By Average Total Time:');
      byTotalTime.forEach((data, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
        console.log(`   ${medal} ${data.engine}: ${data.avgTotalTime}s`);
      });
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ BENCHMARK COMPLETED SUCCESSFULLY!');
    console.log(`🎉 Tested ${engines.length} engines with ${this.testFiles.length} audio file(s).`);
    console.log(`${'='.repeat(80)}`);

    // Save detailed results to file
    const resultsFile = path.join(__dirname, `benchmark-results-${Date.now()}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: reportData,
      detailed: this.results,
      testFiles: this.testFiles
    }, null, 2));
    console.log(`📄 Detailed results saved to: ${path.basename(resultsFile)}`);
  }
}

// Run the benchmark
if (require.main === module) {
  new EngineBenchmark().runBenchmarkSuite().catch(error => {
    console.error('❌ Benchmark failed:', error.message);
    process.exit(1);
  });
}

module.exports = EngineBenchmark;