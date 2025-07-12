const { parentPort } = require('worker_threads');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { autoDownloadModel, MODEL_OBJECT } = require('../utils/autoDownloadModel');

class TranscriptionWorker {
  constructor() {
    this.init();
  }

  async init() {
    try {
      let modelPath = process.env.WHISPER_MODEL_PATH;
      let whisperBinary = process.env.WHISPER_BINARY || './node_modules/nodejs-whisper/cpp/whisper.cpp/build/bin/whisper-cli';
      
      // Auto-download model if needed
      const autoDownloadModelName = process.env.AUTO_DOWNLOAD_MODEL;
      if (autoDownloadModelName) {
        // Generate expected model path
        const expectedModelPath = `./node_modules/nodejs-whisper/cpp/whisper.cpp/models/${MODEL_OBJECT[autoDownloadModelName]}`;
        
        // Check if model exists, if not download it
        if (!fs.existsSync(expectedModelPath)) {
          console.log(`Model not found at ${expectedModelPath}, attempting auto-download of ${autoDownloadModelName}...`);
          try {
            const result = await autoDownloadModel(autoDownloadModelName);
            console.log(`Auto-download successful: ${result.message}`);
            modelPath = result.modelPath;
            if (result.binaryPath) {
              whisperBinary = result.binaryPath;
            }
          } catch (downloadError) {
            throw new Error(`Auto-download failed: ${downloadError.message}`);
          }
        } else {
          console.log(`Model already exists at ${expectedModelPath}`);
          modelPath = expectedModelPath;
        }
      }
      
      // Use default path if no model path set
      if (!modelPath) {
        modelPath = './node_modules/nodejs-whisper/cpp/whisper.cpp/models/ggml-large-v3-turbo.bin';
      }
      
      // Final validation that model exists
      if (!fs.existsSync(modelPath)) {
        throw new Error(`Model not found at ${modelPath}. Set AUTO_DOWNLOAD_MODEL environment variable to auto-download.`);
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

      // Note: --word-timestamps is not supported by this version of whisper-cli
      // Word timestamp functionality would need to be implemented using JSON output parsing

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
          // Parse whisper output - extract different versions of transcription
          const rawOutput = stdout.trim();
          
          console.log('Whisper raw output:', stdout);
          console.log('Whisper stderr output:', stderr);
          
          // If stdout is empty but no error code, check stderr for actual output
          let textToProcess = rawOutput;
          if (!textToProcess && stderr.trim()) {
            console.log('No stdout, checking stderr for transcription...');
            textToProcess = stderr.trim();
          }
          
          // Store raw output (complete unfiltered output)
          const rawText = textToProcess;
          
          // Process all lines to extract transcription content
          const lines = textToProcess.split('\n');
          const transcriptionContent = [];
          
          for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Skip empty lines
            if (!trimmedLine) continue;
            
            // Skip debug/system lines
            if (trimmedLine.includes('whisper_init_') || 
                trimmedLine.includes('load time') ||
                trimmedLine.includes('mel time') ||
                trimmedLine.includes('encode time') ||
                trimmedLine.includes('decode time') ||
                trimmedLine.includes('total time') ||
                trimmedLine.includes('fallbacks') ||
                trimmedLine.includes('system_info') ||
                trimmedLine.includes('sampling parameters') ||
                trimmedLine.includes('threads =') ||
                trimmedLine.includes('progress =') ||
                trimmedLine.includes('main: processing') ||
                trimmedLine.includes('whisper_print_timings') ||
                trimmedLine.startsWith('whisper_') ||
                trimmedLine.match(/^whisper_model_load:/) ||
                trimmedLine.match(/^whisper_init_state:/) ||
                trimmedLine.match(/^whisper_init_with_params_no_state:/) ||
                trimmedLine.match(/^\s*\d+\s*$/)) {
              continue;
            }
            
            // Extract text from timestamp lines
            const timestampMatch = trimmedLine.match(/^\[\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\]\s*(.+)$/);
            if (timestampMatch && timestampMatch[1].trim()) {
              // Extract the text part after the timestamp
              transcriptionContent.push(timestampMatch[1].trim());
            } else if (!trimmedLine.match(/^\[\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\]/)) {
              // If it's not a timestamp line and not empty, include it as is
              transcriptionContent.push(trimmedLine);
            }
          }
          
          const filteredText = transcriptionContent.join(' ').trim();
          
          // Create final clean text (additional processing for final output)
          const finalText = filteredText
            .replace(/\s+/g, ' ')  // Normalize whitespace
            .replace(/^\s+|\s+$/g, '')  // Trim
            .replace(/([.!?])\s*([.!?])+/g, '$1');  // Remove duplicate punctuation
          
          console.log('Raw text length:', rawText.length);
          console.log('Transcription content array:', transcriptionContent);
          console.log('Filtered text length:', filteredText.length);
          console.log('Final text length:', finalText.length);
          console.log('Final extracted text:', finalText);
          
          // Validate that we actually got some transcription text
          if (!finalText || finalText.length === 0) {
            reject(new Error(`No transcription text extracted from whisper output. Raw output: ${stdout}. Stderr: ${stderr}`));
            return;
          }
          
          resolve({
            text: finalText,
            rawText: rawText,
            filteredText: filteredText,
            language: 'detected'
          });
        } catch (parseError) {
          reject(new Error(`Failed to parse whisper output: ${parseError.message}. Raw output: ${stdout}. Stderr: ${stderr}`));
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