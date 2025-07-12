const fs = require('fs');
const path = require('path');

class StatusPersistence {
  constructor(tempDir = './temp') {
    this.tempDir = tempDir;
    this.statusFile = path.join(tempDir, 'transcription_status.json');
    this.ensureTempDir();
    this.loadStatusData();
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  loadStatusData() {
    try {
      if (fs.existsSync(this.statusFile)) {
        const data = fs.readFileSync(this.statusFile, 'utf8');
        this.statusData = JSON.parse(data);
      } else {
        this.statusData = { completedJobs: [] };
        this.saveStatusData();
      }
    } catch (error) {
      console.warn('Failed to load status data, creating new file:', error.message);
      this.statusData = { completedJobs: [] };
      this.saveStatusData();
    }
  }

  saveStatusData() {
    try {
      fs.writeFileSync(this.statusFile, JSON.stringify(this.statusData, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save status data:', error.message);
    }
  }

  addCompletedJob(jobData) {
    if (jobData.status === 'completed') {
      const existingIndex = this.statusData.completedJobs.findIndex(job => job.id === jobData.id);
      
      if (existingIndex === -1) {
        this.statusData.completedJobs.push({
          id: jobData.id,
          originalName: jobData.originalName,
          status: jobData.status,
          result: jobData.result,
          createdAt: jobData.createdAt,
          startedAt: jobData.startedAt,
          completedAt: jobData.completedAt,
          processingTime: jobData.processingTime,
          options: jobData.options
        });
        
        this.saveStatusData();
      }
    }
  }

  getCompletedJobs() {
    return this.statusData.completedJobs || [];
  }

  getJobById(jobId) {
    return this.statusData.completedJobs.find(job => job.id === jobId) || null;
  }

  getAllJobsStatus() {
    return {
      totalCompleted: this.statusData.completedJobs.length,
      completedJobs: this.statusData.completedJobs
    };
  }

  cleanOldJobs(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days default
    const cutoffDate = new Date(Date.now() - maxAge);
    const initialCount = this.statusData.completedJobs.length;
    
    this.statusData.completedJobs = this.statusData.completedJobs.filter(job => {
      const completedAt = new Date(job.completedAt);
      return completedAt > cutoffDate;
    });

    if (this.statusData.completedJobs.length !== initialCount) {
      this.saveStatusData();
      console.log(`Cleaned ${initialCount - this.statusData.completedJobs.length} old completed jobs`);
    }
  }
}

module.exports = StatusPersistence;