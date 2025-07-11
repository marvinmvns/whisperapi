const AudioValidator = require('../modules/audioValidator');

describe('AudioValidator', () => {
  describe('validateFormat', () => {
    test('should accept supported audio formats', () => {
      const supportedFormats = ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac'];
      
      supportedFormats.forEach(format => {
        expect(() => AudioValidator.validateFormat(`test${format}`)).not.toThrow();
      });
    });

    test('should reject unsupported formats', () => {
      const unsupportedFormats = ['.txt', '.pdf', '.mp4', '.avi'];
      
      unsupportedFormats.forEach(format => {
        expect(() => AudioValidator.validateFormat(`test${format}`)).toThrow();
      });
    });

    test('should be case insensitive', () => {
      expect(() => AudioValidator.validateFormat('test.WAV')).not.toThrow();
      expect(() => AudioValidator.validateFormat('test.Mp3')).not.toThrow();
    });
  });

  describe('validateFile', () => {
    test('should throw error when no file provided', () => {
      expect(() => AudioValidator.validateFile(null)).toThrow('No audio file provided');
      expect(() => AudioValidator.validateFile(undefined)).toThrow('No audio file provided');
    });

    test('should validate file with correct format and size', () => {
      const mockFile = {
        originalname: 'test.wav',
        size: 1024 * 1024 // 1MB
      };

      expect(() => AudioValidator.validateFile(mockFile)).not.toThrow();
    });

    test('should reject files that are too large', () => {
      const mockFile = {
        originalname: 'test.wav',
        size: 200 * 1024 * 1024 // 200MB
      };

      expect(() => AudioValidator.validateFile(mockFile)).toThrow('File too large');
    });
  });

  describe('estimateProcessingTime', () => {
    test('should return reasonable estimates for different formats', () => {
      const duration = 60; // 60 seconds
      
      const wavTime = AudioValidator.estimateProcessingTime(duration, '.wav');
      const mp3Time = AudioValidator.estimateProcessingTime(duration, '.mp3');
      
      expect(wavTime).toBeGreaterThan(0);
      expect(mp3Time).toBeGreaterThan(wavTime); // MP3 should take longer
    });

    test('should handle unknown formats with default multiplier', () => {
      const duration = 30;
      const time = AudioValidator.estimateProcessingTime(duration, '.unknown');
      
      expect(time).toBe(Math.ceil(duration * 0.8));
    });
  });

  describe('getSupportedFormats', () => {
    test('should return array of supported formats', () => {
      const formats = AudioValidator.getSupportedFormats();
      
      expect(Array.isArray(formats)).toBe(true);
      expect(formats).toContain('.wav');
      expect(formats).toContain('.mp3');
      expect(formats.length).toBeGreaterThan(0);
    });
  });
});