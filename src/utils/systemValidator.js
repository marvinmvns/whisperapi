const FFmpegValidator = require('./ffmpegValidator');
const fs = require('fs');
const path = require('path');

class SystemValidator {
  constructor() {
    this.ffmpegValidator = new FFmpegValidator();
    this.validationResults = {};
  }

  async validateSystem() {
    console.log('[SystemValidator] Starting system validation...');
    
    const results = {
      ffmpeg: await this.validateFFmpeg(),
      whisperCpp: await this.validateWhisperCpp(),
      models: await this.validateModels(),
      permissions: await this.validatePermissions()
    };

    this.validationResults = results;
    
    const overallSuccess = Object.values(results).every(result => result.success);
    
    if (overallSuccess) {
      console.log('[SystemValidator] ✅ All system validations passed');
      return { success: true, message: 'System validation completed successfully', results };
    } else {
      console.log('[SystemValidator] ❌ Some system validations failed');
      return { success: false, message: 'System validation failed', results };
    }
  }

  async validateFFmpeg() {
    try {
      console.log('[SystemValidator] Validating ffmpeg...');
      const result = await this.ffmpegValidator.validateFFmpeg();
      
      if (result.success) {
        const functionalityTest = await this.ffmpegValidator.testFFmpegFunctionality();
        if (functionalityTest) {
          console.log('[SystemValidator] ✅ ffmpeg validation passed');
          return { success: true, message: 'ffmpeg is functional' };
        } else {
          console.log('[SystemValidator] ❌ ffmpeg functionality test failed');
          return { success: false, message: 'ffmpeg functionality test failed' };
        }
      } else {
        console.log('[SystemValidator] ❌ ffmpeg validation failed');
        return result;
      }
    } catch (error) {
      console.error('[SystemValidator] Error validating ffmpeg:', error.message);
      return { success: false, message: `ffmpeg validation error: ${error.message}` };
    }
  }

  async validateWhisperCpp() {
    try {
      console.log('[SystemValidator] Validating whisper.cpp...');
      
      const whisperCppPath = path.join(process.cwd(), 'node_modules', 'nodejs-whisper', 'cpp', 'whisper.cpp');
      const whisperBinary = path.join(whisperCppPath, 'build', 'bin', 'whisper-cli');
      
      if (!fs.existsSync(whisperCppPath)) {
        console.log('[SystemValidator] ❌ whisper.cpp directory not found');
        return { 
          success: false, 
          message: 'whisper.cpp directory not found. Please install nodejs-whisper dependency.',
          instructions: 'Run: npm install nodejs-whisper'
        };
      }

      if (!fs.existsSync(whisperBinary)) {
        console.log('[SystemValidator] ❌ whisper-cli binary not found');
        return { 
          success: false, 
          message: 'whisper-cli binary not found. Please build whisper.cpp.',
          instructions: `
To build whisper.cpp:
1. cd ${whisperCppPath}
2. cmake -B build
3. cmake --build build --config Release
          `
        };
      }

      console.log('[SystemValidator] ✅ whisper.cpp validation passed');
      return { success: true, message: 'whisper.cpp is available' };
    } catch (error) {
      console.error('[SystemValidator] Error validating whisper.cpp:', error.message);
      return { success: false, message: `whisper.cpp validation error: ${error.message}` };
    }
  }

  async validateModels() {
    try {
      console.log('[SystemValidator] Validating models...');
      
      const modelsPath = path.join(process.cwd(), 'node_modules', 'nodejs-whisper', 'cpp', 'whisper.cpp', 'models');
      
      if (!fs.existsSync(modelsPath)) {
        console.log('[SystemValidator] ❌ Models directory not found');
        return { 
          success: false, 
          message: 'Models directory not found',
          instructions: 'Models will be auto-downloaded when needed if AUTO_DOWNLOAD_MODEL is set'
        };
      }

      const modelFiles = fs.readdirSync(modelsPath).filter(file => file.endsWith('.bin'));
      
      if (modelFiles.length === 0) {
        console.log('[SystemValidator] ⚠️  No model files found');
        return { 
          success: false, 
          message: 'No model files found in models directory',
          instructions: 'Set AUTO_DOWNLOAD_MODEL environment variable to auto-download models'
        };
      }

      console.log(`[SystemValidator] ✅ Found ${modelFiles.length} model file(s): ${modelFiles.join(', ')}`);
      return { success: true, message: `${modelFiles.length} model file(s) available` };
    } catch (error) {
      console.error('[SystemValidator] Error validating models:', error.message);
      return { success: false, message: `Models validation error: ${error.message}` };
    }
  }

  async validatePermissions() {
    try {
      console.log('[SystemValidator] Validating permissions...');
      
      const testPaths = [
        { path: path.join(process.cwd(), 'temp'), description: 'temp directory' },
        { path: path.join(process.cwd(), 'uploads'), description: 'uploads directory' },
        { path: path.join(process.cwd(), 'models'), description: 'models directory' }
      ];

      const issues = [];

      for (const testPath of testPaths) {
        try {
          // Check if directory exists, create if not
          if (!fs.existsSync(testPath.path)) {
            fs.mkdirSync(testPath.path, { recursive: true });
          }

          // Test write permissions
          const testFile = path.join(testPath.path, 'test_write.tmp');
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          
          console.log(`[SystemValidator] ✅ ${testPath.description} permissions OK`);
        } catch (error) {
          console.log(`[SystemValidator] ❌ ${testPath.description} permissions failed: ${error.message}`);
          issues.push(`${testPath.description}: ${error.message}`);
        }
      }

      if (issues.length === 0) {
        console.log('[SystemValidator] ✅ All permission checks passed');
        return { success: true, message: 'All permission checks passed' };
      } else {
        return { 
          success: false, 
          message: 'Permission issues found', 
          issues: issues,
          instructions: 'Please ensure the application has write permissions to the required directories'
        };
      }
    } catch (error) {
      console.error('[SystemValidator] Error validating permissions:', error.message);
      return { success: false, message: `Permissions validation error: ${error.message}` };
    }
  }

  getValidationReport() {
    if (Object.keys(this.validationResults).length === 0) {
      return 'No validation results available. Run validateSystem() first.';
    }

    let report = '\n=== SYSTEM VALIDATION REPORT ===\n\n';
    
    for (const [component, result] of Object.entries(this.validationResults)) {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      report += `${component.toUpperCase()}: ${status}\n`;
      report += `  Message: ${result.message}\n`;
      
      if (result.instructions) {
        report += `  Instructions: ${result.instructions}\n`;
      }
      
      if (result.issues) {
        report += `  Issues: ${result.issues.join(', ')}\n`;
      }
      
      report += '\n';
    }

    return report;
  }
}

module.exports = SystemValidator;