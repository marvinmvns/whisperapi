const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

class WhisperAPIClient {
  constructor(baseURL = 'http://localhost:3000') {
    this.baseURL = baseURL;
    this.axios = axios.create({ baseURL });
  }

  async transcribeFile(filePath, options = {}) {
    try {
      const formData = new FormData();
      formData.append('audio', fs.createReadStream(filePath));
      
      if (options.language) formData.append('language', options.language);
      if (options.translate !== undefined) formData.append('translate', options.translate);
      if (options.wordTimestamps !== undefined) formData.append('wordTimestamps', options.wordTimestamps);
      if (options.cleanup !== undefined) formData.append('cleanup', options.cleanup);

      const response = await this.axios.post('/transcribe', formData, {
        headers: formData.getHeaders(),
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      throw new Error(`Transcription upload failed: ${error.response?.data?.error || error.message}`);
    }
  }

  async getJobStatus(jobId) {
    try {
      const response = await this.axios.get(`/status/${jobId}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('Job not found');
      }
      throw new Error(`Status check failed: ${error.response?.data?.error || error.message}`);
    }
  }

  async waitForCompletion(jobId, pollInterval = 2000, maxWaitTime = 300000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getJobStatus(jobId);
      
      if (status.status === 'completed') {
        return status;
      }
      
      if (status.status === 'failed') {
        throw new Error(`Transcription failed: ${status.error}`);
      }
      
      console.log(`Job ${jobId} status: ${status.status}`);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error(`Transcription timeout after ${maxWaitTime}ms`);
  }

  async transcribeAndWait(filePath, options = {}) {
    console.log(`Starting transcription for: ${filePath}`);
    
    const uploadResult = await this.transcribeFile(filePath, options);
    console.log(`Job queued with ID: ${uploadResult.jobId}`);
    console.log(`Estimated wait time: ${uploadResult.estimatedWaitTime}s`);
    
    const result = await this.waitForCompletion(uploadResult.jobId);
    console.log('Transcription completed!');
    
    return result;
  }

  async getEstimate(duration, format = '.wav') {
    try {
      const response = await this.axios.get('/estimate', {
        params: { duration, format }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Estimate failed: ${error.response?.data?.error || error.message}`);
    }
  }

  async getQueueEstimate() {
    try {
      const response = await this.axios.get('/queue-estimate');
      return response.data;
    } catch (error) {
      throw new Error(`Queue estimate failed: ${error.response?.data?.error || error.message}`);
    }
  }

  async getHealth() {
    try {
      const response = await this.axios.get('/health');
      return response.data;
    } catch (error) {
      throw new Error(`Health check failed: ${error.message}`);
    }
  }

  async getSupportedFormats() {
    try {
      const response = await this.axios.get('/formats');
      return response.data;
    } catch (error) {
      throw new Error(`Formats request failed: ${error.message}`);
    }
  }
}

async function example() {
  const client = new WhisperAPIClient();
  
  try {
    console.log('=== WhisperAPI Client Example ===\n');
    
    console.log('1. Checking API health...');
    const health = await client.getHealth();
    console.log(`✅ API is ${health.status}, uptime: ${health.uptime}s\n`);
    
    console.log('2. Getting supported formats...');
    const formats = await client.getSupportedFormats();
    console.log(`✅ Supported formats: ${formats.supportedFormats.join(', ')}\n`);
    
    console.log('3. Getting queue estimate...');
    const queueStats = await client.getQueueEstimate();
    console.log(`✅ Queue: ${queueStats.queueLength} pending, ${queueStats.activeJobs} active\n`);
    
    console.log('4. Getting processing estimate for 60s audio...');
    const estimate = await client.getEstimate(60, '.wav');
    console.log(`✅ Estimated time: ${estimate.totalEstimatedTime}s total\n`);
    
    const audioFile = './examples/sample-audio.wav';
    
    if (fs.existsSync(audioFile)) {
      console.log('5. Transcribing audio file...');
      const result = await client.transcribeAndWait(audioFile, {
        language: 'auto',
        wordTimestamps: true
      });
      
      console.log('✅ Transcription Result:');
      console.log(`Text: ${result.result.text}`);
      console.log(`Processing Time: ${result.result.processingTime}s`);
      console.log(`Language: ${result.result.metadata.language}`);
    } else {
      console.log('5. ⚠️  Sample audio file not found, skipping transcription demo');
      console.log('   To test transcription, place an audio file at ./examples/sample-audio.wav\n');
      
      console.log('6. Simulating transcription workflow...');
      const uploadResult = await client.transcribeFile(audioFile, {
        language: 'pt'
      }).catch(() => ({ jobId: 'demo-job-id', message: 'Demo mode' }));
      
      console.log(`Upload result: ${uploadResult.message}`);
      
      try {
        const status = await client.getJobStatus('non-existent-job');
      } catch (error) {
        console.log(`✅ Error handling works: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Example failed:', error.message);
  }
}

if (require.main === module) {
  example();
}

module.exports = WhisperAPIClient;