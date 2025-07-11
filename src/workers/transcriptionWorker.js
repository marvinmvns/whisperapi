const { parentPort } = require('worker_threads');
const { nodewhisper } = require('nodejs-whisper');
const fs = require('fs');
const path = require('path');

class TranscriptionWorker {
  constructor() {
    this.whisper = null;
    this.init();
  }

  async init() {
    try {
      const modelPath = process.env.WHISPER_MODEL_PATH || './models/ggml-large-v3-turbo.bin';
      
      // Validate that the model file exists and is a valid model file
      if (!fs.existsSync(modelPath)) {
        console.log(`Model not found at ${modelPath}, attempting auto-download...`);
        
        // Extract model name from path (e.g., ggml-base.bin -> base)
        const modelFileName = path.basename(modelPath);
        const modelName = this.extractModelName(modelFileName);
        
        if (modelName) {
          await this.autoDownloadModel(modelName, modelPath);
        } else {
          throw new Error(`Unable to determine model name from path: ${modelPath}`);
        }
      }

      // Validate model file integrity
      if (!this.isValidModelFile(modelPath)) {
        throw new Error(`Invalid or corrupted model file: ${modelPath}`);
      }

      // Initialize whisper with the model path, not calling it as a function yet
      this.whisper = nodewhisper;
      this.modelPath = modelPath;
      
      console.log(`Whisper worker initialized successfully with model: ${modelPath}`);
    } catch (error) {
      console.error('Failed to initialize Whisper worker:', error.message);
      parentPort?.postMessage({
        type: 'error',
        error: `Whisper initialization failed: ${error.message}`
      });
    }
  }

  extractModelName(fileName) {
    // Map common model filenames to their nodejs-whisper model names
    const modelMap = {
      'ggml-tiny.bin': 'tiny',
      'ggml-tiny.en.bin': 'tiny.en',
      'ggml-base.bin': 'base',
      'ggml-base.en.bin': 'base.en',
      'ggml-small.bin': 'small',
      'ggml-small.en.bin': 'small.en',
      'ggml-medium.bin': 'medium',
      'ggml-medium.en.bin': 'medium.en',
      'ggml-large.bin': 'large',
      'ggml-large-v1.bin': 'large-v1',
      'ggml-large-v3-turbo.bin': 'large-v3-turbo'
    };
    
    return modelMap[fileName] || null;
  }

  isValidModelFile(modelPath) {
    try {
      if (!fs.existsSync(modelPath)) {
        return false;
      }
      
      const stats = fs.statSync(modelPath);
      
      // Check if it's a file and has a reasonable size (Whisper models are typically > 1MB)
      if (!stats.isFile() || stats.size < 1024 * 1024) {
        return false;
      }
      
      // Check file extension
      if (!modelPath.endsWith('.bin')) {
        return false;
      }
      
      // Basic binary file check - read first few bytes to ensure it's not a text file
      const buffer = Buffer.alloc(16);
      const fd = fs.openSync(modelPath, 'r');
      fs.readSync(fd, buffer, 0, 16, 0);
      fs.closeSync(fd);
      
      // Check for common text file indicators (should be binary data)
      const text = buffer.toString('utf8');
      if (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('HTTP/')) {
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error validating model file:', error.message);
      return false;
    }
  }

  async autoDownloadModel(modelName, targetPath) {
    try {
      console.log(`Downloading model: ${modelName}...`);
      
      // Create target directory if it doesn't exist
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        console.log(`Created directory: ${targetDir}`);
      }

      // Use nodejs-whisper's auto-download with the model name
      const result = await nodewhisper('dummy.wav', {
        autoDownloadModelName: modelName,
        withCuda: false
      }).catch(() => {
        // This will fail because dummy.wav doesn't exist, but the model will be downloaded
        console.log('Model download completed (expected transcription error ignored)');
      });

      // Check if model was downloaded to nodejs-whisper's default location
      const nodejsWhisperModelsDir = path.join(__dirname, '../../node_modules/nodejs-whisper/cpp/whisper.cpp/models');
      const downloadedModelPath = path.join(nodejsWhisperModelsDir, `ggml-${modelName}.bin`);
      
      if (fs.existsSync(downloadedModelPath)) {
        // Copy the model to our target location
        fs.copyFileSync(downloadedModelPath, targetPath);
        console.log(`Model copied to: ${targetPath}`);
        
        // Update environment variable for future use
        process.env.WHISPER_MODEL_PATH = targetPath;
        console.log(`Updated WHISPER_MODEL_PATH to: ${targetPath}`);
      } else {
        throw new Error(`Model download failed: ${downloadedModelPath} not found`);
      }
      
    } catch (error) {
      console.error('Auto-download failed:', error.message);
      throw new Error(`Failed to auto-download model ${modelName}: ${error.message}`);
    }
  }

  async transcribeAudio(filePath, options = {}) {
    if (!this.whisper || !this.modelPath) {
      throw new Error('Whisper not initialized');
    }

    const startTime = Date.now();
    
    try {
      // Call nodewhisper with the audio file and model path correctly
      const result = await this.whisper(filePath, {
        modelName: this.modelPath,
        language: options.language || 'auto',
        translate: options.translate || false,
        word_timestamps: options.wordTimestamps !== false,
        verbose: false,
        removeWavFileAfterTranscription: false,
        withCuda: false,
        whisperOptions: {
          gen_file_txt: false,
          gen_file_subtitle: false,
          gen_file_vtt: false,
          word_timestamps: true
        },
        ...options.whisperOptions
      });

      const processingTime = Math.ceil((Date.now() - startTime) / 1000);
      
      return {
        text: result,
        processingTime,
        metadata: {
          language: options.language || 'auto',
          duration: processingTime,
          filePath
        }
      };
    } catch (error) {
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  async cleanup(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.warn(`Failed to cleanup file ${filePath}:`, error.message);
    }
  }
}

const worker = new TranscriptionWorker();

parentPort?.on('message', async (message) => {
  const { type, jobId, filePath, options } = message;
  
  if (type === 'transcribe') {
    try {
      const result = await worker.transcribeAudio(filePath, options);
      
      parentPort?.postMessage({
        type: 'complete',
        jobId,
        result,
        processingTime: result.processingTime
      });

      if (options.cleanup !== false) {
        await worker.cleanup(filePath);
      }
    } catch (error) {
      parentPort?.postMessage({
        type: 'error',
        jobId,
        error: error.message
      });
    }
  }
});