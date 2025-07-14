const { Worker } = require('worker_threads');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const StatusPersistence = require('./statusPersistence');
const WorkerAutoScaler = require('../utils/workerAutoScaler');

class QueueManager {
  constructor(maxWorkers = 4, tempDir = './temp', autoScaleConfig = { enabled: true }) {
    // Support both old boolean format and new config object format
    if (typeof autoScaleConfig === 'boolean') {
      this.autoScaleConfig = { enabled: autoScaleConfig };
    } else {
      this.autoScaleConfig = autoScaleConfig;
    }
    
    this.autoScale = this.autoScaleConfig.enabled;
    this.autoScaler = new WorkerAutoScaler(this.autoScaleConfig);
    this.maxWorkers = maxWorkers;
    this.workers = [];
    this.queue = [];
    this.jobs = new Map();
    this.processingTimes = [];
    this.activeJobs = 0;
    this.statusPersistence = new StatusPersistence(tempDir);
    this.lastScaleCheck = 0;
    this.scaleCheckInterval = this.autoScaleConfig.interval || 60000;
    
    this.initWorkers();
  }

  async initWorkers() {
    if (this.autoScale) {
      try {
        console.log('🔍 Detecting optimal worker count...');
        const workerInfo = await this.autoScaler.getOptimalWorkerCount();
        this.maxWorkers = workerInfo.recommended;
        console.log(`✅ Auto-scaled to ${this.maxWorkers} workers based on system resources`);
        console.log(`   CPU: ${workerInfo.systemInfo.cpuCount} cores, RAM: ${workerInfo.systemInfo.memoryGB}GB`);
        console.log(`   Memory usage: ${workerInfo.systemInfo.memoryUsagePercent}%, Load: ${workerInfo.systemInfo.currentLoad}%`);
        if (workerInfo.systemInfo.hasGpu) {
          console.log(`   GPU detected: ${workerInfo.systemInfo.gpuCount} device(s)`);
        }
      } catch (error) {
        console.warn('⚠️  Auto-scaling failed, using default worker count:', error.message);
      }
    }
    
    for (let i = 0; i < this.maxWorkers; i++) {
      this.createWorker();
    }
  }

