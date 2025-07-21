const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');
const { spawn } = require('child_process');

describe('Engine Comparison Tests', () => {
  const serverURL = 'http://localhost:3001';
  const axios_instance = axios.create({ 
    baseURL: serverURL,
    timeout: 120000
  });

  const testAudioFile = path.join(__dirname, '../../examples/demo.mp3');
  const uploadedAudioFiles = [
    path.join(__dirname, '../../uploads/audio-1753055017173-673291615.ogg'),
    path.join(__dirname, '../../uploads/audio-1753055019197-484094384.ogg')
  ];

  let serverProcess = null;
  let originalEnvEngine;

  beforeAll(async () => {
    originalEnvEngine = process.env.WHISPER_ENGINE;
    
    // Verify test audio files exist
    if (!fs.existsSync(testAudioFile)) {
      console.warn(`Test audio file not found: ${testAudioFile}`);
    }

    // Find available audio files in uploads
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (fs.existsSync(uploadsDir)) {
      const audioFiles = fs.readdirSync(uploadsDir)
        .filter(file => file.match(/\.(mp3|wav|ogg|flac|m4a|aac)$/i))
        .map(file => path.join(uploadsDir, file));
      
      if (audioFiles.length > 0) {
        console.log(`Found ${audioFiles.length} audio files in uploads directory`);
      }
    }
  });

  afterAll(async () => {
    // Restore original engine setting
    if (originalEnvEngine) {
      process.env.WHISPER_ENGINE = originalEnvEngine;
    } else {
      delete process.env.WHISPER_ENGINE;
    }

    // Kill server process if running
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  });

  async function startServerWithEngine(engine) {
    console.log(`🚀 Starting server with ${engine} engine...`);
    
    // Kill existing server if running
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    return new Promise((resolve, reject) => {
      const env = { ...process.env, WHISPER_ENGINE: engine };
      const serverScript = path.join(__dirname, '../../server.js');
      
      serverProcess = spawn('node', [serverScript], { 
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.join(__dirname, '../..')
      });

      let serverOutput = '';
      let serverReady = false;

      const timeout = setTimeout(() => {
        if (!serverReady) {
          serverProcess.kill('SIGTERM');
          reject(new Error(`Server startup timeout for ${engine} engine`));
        }
      }, 60000); // 60 second timeout

      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        serverOutput += output;
        
        if (output.includes('Server is ready to accept requests!')) {
          serverReady = true;
          clearTimeout(timeout);
          console.log(`✅ Server started successfully with ${engine} engine`);
          
          // Wait a bit more for full initialization
          setTimeout(() => resolve(serverProcess), 3000);
        }
      });

      serverProcess.stderr.on('data', (data) => {
        const error = data.toString();
        if (error.includes('Error') && !error.includes('nvidia-smi: not found')) {
          console.error(`Server error with ${engine}:`, error);
        }
      });

      serverProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start server with ${engine}: ${error.message}`));
      });

      serverProcess.on('exit', (code) => {
        clearTimeout(timeout);
        if (!serverReady && code !== 0) {
          reject(new Error(`Server exited with code ${code} for ${engine} engine. Output: ${serverOutput}`));
        }
      });
    });
  }

  async function waitForServerHealth() {
    const maxAttempts = 20;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await axios_instance.get('/health');
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

  async function transcribeWithEngine(audioPath, engine) {
    console.log(`\n🔄 Testing transcription with ${engine} engine...`);
    
    // Start server with specific engine
    await startServerWithEngine(engine);
    await waitForServerHealth();

    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioPath));
    formData.append('language', 'auto');
    formData.append('wordTimestamps', 'false');

    // Upload audio for transcription
    const uploadResponse = await axios_instance.post('/transcribe', formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });

    expect(uploadResponse.status).toBe(200);
    expect(uploadResponse.data.jobId).toBeDefined();

    const jobId = uploadResponse.data.jobId;
    console.log(`📊 Job ID: ${jobId} (${engine})`);

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 40; // 2 minutes max
    let result;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
      
      const statusResponse = await axios_instance.get(`/status/${jobId}`);
      result = statusResponse.data;

      console.log(`📊 Status: ${result.status} (${engine}) - Attempt ${attempts + 1}`);

      if (result.status === 'completed') {
        break;
      }

      if (result.status === 'failed') {
        throw new Error(`Transcription failed with ${engine}: ${result.error}`);
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new Error(`Timeout waiting for ${engine} transcription to complete`);
    }

    console.log(`✅ ${engine} transcription completed successfully`);
    return result;
  }

  async function getAvailableAudioFile() {
    // Try demo.mp3 first
    if (fs.existsSync(testAudioFile)) {
      return testAudioFile;
    }

    // Try uploaded files
    for (const audioFile of uploadedAudioFiles) {
      if (fs.existsSync(audioFile)) {
        return audioFile;
      }
    }

    // Try any file in uploads directory
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (fs.existsSync(uploadsDir)) {
      const audioFiles = fs.readdirSync(uploadsDir)
        .filter(file => file.match(/\.(mp3|wav|ogg|flac|m4a|aac)$/i))
        .map(file => path.join(uploadsDir, file));
      
      if (audioFiles.length > 0) {
        return audioFiles[0];
      }
    }

    throw new Error('No audio files found for testing');
  }

  test('Compare whisper.cpp vs faster-whisper engines', async () => {
    const audioFile = await getAvailableAudioFile();
    console.log(`\n🎵 Testing with audio file: ${path.basename(audioFile)}`);

    let whisperCppResult, fasterWhisperResult;

    try {
      // Test with whisper.cpp first
      console.log('\n🔧 === TESTING WHISPER.CPP ENGINE ===');
      whisperCppResult = await transcribeWithEngine(audioFile, 'whisper.cpp');
      
      // Test with faster-whisper  
      console.log('\n⚡ === TESTING FASTER-WHISPER ENGINE ===');
      fasterWhisperResult = await transcribeWithEngine(audioFile, 'faster-whisper');

    } catch (error) {
      console.error('❌ Engine comparison test failed:', error.message);
      throw error;
    }

    // Validate results
    expect(whisperCppResult.status).toBe('completed');
    expect(fasterWhisperResult.status).toBe('completed');

    expect(whisperCppResult.result).toBeDefined();
    expect(fasterWhisperResult.result).toBeDefined();

    expect(whisperCppResult.result.text).toBeDefined();
    expect(fasterWhisperResult.result.text).toBeDefined();

    expect(whisperCppResult.result.text.length).toBeGreaterThan(0);
    expect(fasterWhisperResult.result.text.length).toBeGreaterThan(0);

    // Log comparison results
    console.log('\n📊 === ENGINE COMPARISON RESULTS ===');
    console.log('\n🔧 whisper.cpp Results:');
    console.log(`📝 Text: ${whisperCppResult.result.text.substring(0, 100)}...`);
    console.log(`⏱️  Processing Time: ${whisperCppResult.result.processingTime}s`);
    console.log(`🌍 Language: ${whisperCppResult.result.metadata?.language || 'N/A'}`);
    console.log(`🚀 Engine: ${whisperCppResult.result.metadata?.engine || 'whisper.cpp'}`);

    console.log('\n⚡ faster-whisper Results:');
    console.log(`📝 Text: ${fasterWhisperResult.result.text.substring(0, 100)}...`);
    console.log(`⏱️  Processing Time: ${fasterWhisperResult.result.processingTime}s`);
    console.log(`🌍 Language: ${fasterWhisperResult.result.metadata?.language || 'N/A'}`);
    console.log(`🚀 Engine: ${fasterWhisperResult.result.metadata?.engine || 'faster-whisper'}`);

    // Performance comparison
    const speedDifference = whisperCppResult.result.processingTime - fasterWhisperResult.result.processingTime;
    console.log(`\n📊 Performance Comparison:`);
    console.log(`⚡ faster-whisper was ${speedDifference > 0 ? 'faster' : 'slower'} by ${Math.abs(speedDifference).toFixed(1)}s`);

    // Text similarity check (basic length comparison)
    const lengthDifference = Math.abs(whisperCppResult.result.text.length - fasterWhisperResult.result.text.length);
    const avgLength = (whisperCppResult.result.text.length + fasterWhisperResult.result.text.length) / 2;
    const lengthSimilarity = ((avgLength - lengthDifference) / avgLength) * 100;
    
    console.log(`📝 Text Length Similarity: ${lengthSimilarity.toFixed(1)}%`);

    // Validate metadata contains engine information
    if (whisperCppResult.result.metadata?.engine) {
      expect(whisperCppResult.result.metadata.engine).toContain('whisper');
    }
    
    if (fasterWhisperResult.result.metadata?.engine) {
      expect(fasterWhisperResult.result.metadata.engine).toBe('faster-whisper');
    }

    console.log('\n✅ Both engines produced valid transcription results!');
  }, 300000); // 5 minute timeout

  test('Engine validation before comparison', async () => {
    // Test that faster-whisper engine is properly configured
    console.log('🔍 Validating faster-whisper configuration...');
    
    // Check if Python bridge exists
    const pythonBridge = path.join(__dirname, '../../scripts/faster_whisper_bridge.py');
    expect(fs.existsSync(pythonBridge)).toBe(true);
    console.log('✅ Python bridge script found');

    // Check if venv exists
    const venvPath = path.join(__dirname, '../../venv');
    expect(fs.existsSync(venvPath)).toBe(true);
    console.log('✅ Python virtual environment found');

    // Check worker files exist
    const fasterWorker = path.join(__dirname, '../workers/fasterWhisperWorker.js');
    const regularWorker = path.join(__dirname, '../workers/transcriptionWorker.js');
    
    expect(fs.existsSync(fasterWorker)).toBe(true);
    expect(fs.existsSync(regularWorker)).toBe(true);
    console.log('✅ Both worker files found');
  });
});