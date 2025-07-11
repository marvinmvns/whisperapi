const request = require('supertest');
const fs = require('fs');
const path = require('path');

jest.mock('../modules/queueManager');
jest.mock('../workers/transcriptionWorker.js');

const QueueManager = require('../modules/queueManager');

const mockQueueManager = {
  addJob: jest.fn().mockReturnValue('mock-job-id'),
  getJobStatus: jest.fn(),
  getQueueStats: jest.fn(),
  calculateEstimatedWaitTime: jest.fn().mockReturnValue(30),
  cleanup: jest.fn()
};

QueueManager.mockImplementation(() => mockQueueManager);

const app = require('../server');

describe('API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    test('should return health status', async () => {
      mockQueueManager.getQueueStats.mockReturnValue({
        pendingJobs: 0,
        activeJobs: 0,
        totalWorkers: 4
      });

      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.uptime).toBeDefined();
      expect(response.body.queue).toBeDefined();
    });
  });

  describe('POST /transcribe', () => {
    test('should accept valid audio file', async () => {
      const testBuffer = Buffer.from('fake audio data');
      
      const response = await request(app)
        .post('/transcribe')
        .attach('audio', testBuffer, 'test.wav')
        .field('language', 'en');

      expect(response.status).toBe(200);
      expect(response.body.jobId).toBe('mock-job-id');
      expect(response.body.status).toBe('queued');
      expect(mockQueueManager.addJob).toHaveBeenCalled();
    });

    test('should reject request without audio file', async () => {
      const response = await request(app)
        .post('/transcribe')
        .field('language', 'en');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No audio file provided');
      expect(response.body.code).toBe('MISSING_FILE');
    });

    test('should reject unsupported file format', async () => {
      const testBuffer = Buffer.from('fake data');
      
      const response = await request(app)
        .post('/transcribe')
        .attach('audio', testBuffer, 'test.txt');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Unsupported audio format');
    });
  });

  describe('GET /status/:jobId', () => {
    test('should return job status for existing job', async () => {
      mockQueueManager.getJobStatus.mockReturnValue({
        id: 'test-job-id',
        status: 'completed',
        result: { text: 'Hello world' },
        createdAt: new Date()
      });

      const response = await request(app).get('/status/test-job-id');
      
      expect(response.status).toBe(200);
      expect(response.body.id).toBe('test-job-id');
      expect(response.body.status).toBe('completed');
    });

    test('should return 404 for non-existent job', async () => {
      mockQueueManager.getJobStatus.mockReturnValue({ error: 'Job not found' });

      const response = await request(app).get('/status/non-existent-id');
      
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('JOB_NOT_FOUND');
    });
  });

  describe('GET /estimate', () => {
    test('should return processing time estimate', async () => {
      const response = await request(app)
        .get('/estimate')
        .query({ duration: '60', format: '.wav' });

      expect(response.status).toBe(200);
      expect(response.body.estimatedProcessingTime).toBeDefined();
      expect(response.body.currentQueueWaitTime).toBe(30);
      expect(response.body.totalEstimatedTime).toBeDefined();
    });

    test('should require duration parameter', async () => {
      const response = await request(app).get('/estimate');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Duration parameter is required (in seconds)');
      expect(response.body.code).toBe('MISSING_DURATION');
    });

    test('should reject invalid duration', async () => {
      const response = await request(app)
        .get('/estimate')
        .query({ duration: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_DURATION');
    });
  });

  describe('GET /queue-estimate', () => {
    test('should return queue statistics and estimates', async () => {
      mockQueueManager.getQueueStats.mockReturnValue({
        pendingJobs: 3,
        activeJobs: 2,
        availableWorkers: 2,
        totalWorkers: 4,
        averageProcessingTime: 45,
        estimatedWaitTime: 90,
        totalProcessingTime: 135
      });

      const response = await request(app).get('/queue-estimate');
      
      expect(response.status).toBe(200);
      expect(response.body.queueLength).toBe(3);
      expect(response.body.activeJobs).toBe(2);
      expect(response.body.availableWorkers).toBe(2);
      expect(response.body.totalWorkers).toBe(4);
      expect(response.body.averageProcessingTime).toBe(45);
      expect(response.body.estimatedWaitTime).toBe(90);
      expect(response.body.totalQueueProcessingTime).toBe(135);
      expect(response.body.message).toContain('3 jobs in queue');
    });
  });

  describe('GET /formats', () => {
    test('should return supported formats', async () => {
      const response = await request(app).get('/formats');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.supportedFormats)).toBe(true);
      expect(response.body.supportedFormats).toContain('.wav');
      expect(response.body.supportedFormats).toContain('.mp3');
      expect(response.body.maxFileSize).toBe('100MB');
    });
  });

  describe('404 handler', () => {
    test('should return 404 for unknown endpoints', async () => {
      const response = await request(app).get('/unknown-endpoint');
      
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Endpoint not found');
      expect(response.body.code).toBe('NOT_FOUND');
      expect(Array.isArray(response.body.availableEndpoints)).toBe(true);
    });
  });
});