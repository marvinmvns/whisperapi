const { parentPort } = require('worker_threads');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class TranscriptionWorker {
  constructor() {
    this.init();
  }

  async init() {
    try {
      const modelPath = process.env.WHISPER_MODEL_PATH || './node_modules/nodejs-whisper/cpp/whisper.cpp/models/ggml-large-v3-turbo.bin';
      const whisperBinary = process.env.WHISPER_BINARY || './node_modules/nodejs-whisper/cpp/whisper.cpp/build/bin/whisper-cli';
      
      // Validate that the model file exists, auto-download if needed
      if (!fs.existsSync(modelPath)) {
        const autoDownloadModel = process.env.AUTO_DOWNLOAD_MODEL;
        if (autoDownloadModel) {
          console.log(`Model not found at ${modelPath}, attempting auto-download of ${autoDownloadModel}...`);
          try {
            await this.autoDownloadModel(autoDownloadModel, modelPath);
            console.log(`Auto-download successful, model available at ${modelPath}`);
          } catch (downloadError) {
            throw new Error(`Model not found at ${modelPath} and auto-download failed: ${downloadError.message}`);
          }
        } else {
          throw new Error(`Model not found at ${modelPath}`);
        }
      }

      // Validate whisper binary exists
      if (!fs.existsSync(whisperBinary)) {
        throw new Error(`Whisper binary not found at ${whisperBinary}. Please compile whisper.cpp first.`);
      }

      // Validate model file integrity
      if (!this.isValidModelFile(modelPath)) {
        throw new Error(`Invalid or corrupted model file: ${modelPath}`);
      }

      this.modelPath = modelPath;
      this.whisperBinary = whisperBinary;
      
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

      // Import nodejs-whisper for auto-download
      const { nodewhisper } = require('nodejs-whisper');

      // Use nodejs-whisper's auto-download with the model name
      await nodewhisper('dummy.wav', {
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
        console.log(`Model successfully downloaded to: ${downloadedModelPath}`);
        // Update the model path for this worker instance
        this.modelPath = downloadedModelPath;
      } else {
        throw new Error(`Model download failed: ${downloadedModelPath} not found`);
      }
      
    } catch (error) {
      console.error('Auto-download failed:', error.message);
      throw new Error(`Failed to auto-download model ${modelName}: ${error.message}`);
    }
  }

  async transcribeAudio(filePath, options = {}) {
    if (!this.modelPath || !this.whisperBinary) {
      throw new Error('Whisper not initialized');
    }

    const startTime = Date.now();
    let convertedFilePath = filePath;
    
    try {
      // Convert to WAV if not already WAV
      if (!filePath.toLowerCase().endsWith('.wav')) {
        convertedFilePath = await this.convertToWav(filePath);
      }

      const args = [
        '-m', this.modelPath,
        '-f', convertedFilePath
      ];

      // Add language if specified
      if (options.language && options.language !== 'auto') {
        args.push('-l', options.language);
      }

      // Add translate option
      if (options.translate) {
        args.push('--translate');
      }

      // Add word timestamps
      if (options.wordTimestamps !== false) {
        args.push('--max-len', '1');
      }

      const result = await this.runWhisperCommand(args);
      const processingTime = Math.ceil((Date.now() - startTime) / 1000);
      
      return {
        text: result.text.trim(),
        processingTime
      };
    } catch (error) {
      throw new Error(`Transcription failed: ${error.message}`);
    } finally {
      // Clean up converted file if it was created
      if (convertedFilePath !== filePath && fs.existsSync(convertedFilePath)) {
        try {
          fs.unlinkSync(convertedFilePath);
        } catch (cleanupError) {
          console.warn(`Failed to cleanup converted file: ${cleanupError.message}`);
        }
      }
    }
  }

  async convertToWav(inputPath) {
    const outputPath = inputPath.replace(/\.[^.]+$/, '.wav');
    
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-acodec', 'pcm_s16le',
        '-ac', '1',
        '-ar', '16000',
        '-y',
        outputPath
      ]);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg conversion failed with code ${code}: ${stderr}`));
          return;
        }
        resolve(outputPath);
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`Failed to start FFmpeg: ${error.message}`));
      });
    });
  }

  runWhisperCommand(args) {
    return new Promise((resolve, reject) => {
      const process = spawn(this.whisperBinary, args);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Whisper process failed with code ${code}: ${stderr}`));
          return;
        }

        try {
          // Parse whisper output - extract just the transcribed text
          let text = stdout.trim();
          
          // Remove whisper timing/debug info, keep only the transcription
          const lines = text.split('\n');
          const transcriptionLines = lines.filter(line => {
            // Filter out debug lines that contain timing info, model loading, etc.
            return !line.includes('whisper_') && 
                   !line.includes('load time') &&
                   !line.includes('mel time') &&
                   !line.includes('encode time') &&
                   !line.includes('decode time') &&
                   !line.includes('total time') &&
                   !line.includes('fallbacks') &&
                   line.trim().length > 0;
          });
          
          text = transcriptionLines.join(' ').trim();
          
          resolve({
            text,
            language: 'detected'
          });
        } catch (parseError) {
          reject(new Error(`Failed to parse whisper output: ${parseError.message}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to start whisper process: ${error.message}`));
      });
    });
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