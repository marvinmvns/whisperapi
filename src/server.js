const express = require('express');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const AudioValidator = require('./modules/audioValidator');
const QueueManager = require('./modules/queueManager');

const app = express();
const PORT = process.env.PORT || 3001;
const MAX_WORKERS = parseInt(process.env.MAX_WORKERS) || 4;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const TEMP_DIR = process.env.TEMP_DIR || './temp';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const queueManager = new QueueManager(MAX_WORKERS);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    try {
      AudioValidator.validateFile(file);
      cb(null, true);
    } catch (error) {
      cb(new Error(error.message), false);
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    queue: queueManager.getQueueStats()
  });
});

app.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No audio file provided',
        code: 'MISSING_FILE'
      });
    }

    const options = {
      language: process.env.WHISPER_LANGUAGE || req.body.language || 'pt',
      translate: req.body.translate === 'true',
      wordTimestamps: req.body.wordTimestamps !== 'false',
      cleanup: true // Sempre fazer cleanup do arquivo de upload
    };

    const jobId = queueManager.addJob(req.file.path, req.file.originalname, options);

    res.json({
      jobId,
      status: 'queued',
      message: 'Audio file queued for transcription',
      estimatedWaitTime: queueManager.calculateEstimatedWaitTime()
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({
      error: error.message,
      code: 'TRANSCRIPTION_ERROR'
    });
  }
});

app.get('/status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const status = queueManager.getJobStatus(jobId);

    if (status.error) {
      return res.status(404).json({
        error: status.error,
        code: 'JOB_NOT_FOUND'
      });
    }

    res.json(status);

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      error: 'Failed to check job status',
      code: 'STATUS_ERROR'
    });
  }
});

app.get('/estimate', (req, res) => {
  try {
    const { duration, format } = req.query;

    if (!duration) {
      return res.status(400).json({
        error: 'Duration parameter is required (in seconds)',
        code: 'MISSING_DURATION'
      });
    }

    const durationSeconds = parseFloat(duration);
    if (isNaN(durationSeconds) || durationSeconds <= 0) {
      return res.status(400).json({
        error: 'Duration must be a positive number',
        code: 'INVALID_DURATION'
      });
    }

    const fileFormat = format || '.wav';
    const estimatedTime = AudioValidator.estimateProcessingTime(durationSeconds, fileFormat);
    const currentWaitTime = queueManager.calculateEstimatedWaitTime();

    res.json({
      estimatedProcessingTime: estimatedTime,
      currentQueueWaitTime: currentWaitTime,
      totalEstimatedTime: estimatedTime + currentWaitTime,
      format: fileFormat,
      durationSeconds,
      message: `Estimated ${estimatedTime}s processing + ${currentWaitTime}s queue wait = ${estimatedTime + currentWaitTime}s total`
    });

  } catch (error) {
    console.error('Estimation error:', error);
    res.status(500).json({
      error: 'Failed to calculate estimate',
      code: 'ESTIMATION_ERROR'
    });
  }
});

app.get('/queue-estimate', (req, res) => {
  try {
    const stats = queueManager.getQueueStats();
    
    res.json({
      queueLength: stats.pendingJobs,
      activeJobs: stats.activeJobs,
      availableWorkers: stats.availableWorkers,
      totalWorkers: stats.totalWorkers,
      averageProcessingTime: stats.averageProcessingTime,
      estimatedWaitTime: stats.estimatedWaitTime,
      totalQueueProcessingTime: stats.totalProcessingTime,
      message: `${stats.pendingJobs} jobs in queue, estimated wait time: ${stats.estimatedWaitTime}s`
    });

  } catch (error) {
    console.error('Queue estimate error:', error);
    res.status(500).json({
      error: 'Failed to get queue estimate',
      code: 'QUEUE_ESTIMATE_ERROR'
    });
  }
});

app.get('/formats', (req, res) => {
  res.json({
    supportedFormats: AudioValidator.getSupportedFormats(),
    maxFileSize: '100MB',
    message: 'Supported audio formats for transcription'
  });
});

app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File too large. Maximum size is 100MB',
        code: 'FILE_TOO_LARGE'
      });
    }
    return res.status(400).json({
      error: error.message,
      code: 'UPLOAD_ERROR'
    });
  }

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    availableEndpoints: [
      'POST /transcribe',
      'GET /status/:jobId',
      'GET /estimate',
      'GET /queue-estimate',
      'GET /formats',
      'GET /health'
    ]
  });
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  queueManager.cleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  queueManager.cleanup();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🎤 Whisper API Server running on port ${PORT}`);
  console.log(`📊 Worker threads: ${MAX_WORKERS}`);
  console.log(`📁 Upload directory: ${UPLOAD_DIR}`);
  console.log(`🔊 Supported formats: ${AudioValidator.getSupportedFormats().join(', ')}`);
});

module.exports = app;