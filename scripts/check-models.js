#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

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
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function checkModels() {
  const whisperCppPath = path.join(process.cwd(), 'node_modules', 'nodejs-whisper', 'cpp', 'whisper.cpp');
  const modelsPath = path.join(whisperCppPath, 'models');
  const binaryPath = path.join(whisperCppPath, 'build', 'bin', 'whisper-cli');

  log('cyan', 'WhisperAPI Model Status Check');
  log('cyan', '============================');

  // Check environment configuration
  const envPath = path.join(process.cwd(), '.env');
  let configuredModel = 'not configured';
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const autoDownloadMatch = envContent.match(/^AUTO_DOWNLOAD_MODEL=(.+)$/m);
    const modelPathMatch = envContent.match(/^WHISPER_MODEL_PATH=(.+)$/m);
    
    if (autoDownloadMatch && autoDownloadMatch[1]) {
      configuredModel = autoDownloadMatch[1].trim();
    } else if (modelPathMatch && modelPathMatch[1]) {
      configuredModel = `custom path: ${modelPathMatch[1].trim()}`;
    }
  }

  console.log(`\n📋 Configuration:`);
  console.log(`   AUTO_DOWNLOAD_MODEL: ${configuredModel}`);

  // Check Whisper.cpp binary
  console.log(`\n🔧 Whisper.cpp Status:`);
  if (fs.existsSync(binaryPath)) {
    log('green', `   ✅ Binary: ${binaryPath}`);
  } else {
    log('red', `   ❌ Binary not found: ${binaryPath}`);
    log('yellow', `   💡 Run 'npm run setup' to build Whisper.cpp`);
  }

  // Check models directory
  console.log(`\n📁 Models Directory: ${modelsPath}`);
  
  if (!fs.existsSync(modelsPath)) {
    log('red', '   ❌ Models directory not found');
    return;
  }

  // List all model files
  const modelFiles = fs.readdirSync(modelsPath)
    .filter(file => file.endsWith('.bin'))
    .sort();

  if (modelFiles.length === 0) {
    log('yellow', '   ⚠️  No model files found');
    log('blue', '   💡 Available models: tiny, base, small, medium, large, large-v1, large-v2, large-v3, large-v3-turbo');
    log('blue', '   💡 Set AUTO_DOWNLOAD_MODEL in .env and run: npm run setup');
  } else {
    console.log(`   📊 Found ${modelFiles.length} model(s):`);
    
    modelFiles.forEach(file => {
      const filePath = path.join(modelsPath, file);
      const stats = fs.statSync(filePath);
      const size = formatBytes(stats.size);
      const modelName = file.replace('ggml-', '').replace('.bin', '');
      
      // Check if this is the configured model
      let status = '';
      if (configuredModel === modelName) {
        status = colors.green + ' (configured)' + colors.reset;
      }
      
      console.log(`     • ${file} - ${size}${status}`);
    });
  }

  // Check for download script
  const downloadScript = path.join(modelsPath, 'download-ggml-model.sh');
  const downloadScriptWin = path.join(modelsPath, 'download-ggml-model.cmd');
  
  console.log(`\n🔽 Download Scripts:`);
  if (fs.existsSync(downloadScript)) {
    log('green', `   ✅ Unix script: download-ggml-model.sh`);
  } else {
    log('red', `   ❌ Unix script not found`);
  }
  
  if (fs.existsSync(downloadScriptWin)) {
    log('green', `   ✅ Windows script: download-ggml-model.cmd`);
  } else {
    log('red', `   ❌ Windows script not found`);
  }

  // Summary and recommendations
  console.log(`\n💡 Recommendations:`);
  
  if (!fs.existsSync(binaryPath)) {
    log('yellow', '   • Run "npm run setup" to build Whisper.cpp');
  }
  
  if (modelFiles.length === 0) {
    log('yellow', '   • Set AUTO_DOWNLOAD_MODEL in .env file');
    log('yellow', '   • Run "npm run setup:model" to download model');
  }
  
  if (fs.existsSync(binaryPath) && modelFiles.length > 0) {
    log('green', '   • ✅ Setup complete! Ready to start API with "npm start"');
  }

  console.log('');
}

// Only run if this script is executed directly
if (require.main === module) {
  checkModels();
}

module.exports = { checkModels };