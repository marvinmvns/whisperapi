const QueueManager = require('../modules/queueManager');
const path = require('path');

jest.mock('../workers/transcriptionWorker.js', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    postMessage: jest.fn(),
    terminate: jest.fn()
  }));
});

describe('QueueManager', () => {
  let queueManager;

  beforeEach(() => {
    queueManager = new QueueManager(2);
  });

  afterEach(() => {
    queueManager.cleanup();
  });

  describe('addJob', () => {
    test('should add job and return jobId', () => {
      const jobId = queueManager.addJob('/test/path.wav', 'test.wav');
      
      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
      
      const status = queueManager.getJobStatus(jobId);
      expect(['pending', 'processing'].includes(status.status)).toBe(true);
    });

    test('should accept job options', () => {
      const options = { language: 'en', translate: true };
      const jobId = queueManager.addJob('/test/path.wav', 'test.wav', options);
      
      const status = queueManager.getJobStatus(jobId);
      expect(status).toBeDefined();
    });
  });

  describe('getJobStatus', () => {
    test('should return error for non-existent job', () => {
      const status = queueManager.getJobStatus('non-existent-id');
      expect(status.error).toBe('Job not found');
    });

    test('should return job details for existing job', () => {
      const jobId = queueManager.addJob('/test/path.wav', 'test.wav');
      const status = queueManager.getJobStatus(jobId);
      
      expect(status.id).toBe(jobId);
      expect(['pending', 'processing'].includes(status.status)).toBe(true);
      expect(status.createdAt).toBeDefined();
    });
  });

  describe('getQueueStats', () => {
    test('should return current queue statistics', () => {
      queueManager.addJob('/test/path1.wav', 'test1.wav');
      queueManager.addJob('/test/path2.wav', 'test2.wav');
      
      const stats = queueManager.getQueueStats();
      
      expect(stats.totalWorkers).toBe(2);
      expect(stats.averageProcessingTime).toBeGreaterThan(0);
      expect(stats.estimatedWaitTime).toBeGreaterThanOrEqual(0);
      expect(typeof stats.pendingJobs).toBe('number');
    });
  });


});