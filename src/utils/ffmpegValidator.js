const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class FFmpegValidator {
  constructor() {
    this.ffmpegPath = null;
    this.version = null;
    this.isValidated = false;
  }

  async validateFFmpeg() {
    try {
      console.log('[FFmpegValidator] Starting ffmpeg validation...');
      
      // Check if ffmpeg is available in PATH
      if (await this.checkFFmpegInPath()) {
        console.log('[FFmpegValidator] ffmpeg found in system PATH');
        this.isValidated = true;
        return { success: true, message: 'ffmpeg is available and functional' };
      }

      // If not found in PATH, try to install it automatically
      console.log('[FFmpegValidator] ffmpeg not found in PATH, attempting automatic installation...');
      const installResult = await this.attemptAutoInstall();
      
      if (installResult.success) {
        // Re-validate after installation
        if (await this.checkFFmpegInPath()) {
          this.isValidated = true;
          return { success: true, message: 'ffmpeg installed and validated successfully' };
        }
      }

      // If automatic installation failed, provide manual instructions
      return {
        success: false,
        message: 'ffmpeg validation failed',
        instructions: this.getManualInstallInstructions()
      };

    } catch (error) {
      console.error('[FFmpegValidator] Error during validation:', error.message);
      return {
        success: false,
        message: `ffmpeg validation error: ${error.message}`,
        instructions: this.getManualInstallInstructions()
      };
    }
  }

  async checkFFmpegInPath() {
    try {
      // Try to run ffmpeg -version to check if it's available
      const result = await this.runCommand('ffmpeg', ['-version']);
      
      if (result.code === 0) {
        // Parse version information
        const versionMatch = result.stdout.match(/ffmpeg version ([^\s]+)/);
        if (versionMatch) {
          this.version = versionMatch[1];
          console.log(`[FFmpegValidator] Found ffmpeg version: ${this.version}`);
        }
        
        // Test basic functionality with a simple command
        const testResult = await this.runCommand('ffmpeg', ['-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=1', '-f', 'null', '-']);
        if (testResult.code === 0) {
          this.ffmpegPath = 'ffmpeg'; // Available in PATH
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.log('[FFmpegValidator] ffmpeg not found in PATH');
      return false;
    }
  }

  async attemptAutoInstall() {
    try {
      console.log('[FFmpegValidator] Attempting automatic ffmpeg installation...');
      
      const platform = process.platform;
      let installCommand;
      let installArgs;

      switch (platform) {
        case 'linux':
          // Try different package managers
          if (await this.commandExists('apt-get')) {
            installCommand = 'sudo';
            installArgs = ['apt-get', 'update', '&&', 'sudo', 'apt-get', 'install', '-y', 'ffmpeg'];
          } else if (await this.commandExists('yum')) {
            installCommand = 'sudo';
            installArgs = ['yum', 'install', '-y', 'ffmpeg'];
          } else if (await this.commandExists('dnf')) {
            installCommand = 'sudo';
            installArgs = ['dnf', 'install', '-y', 'ffmpeg'];
          } else if (await this.commandExists('pacman')) {
            installCommand = 'sudo';
            installArgs = ['pacman', '-S', '--noconfirm', 'ffmpeg'];
          } else {
            throw new Error('No supported package manager found for automatic installation');
          }
          break;

        case 'darwin': // macOS
          if (await this.commandExists('brew')) {
            installCommand = 'brew';
            installArgs = ['install', 'ffmpeg'];
          } else {
            throw new Error('Homebrew not found. Please install Homebrew first.');
          }
          break;

        case 'win32': // Windows
          throw new Error('Automatic installation not supported on Windows. Please install manually.');

        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      console.log(`[FFmpegValidator] Running installation command: ${installCommand} ${installArgs.join(' ')}`);
      
      // Execute installation command
      const result = await this.runCommand(installCommand, installArgs, { timeout: 300000 }); // 5 minutes timeout
      
      if (result.code === 0) {
        console.log('[FFmpegValidator] Installation completed successfully');
        return { success: true, message: 'ffmpeg installed successfully' };
      } else {
        throw new Error(`Installation failed with code ${result.code}: ${result.stderr}`);
      }

    } catch (error) {
      console.error('[FFmpegValidator] Automatic installation failed:', error.message);
      return { success: false, message: `Automatic installation failed: ${error.message}` };
    }
  }

  async commandExists(command) {
    try {
      const result = await this.runCommand('which', [command]);
      return result.code === 0;
    } catch (error) {
      return false;
    }
  }

  runCommand(command, args, options = {}) {
    return new Promise((resolve) => {
      const timeout = options.timeout || 30000; // 30 seconds default
      
      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        child.kill();
        resolve({
          code: -1,
          stdout: '',
          stderr: 'Command timed out'
        });
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          code: code || 0,
          stdout,
          stderr
        });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          code: -1,
          stdout: '',
          stderr: error.message
        });
      });
    });
  }

  getManualInstallInstructions() {
    const platform = process.platform;
    const instructions = {
      linux: `
Manual ffmpeg installation on Linux:

Ubuntu/Debian:
  sudo apt update
  sudo apt install ffmpeg

CentOS/RHEL/Fedora:
  sudo yum install ffmpeg  # or sudo dnf install ffmpeg

Arch Linux:
  sudo pacman -S ffmpeg

After installation, restart your application and try again.
      `,
      darwin: `
Manual ffmpeg installation on macOS:

Using Homebrew (recommended):
  brew install ffmpeg

Using MacPorts:
  sudo port install ffmpeg

After installation, restart your application and try again.
      `,
      win32: `
Manual ffmpeg installation on Windows:

1. Download ffmpeg from https://ffmpeg.org/download.html
2. Extract the archive to a folder (e.g., C:\\ffmpeg)
3. Add the bin folder to your PATH environment variable
4. Restart your terminal/application

Alternative: Use Chocolatey package manager:
  choco install ffmpeg

After installation, restart your application and try again.
      `
    };

    return instructions[platform] || instructions.linux;
  }

  async testFFmpegFunctionality() {
    if (!this.isValidated) {
      throw new Error('ffmpeg not validated. Run validateFFmpeg() first.');
    }

    try {
      // Test basic audio conversion functionality
      const testResult = await this.runCommand('ffmpeg', [
        '-f', 'lavfi',
        '-i', 'sine=frequency=440:duration=1',
        '-acodec', 'pcm_s16le',
        '-ac', '1',
        '-ar', '16000',
        '-f', 'null',
        '-'
      ]);

      if (testResult.code === 0) {
        console.log('[FFmpegValidator] ffmpeg functionality test passed');
        return true;
      } else {
        console.error('[FFmpegValidator] ffmpeg functionality test failed:', testResult.stderr);
        return false;
      }
    } catch (error) {
      console.error('[FFmpegValidator] Error testing ffmpeg functionality:', error.message);
      return false;
    }
  }

  getStatus() {
    return {
      isValidated: this.isValidated,
      ffmpegPath: this.ffmpegPath,
      version: this.version
    };
  }
}

module.exports = FFmpegValidator;