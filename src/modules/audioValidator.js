const path = require('path');
const fs = require('fs');

const SUPPORTED_FORMATS = {
  '.wav': { mime: 'audio/wav', maxSize: 100 * 1024 * 1024 },
  '.mp3': { mime: 'audio/mpeg', maxSize: 100 * 1024 * 1024 },
  '.ogg': { mime: 'audio/ogg', maxSize: 100 * 1024 * 1024 },
  '.flac': { mime: 'audio/flac', maxSize: 100 * 1024 * 1024 },
  '.m4a': { mime: 'audio/mp4', maxSize: 100 * 1024 * 1024 },
  '.aac': { mime: 'audio/aac', maxSize: 100 * 1024 * 1024 }
};

class AudioValidator {
  static validateFormat(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (!SUPPORTED_FORMATS[ext]) {
      throw new Error(`Unsupported audio format: ${ext}. Supported formats: ${Object.keys(SUPPORTED_FORMATS).join(', ')}`);
    }
    return SUPPORTED_FORMATS[ext];
  }

  static validateFile(file) {
    if (!file) {
      throw new Error('No audio file provided');
    }

    const formatInfo = this.validateFormat(file.originalname);
    
    if (file.size > formatInfo.maxSize) {
      throw new Error(`File too large. Maximum size: ${formatInfo.maxSize / 1024 / 1024}MB`);
    }

    return formatInfo;
  }

  static async getAudioDuration(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.size / (44100 * 2 * 2);
    } catch (error) {
      return 0;
    }
  }

  static estimateProcessingTime(duration, format = '.wav') {
    const baseMultiplier = 0.8;
    const formatMultipliers = {
      '.wav': 1.0,
      '.mp3': 1.2,
      '.ogg': 1.3,
      '.flac': 1.1,
      '.m4a': 1.2,
      '.aac': 1.2
    };
    
    const multiplier = formatMultipliers[format] || 1.0;
    return Math.ceil(duration * baseMultiplier * multiplier);
  }

  static getSupportedFormats() {
    return Object.keys(SUPPORTED_FORMATS);
  }
}

module.exports = AudioValidator;