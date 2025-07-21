#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}[WhisperAPI] ${message}${colors.reset}`);
}

function checkEnvironmentFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    log('yellow', 'No .env file found, skipping model auto-download setup');
    return { modelName: null, whisperEngine: 'whisper.cpp' };
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const autoDownloadMatch = envContent.match(/^AUTO_DOWNLOAD_MODEL=(.+)$/m);
  const whisperEngineMatch = envContent.match(/^WHISPER_ENGINE=(.+)$/m);
  
  const modelName = autoDownloadMatch && autoDownloadMatch[1] ? autoDownloadMatch[1].trim() : null;
  const whisperEngine = whisperEngineMatch && whisperEngineMatch[1] ? whisperEngineMatch[1].trim() : 'whisper.cpp';

  if (!modelName) {
    log('yellow', 'AUTO_DOWNLOAD_MODEL not set in .env, skipping model auto-download');
  }

  return { modelName, whisperEngine };
}

function checkWhisperCppSetup() {
  const whisperCppPath = path.join(process.cwd(), 'node_modules', 'nodejs-whisper', 'cpp', 'whisper.cpp');
  const buildPath = path.join(whisperCppPath, 'build');
  const binaryPath = path.join(buildPath, 'bin', 'whisper-cli');

  log('blue', 'Checking Whisper.cpp setup...');

  if (!fs.existsSync(whisperCppPath)) {
    log('red', 'Whisper.cpp not found in node_modules. Please reinstall nodejs-whisper.');
    return false;
  }

  if (!fs.existsSync(binaryPath)) {
    log('yellow', 'Whisper binary not found. Building Whisper.cpp...');
    try {
      process.chdir(whisperCppPath);
      
      // Build whisper.cpp
      log('blue', 'Configuring CMake build...');
      execSync('cmake -B build', { stdio: 'inherit' });
      
      log('blue', 'Building Whisper.cpp...');
      execSync('cmake --build build --config Release', { stdio: 'inherit' });
      
      if (fs.existsSync(binaryPath)) {
        log('green', 'Whisper.cpp built successfully!');
      } else {
        log('red', 'Build completed but binary not found');
        return false;
      }
    } catch (error) {
      log('red', `Failed to build Whisper.cpp: ${error.message}`);
      return false;
    } finally {
      process.chdir(process.cwd());
    }
  } else {
    log('green', 'Whisper binary already exists');
  }

  return true;
}

function downloadModel(modelName) {
  const whisperCppPath = path.join(process.cwd(), 'node_modules', 'nodejs-whisper', 'cpp', 'whisper.cpp');
  const modelsPath = path.join(whisperCppPath, 'models');
  
  // Model mapping
  const modelFiles = {
    'tiny': 'ggml-tiny.bin',
    'tiny.en': 'ggml-tiny.en.bin',
    'base': 'ggml-base.bin',
    'base.en': 'ggml-base.en.bin',
    'small': 'ggml-small.bin',
    'small.en': 'ggml-small.en.bin',
    'medium': 'ggml-medium.bin',
    'medium.en': 'ggml-medium.en.bin',
    'large-v3-turbo': 'ggml-large-v3-turbo.bin'
  };

  const modelFile = modelFiles[modelName];
  if (!modelFile) {
    log('red', `Unknown model: ${modelName}`);
    log('yellow', `Available models: ${Object.keys(modelFiles).join(', ')}`);
    return false;
  }

  const modelPath = path.join(modelsPath, modelFile);
  
  // Check if model already exists
  if (fs.existsSync(modelPath)) {
    log('green', `Model ${modelName} already exists at ${modelPath}`);
    return true;
  }

  log('blue', `Downloading model: ${modelName}...`);
  
  try {
    // Ensure models directory exists
    if (!fs.existsSync(modelsPath)) {
      fs.mkdirSync(modelsPath, { recursive: true });
    }

    // Change to models directory
    process.chdir(modelsPath);

    // Determine script based on platform
    let downloadScript = './download-ggml-model.sh';
    if (process.platform === 'win32') {
      downloadScript = 'download-ggml-model.cmd';
    }

    // Make script executable on Unix systems
    if (process.platform !== 'win32') {
      try {
        execSync(`chmod +x ${downloadScript}`, { stdio: 'inherit' });
      } catch (error) {
        log('yellow', `Warning: Could not make script executable: ${error.message}`);
      }
    }

    // Download model
    log('blue', `Executing: ${downloadScript} ${modelName}`);
    execSync(`${downloadScript} ${modelName}`, { 
      stdio: 'inherit',
      timeout: 600000 // 10 minutes timeout
    });

    // Verify download
    if (fs.existsSync(modelPath)) {
      log('green', `Model ${modelName} downloaded successfully to ${modelPath}`);
      return true;
    } else {
      log('red', `Model download completed but file not found: ${modelPath}`);
      return false;
    }

  } catch (error) {
    log('red', `Failed to download model ${modelName}: ${error.message}`);
    return false;
  } finally {
    process.chdir(process.cwd());
  }
}

