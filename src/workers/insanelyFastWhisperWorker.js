const { parentPort } = require('worker_threads');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const FFmpegValidator = require('../utils/ffmpegValidator');

class InsanelyFastWhisperWorker {
  constructor() {
    this.ffmpegValidator = new FFmpegValidator();
    this.init();
  }

  async init() {
    try {
      // Validate ffmpeg first
      console.log('[InsanelyFastWhisperWorker] Validating ffmpeg...');
      const ffmpegValidation = await this.ffmpegValidator.validateFFmpeg();
      
      if (!ffmpegValidation.success) {
        console.error('[InsanelyFastWhisperWorker] ffmpeg validation failed:', ffmpegValidation.message);
        if (ffmpegValidation.instructions) {
          console.log('[InsanelyFastWhisperWorker] Manual installation instructions:');
          console.log(ffmpegValidation.instructions);
        }
        throw new Error(`ffmpeg validation failed: ${ffmpegValidation.message}`);
      }
      
      console.log('[InsanelyFastWhisperWorker] ffmpeg validation successful');
      
      // Test ffmpeg functionality
      const functionalityTest = await this.ffmpegValidator.testFFmpegFunctionality();
      if (!functionalityTest) {
        throw new Error('ffmpeg functionality test failed');
      }

      this.modelName = process.env.INSANELY_FAST_WHISPER_MODEL || 'openai/whisper-large-v3-turbo';
      this.device = process.env.INSANELY_FAST_WHISPER_DEVICE || 'auto';
      this.torchDtype = process.env.INSANELY_FAST_WHISPER_TORCH_DTYPE || 'auto';
      this.batchSize = parseInt(process.env.INSANELY_FAST_WHISPER_BATCH_SIZE) || 24;
      this.chunkLengthS = parseInt(process.env.INSANELY_FAST_WHISPER_CHUNK_LENGTH_S) || 30;
      this.pythonBridge = path.join(process.cwd(), 'scripts', 'insanely_fast_whisper_bridge.py');
      
      // Validate Python and dependencies installation
      await this.validatePythonSetup();
      
      console.log(`[InsanelyFastWhisperWorker] Initialized with model: ${this.modelName}, device: ${this.device}, torch_dtype: ${this.torchDtype}`);
    } catch (error) {
      console.error('Failed to initialize InsanelyFastWhisper worker:', error.message);
      parentPort?.postMessage({
        type: 'error',
        error: `InsanelyFastWhisper initialization failed: ${error.message}`
      });
    }
  }

