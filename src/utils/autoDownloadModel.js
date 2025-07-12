const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

const MODEL_OBJECT = {
  'tiny': 'ggml-tiny.bin',
  'tiny.en': 'ggml-tiny.en.bin',
  'base': 'ggml-base.bin',
  'base.en': 'ggml-base.en.bin',
  'small': 'ggml-small.bin',
  'small.en': 'ggml-small.en.bin',
  'medium': 'ggml-medium.bin',
  'medium.en': 'ggml-medium.en.bin',
  'large': 'ggml-large.bin',
  'large-v1': 'ggml-large-v1.bin',
  'large-v2': 'ggml-large-v2.bin',
  'large-v3': 'ggml-large-v3.bin',
  'large-v3-turbo': 'ggml-large-v3-turbo.bin'
};

const MODELS_LIST = Object.keys(MODEL_OBJECT);

const WHISPER_CPP_PATH = path.join(process.cwd(), 'node_modules', 'nodejs-whisper', 'cpp', 'whisper.cpp');

async function autoDownloadModel(autoDownloadModelName, withCuda = false) {
  const projectDir = process.cwd();

  if (!autoDownloadModelName) {
    throw new Error('[WhisperAPI] Error: Model name must be provided.');
  }

  if (!MODELS_LIST.includes(autoDownloadModelName)) {
    throw new Error(`[WhisperAPI] Error: Provide a valid model name. Available: ${MODELS_LIST.join(', ')}`);
  }

  try {
    const modelDirectory = path.join(WHISPER_CPP_PATH, 'models');
    const modelFileName = MODEL_OBJECT[autoDownloadModelName];
    const modelFilePath = path.join(modelDirectory, modelFileName);

    // Check if model already exists
    if (fs.existsSync(modelFilePath)) {
      console.log(`[WhisperAPI] ${autoDownloadModelName} already exists at ${modelFilePath}. Skipping download.`);
      return { success: true, message: 'Model already exists. Skipping download.', modelPath: modelFilePath };
    }

    console.log(`[WhisperAPI] Auto-downloading Model: ${autoDownloadModelName}`);

    // Ensure models directory exists
    if (!fs.existsSync(modelDirectory)) {
      fs.mkdirSync(modelDirectory, { recursive: true });
    }

    // Change to models directory
    process.chdir(modelDirectory);

    // Determine script path based on platform
    let scriptPath = './download-ggml-model.sh';
    if (process.platform === 'win32') {
      scriptPath = 'download-ggml-model.cmd';
    }

    // Make script executable on Unix systems
    if (process.platform !== 'win32') {
      try {
        execSync(`chmod +x ${scriptPath}`, { stdio: 'inherit' });
      } catch (error) {
        console.warn(`[WhisperAPI] Warning: Could not make ${scriptPath} executable:`, error.message);
      }
    }

    // Execute download script
    console.log(`[WhisperAPI] Executing: ${scriptPath} ${autoDownloadModelName}`);
    execSync(`${scriptPath} ${autoDownloadModelName}`, { 
      stdio: 'inherit',
      timeout: 300000 // 5 minutes timeout
    });

    // Verify download
    if (!fs.existsSync(modelFilePath)) {
      throw new Error(`[WhisperAPI] Model file not found after download: ${modelFilePath}`);
    }

    console.log(`[WhisperAPI] Model downloaded successfully: ${modelFilePath}`);

    // Change back to whisper.cpp directory to build
    process.chdir(WHISPER_CPP_PATH);

    // Check if build directory exists, if not, build whisper.cpp
    const buildDir = path.join(WHISPER_CPP_PATH, 'build');
    const whisperBinary = path.join(buildDir, 'bin', 'whisper-cli');
    
    if (!fs.existsSync(whisperBinary)) {
      console.log('[WhisperAPI] Whisper binary not found. Building whisper.cpp...');
      
      // Configure CMake build
      console.log('[WhisperAPI] Configuring CMake build...');
      let configureCommand = 'cmake -B build';
      if (withCuda) {
        configureCommand += ' -DGGML_CUDA=1';
      }

      execSync(configureCommand, { stdio: 'inherit' });

      // Build the project
      console.log('[WhisperAPI] Building whisper.cpp...');
      const buildCommand = 'cmake --build build --config Release';
      execSync(buildCommand, { stdio: 'inherit' });

      // Verify build
      if (!fs.existsSync(whisperBinary)) {
        throw new Error(`[WhisperAPI] Whisper binary not found after build: ${whisperBinary}`);
      }

      console.log('[WhisperAPI] Whisper.cpp built successfully');
    }

    return { 
      success: true, 
      message: 'Model downloaded and built successfully', 
      modelPath: modelFilePath,
      binaryPath: whisperBinary
    };

  } catch (error) {
    console.error('[WhisperAPI] Error in autoDownloadModel:', error.message);
    process.chdir(projectDir);
    throw error;
  } finally {
    // Always return to project directory
    process.chdir(projectDir);
  }
}

module.exports = {
  autoDownloadModel,
  MODEL_OBJECT,
  MODELS_LIST,
  WHISPER_CPP_PATH
};