  createWorker() {
    const worker = new Worker(path.join(__dirname, '../workers/transcriptionWorker.js'));
    
    worker.on('message', (message) => {
      const { type, jobId, result, error, processingTime } = message;
      
      if (type === 'complete') {
        this.handleJobComplete(jobId, result, processingTime);
      } else if (type === 'error') {
        this.handleJobError(jobId, error);
      }
    });

    worker.on('error', (error) => {
      console.error('Worker error:', error);
      this.createWorker();
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker stopped with exit code ${code}`);
        this.createWorker();
      }
    });

    this.workers.push({ worker, busy: false });
  }

  addJob(filePath, originalName, options = {}) {
    const jobId = uuidv4();
    const job = {
      id: jobId,
      filePath,
      originalName,
      status: 'pending',
      result: null,
      error: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      retries: 0,
      maxRetries: options.maxRetries || 3,
      options
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);
    this.processQueue();
    
    return jobId;
  }

  async processQueue() {
    if (this.queue.length === 0) return;

    // Verificar se precisa reescalar workers
    await this.checkAndScaleWorkers();

    const availableWorker = this.workers.find(w => !w.busy);
    if (!availableWorker) return;

    const jobId = this.queue.shift();
    const job = this.jobs.get(jobId);
    
    if (!job) return;

    job.status = 'processing';
    job.startedAt = new Date();
    availableWorker.busy = true;
    this.activeJobs++;

    availableWorker.worker.postMessage({
      type: 'transcribe',
      jobId,
      filePath: job.filePath,
      options: job.options
    });
  }

  handleJobComplete(jobId, result, processingTime) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'completed';
    job.result = result;
    job.completedAt = new Date();
    job.processingTime = processingTime;
    
    if (processingTime) {
      this.processingTimes.push(processingTime);
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift();
      }
    }

    // Save completed job to JSON
    this.statusPersistence.addCompletedJob(job);

    this.releaseWorker();
  }

  handleJobError(jobId, error) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.retries++;
    
    if (job.retries < job.maxRetries) {
      job.status = 'pending';
      this.queue.unshift(jobId);
    } else {
      job.status = 'failed';
      job.error = error;
      job.completedAt = new Date();
    }

    this.releaseWorker();
  }

  releaseWorker() {
    const busyWorker = this.workers.find(w => w.busy);
    if (busyWorker) {
      busyWorker.busy = false;
      this.activeJobs--;
    }
    
    this.processQueue();
  }

  getJobStatus(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      // Check in persistent storage for completed jobs
      const completedJob = this.statusPersistence.getJobById(jobId);
      if (completedJob) {
        return completedJob;
      }
      return { error: 'Job not found' };
    }

    return {
      id: job.id,
      status: job.status,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      retries: job.retries,
      processingTime: job.processingTime
    };
  }

  async checkAndScaleWorkers() {
    if (!this.autoScale) return;
    
    const now = Date.now();
    if (now - this.lastScaleCheck < this.scaleCheckInterval) return;
    
    this.lastScaleCheck = now;
    
    try {
      const workerInfo = await this.autoScaler.getOptimalWorkerCount();
      const recommendedWorkers = workerInfo.recommended;
      
      if (recommendedWorkers !== this.maxWorkers) {
        console.log(`🔄 Scaling workers: ${this.maxWorkers} -> ${recommendedWorkers}`);
        
        if (recommendedWorkers > this.maxWorkers) {
          // Adicionar workers
          const workersToAdd = recommendedWorkers - this.maxWorkers;
          for (let i = 0; i < workersToAdd; i++) {
            this.createWorker();
          }
        } else if (recommendedWorkers < this.maxWorkers) {
          // Remover workers (apenas os não ocupados)
          const workersToRemove = this.maxWorkers - recommendedWorkers;
          let removedCount = 0;
          
          for (let i = this.workers.length - 1; i >= 0 && removedCount < workersToRemove; i--) {
            if (!this.workers[i].busy) {
              this.workers[i].worker.terminate();
              this.workers.splice(i, 1);
              removedCount++;
            }
          }
        }
        
        this.maxWorkers = recommendedWorkers;
      }
    } catch (error) {
      console.warn('⚠️  Worker scaling check failed:', error.message);
    }
  }

  getQueueStats() {
    const pendingJobs = this.queue.length;
    const averageProcessingTime = this.getAverageProcessingTime();
    const estimatedWaitTime = this.calculateEstimatedWaitTime();
    
    return {
      pendingJobs,
      activeJobs: this.activeJobs,
      totalWorkers: this.maxWorkers,
      availableWorkers: this.workers.filter(w => !w.busy).length,
      averageProcessingTime,
      estimatedWaitTime,
      totalProcessingTime: pendingJobs * averageProcessingTime,
      autoScalingEnabled: this.autoScale
    };
  }

  getAverageProcessingTime() {
    if (this.processingTimes.length === 0) return 30;
    
    const sum = this.processingTimes.reduce((a, b) => a + b, 0);
    return Math.ceil(sum / this.processingTimes.length);
  }

  calculateEstimatedWaitTime() {
    const queuePosition = this.queue.length;
    const averageProcessingTime = this.getAverageProcessingTime();
    const availableWorkers = this.workers.filter(w => !w.busy).length;
    
    if (availableWorkers > 0 && queuePosition === 0) return 0;
    
    const jobsPerWorker = Math.ceil(queuePosition / this.maxWorkers);
    return jobsPerWorker * averageProcessingTime;
  }

  getCompletedJobs() {
    return this.statusPersistence.getCompletedJobs();
  }

  getAllJobsStatus() {
    return this.statusPersistence.getAllJobsStatus();
  }

  async getSystemReport() {
    if (!this.autoScale) {
      return { 
        message: 'Auto-scaling is disabled',
        autoScalerConfig: this.autoScaleConfig
      };
    }
    
    const report = await this.autoScaler.getSystemReport();
    return {
      ...report,
      autoScalerConfig: this.autoScaler.getConfig()
    };
  }

  cleanup() {
    this.workers.forEach(({ worker }) => {
      worker.terminate();
    });
    this.workers = [];
    this.queue = [];
    this.jobs.clear();
  }
}

module.exports = QueueManager;