function checkPythonAndFasterWhisper() {
  log('blue', 'Checking Python and faster-whisper setup...');

  try {
    // Check if Python 3 is available
    execSync('python3 --version', { stdio: 'pipe' });
    log('green', 'Python 3 is available');
  } catch (error) {
    log('red', 'Python 3 not found. Please install Python 3.9 or higher for faster-whisper support.');
    return false;
  }

  try {
    // Check if faster-whisper is installed
    execSync('python3 -c "import faster_whisper; print(faster_whisper.__version__)"', { stdio: 'pipe' });
    log('green', 'faster-whisper is already installed');
    return true;
  } catch (error) {
    log('yellow', 'faster-whisper not found. Installing...');
    
    try {
      log('blue', 'Installing faster-whisper via pip...');
      execSync('python3 -m pip install faster-whisper', { stdio: 'inherit' });
      log('green', 'faster-whisper installed successfully!');
      return true;
    } catch (installError) {
      log('red', `Failed to install faster-whisper: ${installError.message}`);
      log('yellow', 'You can manually install it with: pip install faster-whisper');
      return false;
    }
  }
}

function main() {
  log('cyan', 'WhisperAPI Post-Install Setup');
  log('cyan', '============================');

  // Check if we're in a CI environment
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
    log('yellow', 'CI environment detected, skipping model setup');
    return;
  }

  // Store original directory
  const originalDir = process.cwd();

  try {
    // Check environment configuration
    const { modelName, whisperEngine } = checkEnvironmentFile();
    
    log('blue', `Configured whisper engine: ${whisperEngine}`);
    if (modelName) {
      log('blue', `Configured model: ${modelName}`);
    }

    // Setup based on the selected engine
    if (whisperEngine === 'faster-whisper') {
      log('blue', 'Setting up faster-whisper engine...');
      
      if (!checkPythonAndFasterWhisper()) {
        log('red', 'Failed to setup faster-whisper. You can still use whisper.cpp by setting WHISPER_ENGINE=whisper.cpp in .env');
        process.exit(1);
      }
      
      log('green', 'faster-whisper setup completed successfully!');
    } else {
      log('blue', 'Setting up whisper.cpp engine...');
      
      // Check and setup Whisper.cpp
      if (!checkWhisperCppSetup()) {
        log('red', 'Failed to setup Whisper.cpp');
        process.exit(1);
      }

      // Download model if needed (only for whisper.cpp)
      if (modelName && !downloadModel(modelName)) {
        log('red', 'Failed to download model');
        process.exit(1);
      }
      
      log('green', 'whisper.cpp setup completed successfully!');
    }

    log('green', 'WhisperAPI setup completed successfully!');
    log('cyan', 'You can now start the API with: npm start');

  } catch (error) {
    log('red', `Setup failed: ${error.message}`);
    process.exit(1);
  } finally {
    // Always return to original directory
    process.chdir(originalDir);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { main, checkEnvironmentFile, checkWhisperCppSetup, downloadModel, checkPythonAndFasterWhisper };