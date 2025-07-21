#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const FormData = require('form-data');
const axios = require('axios');

class EngineToggleTest {
  constructor() {
    this.serverURL = 'http://localhost:3001';
    this.axios = axios.create({ 
      baseURL: this.serverURL,
      timeout: 1200000
    });
    this.serverProcess = null;
    this.envFile = path.join(__dirname, '.env');
  }

  async setEngine(engine) {
    console.log(`🔧 Setting WHISPER_ENGINE to ${engine}...`);
    
    if (!fs.existsSync(this.envFile)) {
      // Create .env from .env.example
      const exampleContent = fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8');
      fs.writeFileSync(this.envFile, exampleContent);
    }

    let envContent = fs.readFileSync(this.envFile, 'utf8');
    
    // Update or add WHISPER_ENGINE
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
      await new Promise(resolve => setTimeout(resolve, 3000));
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
      }, 9000000); // 90 second timeout

      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        startupOutput += output;
        
        if (output.includes('Server is ready to accept requests!')) {
          serverReady = true;
          clearTimeout(timeout);
          console.log(`✅ Server started successfully with ${engine} engine`);
          
          // Wait for worker initialization
          setTimeout(() => resolve(this.serverProcess), 5000);
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
    const maxAttempts = 300;
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

  async getAvailableAudioFile() {
    const candidates = [
      path.join(__dirname, 'examples/demo.mp3'),
      path.join(__dirname, 'test-short.mp3'),
      ...fs.readdirSync(path.join(__dirname, 'uploads'))
        .filter(file => file.match(/\.(mp3|wav|ogg|flac|m4a|aac)$/i))
        .map(file => path.join(__dirname, 'uploads', file))
    ];

    for (const file of candidates) {
      if (fs.existsSync(file)) {
        console.log(`🎵 Using audio file: ${path.basename(file)}`);
        return file;
      }
    }

    throw new Error('❌ No audio files found for testing');
  }

  async transcribeWithCurrentEngine(audioPath, engineName) {
    console.log(`\n🔄 Testing transcription with ${engineName} engine...`);

    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioPath));
    formData.append('language', 'auto');

    // Upload
    const uploadResponse = await this.axios.post('/transcribe', formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });

    const jobId = uploadResponse.data.jobId;
    console.log(`📊 Job ID: ${jobId}`);

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 400;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      try {
        const statusResponse = await this.axios.get(`/status/${jobId}`);
        const result = statusResponse.data;

        console.log(`📊 Status: ${result.status} (${engineName}) - Attempt ${attempts + 1}`);

        if (result.status === 'completed') {
          console.log(`✅ ${engineName} transcription completed successfully`);
          return result;
        }

        if (result.status === 'failed') {
          throw new Error(`Transcription failed with ${engineName}: ${result.error}`);
        }
      } catch (statusError) {
        console.log(`⚠️  Status check error (attempt ${attempts + 1}): ${statusError.message}`);
      }

      attempts++;
    }

    throw new Error(`Timeout waiting for ${engineName} transcription to complete`);
  }

  async testEngine(engine) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🧪 TESTING ${engine.toUpperCase()} ENGINE`);
    console.log(`${'='.repeat(50)}`);

    try {
      // Set engine in .env
      await this.setEngine(engine);

      // Start server with this engine
      await this.startServer(engine);
      await this.waitForServerHealth();

      // Get audio file
      const audioFile = await this.getAvailableAudioFile();

      // Run transcription
      const result = await this.transcribeWithCurrentEngine(audioFile, engine);

      // Display results
      console.log(`\n📝 ${engine.toUpperCase()} RESULTS:`);
      console.log('─'.repeat(60));
      console.log(`📄 Text: ${result.result.text.substring(0, 150)}${result.result.text.length > 150 ? '...' : ''}`);
      console.log(`⏱️  Processing Time: ${result.result.processingTime}s`);
      console.log(`🌍 Language: ${result.result.metadata?.language || 'N/A'}`);
      console.log(`🚀 Engine: ${result.result.metadata?.engine || engine}`);
      console.log('─'.repeat(60));

      return result;

    } catch (error) {
      console.error(`❌ ${engine} test failed:`, error.message);
      throw error;
    }
  }

  async runComparison() {
    console.log('🎯 === ENGINE TOGGLE COMPARISON TEST ===\n');

    let whisperCppResult, fasterWhisperResult, insanelyFastWhisperResult;

    try {
      // Test whisper.cpp
      whisperCppResult = await this.testEngine('whisper.cpp');

      // Test faster-whisper
      fasterWhisperResult = await this.testEngine('faster-whisper');

      // Test insanely-fast-whisper
      insanelyFastWhisperResult = await this.testEngine('insanely-fast-whisper');

      // Compare results
      console.log(`\n${'='.repeat(80)}`);
      console.log('📊 COMPARISON RESULTS');
      console.log(`${'='.repeat(80)}`);

      console.log('\n🔧 whisper.cpp:');
      console.log(`   Text Length: ${whisperCppResult.result.text.length} characters`);
      console.log(`   Processing Time: ${whisperCppResult.result.processingTime}s`);
      console.log(`   Language: ${whisperCppResult.result.metadata?.language || 'N/A'}`);

      console.log('\n⚡ faster-whisper:');
      console.log(`   Text Length: ${fasterWhisperResult.result.text.length} characters`);
      console.log(`   Processing Time: ${fasterWhisperResult.result.processingTime}s`);
      console.log(`   Language: ${fasterWhisperResult.result.metadata?.language || 'N/A'}`);

      console.log('\n🚀 insanely-fast-whisper:');
      console.log(`   Text Length: ${insanelyFastWhisperResult.result.text.length} characters`);
      console.log(`   Processing Time: ${insanelyFastWhisperResult.result.processingTime}s`);
      console.log(`   Language: ${insanelyFastWhisperResult.result.metadata?.language || 'N/A'}`);

      console.log(`\n📈 Performance Comparison:`);
      const times = [
        { name: 'whisper.cpp', time: whisperCppResult.result.processingTime },
        { name: 'faster-whisper', time: fasterWhisperResult.result.processingTime },
        { name: 'insanely-fast-whisper', time: insanelyFastWhisperResult.result.processingTime }
      ].sort((a, b) => a.time - b.time);

      times.forEach((engine, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
        console.log(`   ${medal} ${engine.name}: ${engine.time}s`);
      });

      const maxLength = Math.max(
        whisperCppResult.result.text.length,
        fasterWhisperResult.result.text.length,
        insanelyFastWhisperResult.result.text.length
      );
      const minLength = Math.min(
        whisperCppResult.result.text.length,
        fasterWhisperResult.result.text.length,
        insanelyFastWhisperResult.result.text.length
      );
      console.log(`\n📝 Text Length Variance: ${maxLength - minLength} characters`);

      console.log('\n✅ ENGINE TOGGLE TEST COMPLETED SUCCESSFULLY!');
      console.log('🎉 All three engines are working correctly and can be toggled via WHISPER_ENGINE environment variable.');

    } catch (error) {
      console.error('\n❌ Engine comparison failed:', error.message);
      throw error;
    } finally {
      // Kill server
      if (this.serverProcess) {
        console.log('\n🔄 Shutting down server...');
        this.serverProcess.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
}

// Run the test
if (require.main === module) {
  new EngineToggleTest().runComparison().catch(error => {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  });
}

module.exports = EngineToggleTest;