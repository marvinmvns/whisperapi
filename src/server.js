const express = require('express');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const AudioValidator = require('./modules/audioValidator');
const QueueManager = require('./modules/queueManager');
const SystemValidator = require('./utils/systemValidator');
const UploadsCleanup = require('./utils/uploadsCleanup');
const ModelSelector = require('./utils/modelSelector');

const app = express();
const PORT = process.env.PORT || 3001;
const MAX_WORKERS = parseInt(process.env.MAX_WORKERS) || 4;
const AUTO_SCALE = process.env.AUTO_SCALE !== 'false'; // Habilitado por padrão
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const TEMP_DIR = process.env.TEMP_DIR || './temp';

// Auto Scaler Configuration
const AUTO_SCALE_CONFIG = {
  enabled: AUTO_SCALE,
  interval: parseInt(process.env.AUTO_SCALE_INTERVAL) || 60000,
  cacheTTL: parseInt(process.env.AUTO_SCALE_CACHE_TTL) || 30000,
  minWorkers: parseInt(process.env.AUTO_SCALE_MIN_WORKERS) || 1,
  maxWorkers: parseInt(process.env.AUTO_SCALE_MAX_WORKERS) || 8,
  memoryThreshold: parseInt(process.env.AUTO_SCALE_MEMORY_THRESHOLD) || 80,
  cpuThreshold: parseInt(process.env.AUTO_SCALE_CPU_THRESHOLD) || 80
};

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const queueManager = new QueueManager(MAX_WORKERS, TEMP_DIR, AUTO_SCALE_CONFIG);

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
      translate: req.body.translate === 'true' || req.body.translate === true || false,
      wordTimestamps: req.body.wordTimestamps === 'true' || req.body.wordTimestamps === true || true,
      cleanup: req.body.cleanup === 'true' || req.body.cleanup === true || true,
      outputInCsv: req.body.outputInCsv === 'true' || req.body.outputInCsv === true || false,
      outputInJson: req.body.outputInJson === 'true' || req.body.outputInJson === true || false,
      outputInJsonFull: req.body.outputInJsonFull === 'true' || req.body.outputInJsonFull === true || false,
      outputInLrc: req.body.outputInLrc === 'true' || req.body.outputInLrc === true || false,
      outputInSrt: req.body.outputInSrt === 'true' || req.body.outputInSrt === true || false,
      outputInText: req.body.outputInText === 'true' || req.body.outputInText === true || true,
      outputInVtt: req.body.outputInVtt === 'true' || req.body.outputInVtt === true || false,
      outputInWords: req.body.outputInWords === 'true' || req.body.outputInWords === true || false,
      splitOnWord: req.body.splitOnWord === 'true' || req.body.splitOnWord === true || false,
      timestamps_length: req.body.timestamps_length ? parseInt(req.body.timestamps_length) : 30,
      removeTimestamps: req.body.removeTimestamps === 'true' || req.body.removeTimestamps === true || false
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

app.get('/completed-jobs', (req, res) => {
  try {
    const completedJobs = queueManager.getCompletedJobs();
    
    res.json({
      totalCompleted: completedJobs.length,
      completedJobs,
      message: 'All completed transcription jobs'
    });

  } catch (error) {
    console.error('Completed jobs error:', error);
    res.status(500).json({
      error: 'Failed to get completed jobs',
      code: 'COMPLETED_JOBS_ERROR'
    });
  }
});

app.get('/all-status', (req, res) => {
  try {
    const allStatus = queueManager.getAllJobsStatus();
    
    res.json(allStatus);

  } catch (error) {
    console.error('All status error:', error);
    res.status(500).json({
      error: 'Failed to get all jobs status',
      code: 'ALL_STATUS_ERROR'
    });
  }
});

app.get('/system-report', async (req, res) => {
  try {
    const systemReport = await queueManager.getSystemReport();
    
    res.json(systemReport);

  } catch (error) {
    console.error('System report error:', error);
    res.status(500).json({
      error: 'Failed to get system report',
      code: 'SYSTEM_REPORT_ERROR'
    });
  }
});

app.get('/model-info', async (req, res) => {
  try {
    const modelSelector = new ModelSelector();
    const modelSelection = await modelSelector.selectModel();
    const systemInfo = modelSelector.getSystemInfo();
    const modelRequirements = modelSelector.getAllModelRequirements();
    
    res.json({
      selectedModel: modelSelection,
      systemInfo,
      modelRequirements,
      message: 'Current model selection and system information'
    });

  } catch (error) {
    console.error('Model info error:', error);
    res.status(500).json({
      error: 'Failed to get model information',
      code: 'MODEL_INFO_ERROR'
    });
  }
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
      'GET /health',
      'GET /completed-jobs',
      'GET /all-status',
      'GET /system-report',
      'GET /model-info'
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

if (require.main === module) {
  async function startServer() {
    try {
      // Validate system before starting server
      console.log('🔍 Validating system dependencies...');
      const systemValidator = new SystemValidator();
      const validationResult = await systemValidator.validateSystem();
      
      if (!validationResult.success) {
        console.error('❌ System validation failed!');
        console.error(systemValidator.getValidationReport());
        console.error('Please fix the issues above before starting the server.');
        process.exit(1);
      }
      
      console.log('✅ System validation completed successfully!');
      
      // Clean up uploads folder
      const uploadsCleanup = new UploadsCleanup(UPLOAD_DIR);
      await uploadsCleanup.cleanupUploads();
      
      // Start the server
      app.listen(PORT, () => {
        console.log(`🎤 Whisper API Server running on port ${PORT}`);
        console.log(`📊 Worker auto-scaling: ${AUTO_SCALE_CONFIG.enabled ? 'enabled' : 'disabled'}`);
        
        if (AUTO_SCALE_CONFIG.enabled) {
          console.log(`   ⚙️  Auto-scaling configuration:`);
          console.log(`      - Min workers: ${AUTO_SCALE_CONFIG.minWorkers}`);
          console.log(`      - Max workers: ${AUTO_SCALE_CONFIG.maxWorkers}`);
          console.log(`      - Scale interval: ${AUTO_SCALE_CONFIG.interval}ms`);
          console.log(`      - Memory threshold: ${AUTO_SCALE_CONFIG.memoryThreshold}%`);
          console.log(`      - CPU threshold: ${AUTO_SCALE_CONFIG.cpuThreshold}%`);
        }
        
        console.log(`📁 Upload directory: ${UPLOAD_DIR}`);
        console.log(`🔊 Supported formats: ${AudioValidator.getSupportedFormats().join(', ')}`);
        console.log('🚀 Server is ready to accept requests!');
      });
    } catch (error) {
      console.error('💥 Failed to start server:', error.message);
      process.exit(1);
    }
  }
  
  startServer();
}

module.exports = app;