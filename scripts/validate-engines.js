#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
require('dotenv').config();

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
  console.log(`${colors[color]}[EngineValidator] ${message}${colors.reset}`);
}

function validateEnvironmentConfig() {
  log('blue', 'Validating environment configuration...');
  
  const whisperEngine = process.env.WHISPER_ENGINE || 'whisper.cpp';
  const autoDownloadModel = process.env.AUTO_DOWNLOAD_MODEL;
  
  log('cyan', `Current WHISPER_ENGINE: ${whisperEngine}`);
  log('cyan', `Current AUTO_DOWNLOAD_MODEL: ${autoDownloadModel || 'not set'}`);
  
  if (whisperEngine === 'faster-whisper') {
    const device = process.env.FASTER_WHISPER_DEVICE || 'cpu';
    const computeType = process.env.FASTER_WHISPER_COMPUTE_TYPE || 'int8';
    log('cyan', `faster-whisper device: ${device}`);
    log('cyan', `faster-whisper compute_type: ${computeType}`);
  }
  
  return { whisperEngine, autoDownloadModel };
}

function validateWorkerFiles() {
  log('blue', 'Validating worker files...');
  
  const transcriptionWorkerPath = path.join(__dirname, '../src/workers/transcriptionWorker.js');
  const fasterWhisperWorkerPath = path.join(__dirname, '../src/workers/fasterWhisperWorker.js');
  const pythonBridgePath = path.join(__dirname, 'faster_whisper_bridge.py');
  
  const issues = [];
  
  if (!fs.existsSync(transcriptionWorkerPath)) {
    issues.push('transcriptionWorker.js not found');
  } else {
    log('green', 'transcriptionWorker.js found');
  }
  
  if (!fs.existsSync(fasterWhisperWorkerPath)) {
    issues.push('fasterWhisperWorker.js not found');
  } else {
    log('green', 'fasterWhisperWorker.js found');
  }
  
  if (!fs.existsSync(pythonBridgePath)) {
    issues.push('faster_whisper_bridge.py not found');
  } else {
    log('green', 'faster_whisper_bridge.py found');
  }
  
  return issues;
}

function validateWhisperCppSetup() {
  log('blue', 'Validating whisper.cpp setup...');
  
  const whisperCppPath = path.join(process.cwd(), 'node_modules', 'nodejs-whisper', 'cpp', 'whisper.cpp');
  const binaryPath = path.join(whisperCppPath, 'build', 'bin', 'whisper-cli');
  
  const issues = [];
  
  if (!fs.existsSync(whisperCppPath)) {
    issues.push('whisper.cpp directory not found');
  } else {
    log('green', 'whisper.cpp directory found');
  }
  
  if (!fs.existsSync(binaryPath)) {
    issues.push('whisper-cli binary not found - run postinstall to build');
  } else {
    log('green', 'whisper-cli binary found');
  }
  
  // Check for models
  const modelsPath = path.join(whisperCppPath, 'models');
  if (fs.existsSync(modelsPath)) {
    const modelFiles = fs.readdirSync(modelsPath).filter(f => f.endsWith('.bin'));
    if (modelFiles.length > 0) {
      log('green', `Found ${modelFiles.length} model file(s): ${modelFiles.join(', ')}`);
    } else {
      issues.push('No model files found in models directory');
    }
  } else {
    issues.push('Models directory not found');
  }
  
  return issues;
}

async function validateFasterWhisperSetup() {
  log('blue', 'Validating faster-whisper setup...');
  
  const { spawn } = require('child_process');
  
  return new Promise((resolve) => {
    const issues = [];
    
    // Test Python availability
    const pythonPath = path.join(process.cwd(), 'venv', 'bin', 'python3');
    const pythonCommand = fs.existsSync(pythonPath) ? pythonPath : 'python3';
    const pythonTest = spawn(pythonCommand, ['--version']);
    
    pythonTest.on('close', (code) => {
      if (code !== 0) {
        issues.push('Python 3 not found');
        resolve(issues);
        return;
      }
      
      log('green', 'Python 3 found');
      
      // Test faster-whisper availability
      const fasterWhisperTest = spawn(pythonCommand, ['-c', 'import faster_whisper; print(faster_whisper.__version__)']);
      let stdout = '';
      
      fasterWhisperTest.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      fasterWhisperTest.on('close', (code) => {
        if (code !== 0) {
          issues.push('faster-whisper not installed - run: pip install faster-whisper');
        } else {
          log('green', `faster-whisper found (version: ${stdout.trim()})`);
        }
        resolve(issues);
      });
    });
    
    pythonTest.on('error', () => {
      issues.push('Python 3 not found');
      resolve(issues);
    });
  });
}

async function main() {
  log('cyan', 'WhisperAPI Engine Validation');
  log('cyan', '============================');
  
  try {
    const config = validateEnvironmentConfig();
    const workerIssues = validateWorkerFiles();
    
    let engineIssues = [];
    
    if (config.whisperEngine === 'faster-whisper') {
      log('blue', 'Validating faster-whisper engine...');
      engineIssues = await validateFasterWhisperSetup();
    } else {
      log('blue', 'Validating whisper.cpp engine...');
      engineIssues = validateWhisperCppSetup();
    }
    
    const allIssues = [...workerIssues, ...engineIssues];
    
    if (allIssues.length === 0) {
      log('green', 'All validations passed! Your setup is ready.');
      log('cyan', 'You can start the API with: npm start');
    } else {
      log('red', 'Validation issues found:');
      allIssues.forEach(issue => log('red', `  - ${issue}`));
      log('yellow', 'Please fix these issues before starting the API.');
      process.exit(1);
    }
    
  } catch (error) {
    log('red', `Validation failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateEnvironmentConfig, validateWorkerFiles, validateWhisperCppSetup, validateFasterWhisperSetup };