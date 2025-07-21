#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

class SimpleEngineTest {
  constructor() {
    this.serverURL = 'http://localhost:3001';
    this.axios = axios.create({ 
      baseURL: this.serverURL,
      timeout: 120000
    });
  }

  async checkServerHealth() {
    try {
      const response = await this.axios.get('/health');
      console.log('✅ Server is running and healthy');
      return response.data;
    } catch (error) {
      throw new Error('❌ Server is not running. Please start it with: npm start');
    }
  }

  async getAvailableAudioFile() {
    const candidates = [
      path.join(__dirname, '../../examples/demo.mp3'),
      path.join(__dirname, '../../test-short.mp3'),
      ...fs.readdirSync(path.join(__dirname, '../../uploads'))
        .filter(file => file.match(/\.(mp3|wav|ogg|flac|m4a|aac)$/i))
        .map(file => path.join(__dirname, '../../uploads', file))
    ];

    for (const file of candidates) {
      if (fs.existsSync(file)) {
        console.log(`🎵 Using audio file: ${path.basename(file)}`);
        return file;
      }
    }

    throw new Error('❌ No audio files found for testing');
  }

  async transcribeAudio(audioPath) {
    console.log(`📤 Uploading ${path.basename(audioPath)} for transcription...`);

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
    console.log(`⏱️  Estimated wait time: ${uploadResponse.data.estimatedWaitTime}s`);

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const statusResponse = await this.axios.get(`/status/${jobId}`);
      const result = statusResponse.data;

      console.log(`📊 Status: ${result.status} (attempt ${attempts + 1}/${maxAttempts})`);

      if (result.status === 'completed') {
        console.log('✅ Transcription completed successfully!');
        return result;
      }

      if (result.status === 'failed') {
        throw new Error(`❌ Transcription failed: ${result.error}`);
      }

      attempts++;
    }

    throw new Error('❌ Timeout waiting for transcription to complete');
  }

  async detectCurrentEngine() {
    try {
      // Get current environment
      const env = process.env.WHISPER_ENGINE || 'whisper.cpp';
      console.log(`🔧 Current WHISPER_ENGINE: ${env}`);
      return env;
    } catch (error) {
      console.log('🔧 Using default engine: whisper.cpp');
      return 'whisper.cpp';
    }
  }

  async runTest() {
    console.log('🧪 === SIMPLE ENGINE TEST ===\n');

    try {
      // Check server health
      const health = await this.checkServerHealth();
      console.log(`📊 Queue: ${health.queue.pendingJobs} pending, ${health.queue.activeJobs} active jobs`);
      console.log(`👷 Workers: ${health.queue.totalWorkers} total workers\n`);

      // Detect current engine
      const engine = await this.detectCurrentEngine();

      // Get audio file
      const audioFile = await this.getAvailableAudioFile();

      // Run transcription
      console.log(`\n🎯 Testing transcription with ${engine} engine...\n`);
      const result = await this.transcribeAudio(audioFile);

      // Display results
      console.log('\n📝 === TRANSCRIPTION RESULTS ===');
      console.log('─'.repeat(60));
      console.log(`📄 Text: ${result.result.text.substring(0, 200)}${result.result.text.length > 200 ? '...' : ''}`);
      console.log(`⏱️  Processing Time: ${result.result.processingTime}s`);
      console.log(`🌍 Language: ${result.result.metadata?.language || 'N/A'}`);
      console.log(`🚀 Engine: ${result.result.metadata?.engine || engine}`);
      console.log(`🕐 Created: ${new Date(result.createdAt).toLocaleString('pt-BR')}`);
      console.log(`✅ Completed: ${new Date(result.completedAt).toLocaleString('pt-BR')}`);
      console.log('─'.repeat(60));

      console.log(`\n✅ ${engine} engine test completed successfully!`);
      console.log('\n💡 To test the other engine:');
      console.log(`   1. Stop the server (Ctrl+C)`);
      console.log(`   2. Set WHISPER_ENGINE=${engine === 'faster-whisper' ? 'whisper.cpp' : 'faster-whisper'} in .env`);
      console.log(`   3. Restart server: npm start`);
      console.log(`   4. Run this test again: node src/tests/simple-engine-test.js`);

      return result;

    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      process.exit(1);
    }
  }
}

// Run the test
if (require.main === module) {
  new SimpleEngineTest().runTest();
}

module.exports = SimpleEngineTest;