const { Worker } = require('worker_threads');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

class QueueManager {
  constructor(maxWorkers = 4) {
    this.maxWorkers = maxWorkers;
    this.workers = [];
    this.queue = [];
    this.jobs = new Map();
    this.processingTimes = [];
    this.activeJobs = 0;
    
    this.initWorkers();
  }

  initWorkers() {
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

  processQueue() {
    if (this.queue.length === 0) return;

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
    
    if (processingTime) {
      this.processingTimes.push(processingTime);
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift();
      }
    }

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
      retries: job.retries
    };
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
      totalProcessingTime: pendingJobs * averageProcessingTime
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