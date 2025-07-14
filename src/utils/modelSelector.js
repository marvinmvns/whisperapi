const os = require('os');
const fs = require('fs');
const path = require('path');
const { autoDownloadModel } = require('./autoDownloadModel');

const MODEL_REQUIREMENTS = {
  'tiny': { mem: 273 * 1024 * 1024, disk: 75 * 1024 * 1024 },
  'base': { mem: 388 * 1024 * 1024, disk: 142 * 1024 * 1024 },
  'small': { mem: 852 * 1024 * 1024, disk: 466 * 1024 * 1024 },
  'medium': { mem: 2.1 * 1024 * 1024 * 1024, disk: 1.5 * 1024 * 1024 * 1024 },
  'large-v3-turbo': { mem: 3.9 * 1024 * 1024 * 1024, disk: 2.9 * 1024 * 1024 * 1024 }
};

class ModelSelector {
  constructor() {
    this.cachedRAM = null;
    this.cacheTimestamp = null;
    this.cacheTimeout = 30000; // 30 seconds
  }

  getAvailableRAM() {
    const now = Date.now();
    
    if (this.cachedRAM && this.cacheTimestamp && (now - this.cacheTimestamp) < this.cacheTimeout) {
      return this.cachedRAM;
    }

    const totalRAM = os.totalmem();
    const freeRAM = os.freemem();
    const usedRAM = totalRAM - freeRAM;
    const availableRAM = totalRAM - usedRAM;

    this.cachedRAM = {
      total: totalRAM,
      free: freeRAM,
      used: usedRAM,
      available: availableRAM,
      usagePercentage: (usedRAM / totalRAM) * 100
    };
    
    this.cacheTimestamp = now;
    return this.cachedRAM;
  }

  selectModelBasedOnRAM(reserveMemoryPercentage = 20) {
    const ramInfo = this.getAvailableRAM();
    const reservedMemory = ramInfo.total * (reserveMemoryPercentage / 100);
    const availableForModel = ramInfo.available - reservedMemory;

    console.log(`[ModelSelector] Total RAM: ${this.formatBytes(ramInfo.total)}`);
    console.log(`[ModelSelector] Available RAM: ${this.formatBytes(ramInfo.available)}`);
    console.log(`[ModelSelector] Reserved RAM (${reserveMemoryPercentage}%): ${this.formatBytes(reservedMemory)}`);
    console.log(`[ModelSelector] Available for model: ${this.formatBytes(availableForModel)}`);

    const modelOrder = ['large-v3-turbo', 'medium', 'small', 'base', 'tiny'];
    
    for (const modelName of modelOrder) {
      const requirements = MODEL_REQUIREMENTS[modelName];
      if (availableForModel >= requirements.mem) {
        console.log(`[ModelSelector] Selected model: ${modelName} (requires ${this.formatBytes(requirements.mem)})`);
        return {
          model: modelName,
          reason: `Selected based on available RAM (${this.formatBytes(availableForModel)} available, ${this.formatBytes(requirements.mem)} required)`,
          ramInfo: ramInfo,
          requirements: requirements
        };
      }
    }

    console.log('[ModelSelector] Warning: Not enough RAM for any model, falling back to tiny');
    return {
      model: 'tiny',
      reason: 'Fallback to tiny model due to insufficient RAM',
      ramInfo: ramInfo,
      requirements: MODEL_REQUIREMENTS['tiny']
    };
  }

  getModelFromEnv() {
    const autoDownloadModel = process.env.AUTO_DOWNLOAD_MODEL;
    const modelPath = process.env.WHISPER_MODEL_PATH;
    
    if (autoDownloadModel) {
      console.log(`[ModelSelector] Using model from AUTO_DOWNLOAD_MODEL: ${autoDownloadModel}`);
      return {
        model: autoDownloadModel,
        reason: 'Specified in AUTO_DOWNLOAD_MODEL environment variable',
        source: 'env'
      };
    }
    
    if (modelPath && fs.existsSync(modelPath)) {
      const modelName = this.extractModelNameFromPath(modelPath);
      console.log(`[ModelSelector] Using model from WHISPER_MODEL_PATH: ${modelName}`);
      return {
        model: modelName,
        reason: 'Specified in WHISPER_MODEL_PATH environment variable',
        source: 'env',
        path: modelPath
      };
    }
    
    return null;
  }

  extractModelNameFromPath(modelPath) {
    const filename = path.basename(modelPath);
    
    for (const modelName of Object.keys(MODEL_REQUIREMENTS)) {
      if (filename.includes(modelName)) {
        return modelName;
      }
    }
    
    return 'unknown';
  }

  async selectModel() {
    const envModel = this.getModelFromEnv();
    
    if (envModel) {
      return envModel;
    }
    
    console.log('[ModelSelector] No model specified in environment, selecting based on available RAM...');
    return this.selectModelBasedOnRAM();
  }

  async ensureModelAvailable(modelName) {
    try {
      const result = await autoDownloadModel(modelName);
      return result;
    } catch (error) {
      console.error(`[ModelSelector] Error ensuring model ${modelName} is available:`, error.message);
      throw error;
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getModelRequirements(modelName) {
    return MODEL_REQUIREMENTS[modelName] || null;
  }

  getAllModelRequirements() {
    return MODEL_REQUIREMENTS;
  }

  getSystemInfo() {
    const ramInfo = this.getAvailableRAM();
    const cpuInfo = os.cpus();
    
    return {
      ram: ramInfo,
      cpu: {
        model: cpuInfo[0].model,
        cores: cpuInfo.length,
        speed: cpuInfo[0].speed
      },
      platform: os.platform(),
      arch: os.arch(),
      uptime: os.uptime()
    };
  }
}

module.exports = ModelSelector;