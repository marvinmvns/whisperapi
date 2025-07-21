const { parentPort } = require('worker_threads');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const FFmpegValidator = require('../utils/ffmpegValidator');

class FasterWhisperWorker {
  constructor() {
    this.ffmpegValidator = new FFmpegValidator();
    this.init();
  }

  async init() {
    try {
      // Validate ffmpeg first
      console.log('[FasterWhisperWorker] Validating ffmpeg...');
      const ffmpegValidation = await this.ffmpegValidator.validateFFmpeg();
      
      if (!ffmpegValidation.success) {
        console.error('[FasterWhisperWorker] ffmpeg validation failed:', ffmpegValidation.message);
        if (ffmpegValidation.instructions) {
          console.log('[FasterWhisperWorker] Manual installation instructions:');
          console.log(ffmpegValidation.instructions);
        }
        throw new Error(`ffmpeg validation failed: ${ffmpegValidation.message}`);
      }
      
      console.log('[FasterWhisperWorker] ffmpeg validation successful');
      
      // Test ffmpeg functionality
      const functionalityTest = await this.ffmpegValidator.testFFmpegFunctionality();
      if (!functionalityTest) {
        throw new Error('ffmpeg functionality test failed');
      }

      this.modelName = process.env.AUTO_DOWNLOAD_MODEL || 'large-v3-turbo';
      this.device = process.env.FASTER_WHISPER_DEVICE || 'cpu';
      this.computeType = process.env.FASTER_WHISPER_COMPUTE_TYPE || 'int8';
      this.pythonBridge = path.join(process.cwd(), 'scripts', 'faster_whisper_bridge.py');
      
      // Validate Python and faster-whisper installation
      await this.validatePythonSetup();
      
      console.log(`[FasterWhisperWorker] Initialized with model: ${this.modelName}, device: ${this.device}, compute_type: ${this.computeType}`);
    } catch (error) {
      console.error('Failed to initialize FasterWhisper worker:', error.message);
      parentPort?.postMessage({
        type: 'error',
        error: `FasterWhisper initialization failed: ${error.message}`
      });
    }
  }

  async validatePythonSetup() {
    // Check if Python bridge script exists
    if (!fs.existsSync(this.pythonBridge)) {
      throw new Error(`Python bridge script not found: ${this.pythonBridge}`);
    }

    // Test Python and faster-whisper availability
    return new Promise((resolve, reject) => {
      const pythonPath = path.join(process.cwd(), 'venv', 'bin', 'python3');
      const pythonCommand = fs.existsSync(pythonPath) ? pythonPath : 'python3';
      const pythonTest = spawn(pythonCommand, ['-c', 'import faster_whisper; print("OK")']);
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
          reject(new Error(`Python/faster-whisper validation failed: ${stderr.trim()}. Please install faster-whisper: pip install faster-whisper`));
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
      throw new Error('FasterWhisper not initialized');
    }

    const startTime = Date.now();
    let convertedFilePath = filePath;
    
    try {
      // Convert to WAV if not already WAV
      if (!filePath.toLowerCase().endsWith('.wav')) {
        convertedFilePath = await this.convertToWav(filePath);
      }

      const args = [
        this.pythonBridge,
        '--model', this.modelName,
        '--audio', convertedFilePath,
        '--device', this.device,
        '--compute_type', this.computeType
      ];

      // Add language if specified
      if (options.language && options.language !== 'auto') {
        args.push('--language', options.language);
      }

      // Add translate option
      if (options.translate) {
        args.push('--translate');
      }

      const result = await this.runPythonCommand(args);
      const processingTime = Math.ceil((Date.now() - startTime) / 1000);
      
      return {
        text: result.text.trim(),
        language: result.language,
        processingTime,
        words: result.words || [],
        metadata: {
          language_probability: result.language_probability,
          duration: result.duration,
          engine: 'faster-whisper'
        }
      };
    } catch (error) {
      throw new Error(`FasterWhisper transcription failed: ${error.message}`);
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

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
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

          console.log('[FasterWhisperWorker] Transcription result:', {
            text_length: result.text ? result.text.length : 0,
            language: result.language,
            duration: result.duration,
            words_count: result.words ? result.words.length : 0
          });

          // Validate that we actually got some transcription text
          if (!result.text || result.text.length === 0) {
            reject(new Error(`No transcription text extracted from faster-whisper. Raw output: ${stdout}`));
            return;
          }
          
          resolve(result);
        } catch (parseError) {
          reject(new Error(`Failed to parse faster-whisper output: ${parseError.message}. Raw output: ${stdout}. Stderr: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
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

const worker = new FasterWhisperWorker();

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