  async validatePythonSetup() {
    // Check if Python bridge script exists
    if (!fs.existsSync(this.pythonBridge)) {
      throw new Error(`Python bridge script not found: ${this.pythonBridge}`);
    }

    // Test Python and required dependencies availability
    return new Promise((resolve, reject) => {
      const pythonPath = path.join(process.cwd(), 'venv', 'bin', 'python3');
      const pythonCommand = fs.existsSync(pythonPath) ? pythonPath : 'python3';
      const pythonTest = spawn(pythonCommand, ['-c', 'import torch, transformers, librosa; print("OK")']);
      let stdout = '';
      let stderr = '';

      pythonTest.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonTest.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonTest.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python/dependencies validation failed: ${stderr.trim()}. Please install: pip install torch transformers librosa numpy`));
          return;
        }
        
        if (stdout.trim() === 'OK') {
          resolve(true);
        } else {
          reject(new Error('Unexpected Python validation response'));
        }
      });

      pythonTest.on('error', (error) => {
        reject(new Error(`Failed to start Python: ${error.message}. Please ensure Python 3 is installed and accessible.`));
      });
    });
  }

  async transcribeAudio(filePath, options = {}) {
    if (!this.pythonBridge) {
      throw new Error('InsanelyFastWhisper not initialized');
    }

    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    const startTime = Date.now();
    let convertedFilePath = filePath;
    
    try {
      // Convert to WAV if not already WAV (optional, transformers can handle various formats)
      if (!filePath.toLowerCase().endsWith('.wav') && !filePath.toLowerCase().endsWith('.mp3')) {
        convertedFilePath = await this.convertToWav(filePath);
      }

      const args = [
        this.pythonBridge,
        '--model', this.modelName,
        '--audio', convertedFilePath,
        '--device', this.device,
        '--torch_dtype', this.torchDtype,
        '--batch_size', this.batchSize.toString(),
        '--chunk_length_s', this.chunkLengthS.toString()
      ];

      // Add language if specified
      if (options.language && options.language !== 'auto') {
        args.push('--language', options.language);
      }

      // Add translate option
      if (options.translate) {
        args.push('--translate');
      }

      // Add timestamps option
      if (options.wordTimestamps !== false) {
        args.push('--return_timestamps');
      }

      const result = await this.runPythonCommand(args);
      const processingTime = Math.ceil((Date.now() - startTime) / 1000);
      
      return {
        text: result.text.trim(),
        language: result.language,
        processingTime,
        words: result.words || [],
        chunks: result.chunks || [],
        metadata: {
          language_probability: result.language_probability,
          duration: result.duration,
          engine: 'insanely-fast-whisper',
          model: this.modelName,
          device: this.device,
          batch_size: this.batchSize,
          chunk_length_s: this.chunkLengthS
        }
      };
    } catch (error) {
      throw new Error(`InsanelyFastWhisper transcription failed: ${error.message}`);
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
    // Check ffmpeg validation status
    const ffmpegStatus = this.ffmpegValidator.getStatus();
    if (!ffmpegStatus.isValidated) {
      throw new Error('ffmpeg not validated. Please ensure ffmpeg is properly installed and functional.');
    }

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
          reject(new Error(`FFmpeg conversion failed with code ${code}: ${stderr}. Please ensure ffmpeg is properly installed and functional.`));
          return;
        }
        resolve(outputPath);
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`Failed to start FFmpeg: ${error.message}. Please ensure ffmpeg is properly installed and accessible.`));
      });
    });
  }

  runPythonCommand(args) {
    return new Promise((resolve, reject) => {
      const pythonPath = path.join(process.cwd(), 'venv', 'bin', 'python3');
      const pythonCommand = fs.existsSync(pythonPath) ? pythonPath : 'python3';
      const pythonProcess = spawn(pythonCommand, args);
      let stdout = '';
      let stderr = '';
      let isResolved = false;

      // Set up timeout for Python process (5 minutes)
      const processTimeout = setTimeout(() => {
        if (!isResolved) {
          pythonProcess.kill('SIGTERM');
          isResolved = true;
          reject(new Error('Python transcription process timed out after 5 minutes'));
        }
      }, 300000);

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        clearTimeout(processTimeout);
        if (isResolved) return;
        isResolved = true;

        if (code !== 0) {
          reject(new Error(`Python process failed with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          
          if (result.error) {
            reject(new Error(result.error));
            return;
          }

          console.log('[InsanelyFastWhisperWorker] Transcription result:', {
            text_length: result.text ? result.text.length : 0,
            language: result.language,
            duration: result.duration,
            words_count: result.words ? result.words.length : 0,
            chunks_count: result.chunks ? result.chunks.length : 0
          });

          // Validate that we actually got some transcription text
          if (!result.text || result.text.length === 0) {
            reject(new Error(`No transcription text extracted from insanely-fast-whisper. Raw output: ${stdout}`));
            return;
          }
          
          resolve(result);
        } catch (parseError) {
          reject(new Error(`Failed to parse insanely-fast-whisper output: ${parseError.message}. Raw output: ${stdout}. Stderr: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        clearTimeout(processTimeout);
        if (isResolved) return;
        isResolved = true;
        reject(new Error(`Failed to start Python process: ${error.message}`));
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

const worker = new InsanelyFastWhisperWorker();

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