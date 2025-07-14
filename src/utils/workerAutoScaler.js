const os = require('os');
const { execSync } = require('child_process');

class WorkerAutoScaler {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      interval: config.interval || 60000,
      cacheTTL: config.cacheTTL || 30000,
      minWorkers: config.minWorkers || 1,
      maxWorkers: config.maxWorkers || 8,
      memoryThreshold: config.memoryThreshold || 80,
      cpuThreshold: config.cpuThreshold || 80
    };
    
    this.systemInfo = null;
    this.workerCount = null;
    this.lastCalculation = null;
    this.cacheTTL = this.config.cacheTTL;
  }

  async detectSystemResources() {
    try {
      const cpuCount = os.cpus().length;
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryUsagePercent = (usedMemory / totalMemory) * 100;

      let gpuInfo = null;
      try {
        // Tenta detectar GPU NVIDIA
        const nvidiaOutput = execSync('nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free --format=csv,noheader,nounits', 
          { encoding: 'utf8', timeout: 5000 });
        
        const gpuLines = nvidiaOutput.trim().split('\n');
        gpuInfo = gpuLines.map(line => {
          const [name, totalMem, usedMem, freeMem] = line.split(', ');
          return {
            name: name.trim(),
            totalMemory: parseInt(totalMem),
            usedMemory: parseInt(usedMem),
            freeMemory: parseInt(freeMem),
            usagePercent: (parseInt(usedMem) / parseInt(totalMem)) * 100
          };
        });
      } catch (error) {
        // Se não conseguir detectar GPU NVIDIA, tenta outros métodos
        try {
          // Tenta detectar GPU AMD
          const lspciOutput = execSync('lspci | grep -i vga', { encoding: 'utf8', timeout: 5000 });
          if (lspciOutput.includes('AMD') || lspciOutput.includes('ATI')) {
            gpuInfo = [{ name: 'AMD GPU detected', type: 'amd' }];
          } else if (lspciOutput.includes('Intel')) {
            gpuInfo = [{ name: 'Intel GPU detected', type: 'intel' }];
          }
        } catch (innerError) {
          // Sem GPU detectada ou erro na detecção
          gpuInfo = null;
        }
      }

      const systemInfo = {
        cpu: {
          count: cpuCount,
          model: os.cpus()[0].model,
          speed: os.cpus()[0].speed
        },
        memory: {
          total: totalMemory,
          used: usedMemory,
          free: freeMemory,
          usagePercent: memoryUsagePercent
        },
        gpu: gpuInfo,
        platform: os.platform(),
        arch: os.arch(),
        loadAvg: os.loadavg(),
        uptime: os.uptime()
      };

      this.systemInfo = systemInfo;
      return systemInfo;
    } catch (error) {
      console.warn('Error detecting system resources:', error.message);
      // Fallback para informações básicas
      return {
        cpu: {
          count: os.cpus().length,
          model: os.cpus()[0].model,
          speed: os.cpus()[0].speed
        },
        memory: {
          total: os.totalmem(),
          used: os.totalmem() - os.freemem(),
          free: os.freemem(),
          usagePercent: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
        },
        gpu: null,
        platform: os.platform(),
        arch: os.arch(),
        loadAvg: os.loadavg(),
        uptime: os.uptime()
      };
    }
  }

  calculateOptimalWorkerCount() {
    if (!this.systemInfo) {
      throw new Error('System resources not detected. Call detectSystemResources() first.');
    }

    const { cpu, memory, gpu, loadAvg } = this.systemInfo;
    
    // Fatores de cálculo
    let baseWorkerCount = Math.floor(cpu.count * 0.8); // 80% dos cores disponíveis
    
    // Ajuste baseado na memória disponível
    const memoryGB = memory.total / (1024 * 1024 * 1024);
    const memoryFactor = Math.floor(memoryGB / 2); // 1 worker por 2GB de RAM
    
    // Ajuste baseado no uso atual de memória
    if (memory.usagePercent > this.config.memoryThreshold) {
      baseWorkerCount = Math.max(this.config.minWorkers, Math.floor(baseWorkerCount * 0.6));
    } else if (memory.usagePercent > this.config.memoryThreshold * 0.75) {
      baseWorkerCount = Math.max(this.config.minWorkers, Math.floor(baseWorkerCount * 0.8));
    }
    
    // Ajuste baseado na carga do sistema
    const currentLoad = loadAvg[0]; // Carga média no último minuto
    const loadPerCore = currentLoad / cpu.count;
    const cpuThresholdDecimal = this.config.cpuThreshold / 100;
    
    if (loadPerCore > cpuThresholdDecimal) {
      baseWorkerCount = Math.max(this.config.minWorkers, Math.floor(baseWorkerCount * 0.7));
    } else if (loadPerCore > cpuThresholdDecimal * 0.75) {
      baseWorkerCount = Math.max(this.config.minWorkers, Math.floor(baseWorkerCount * 0.9));
    }
    
    // Ajuste baseado na presença de GPU
    if (gpu && gpu.length > 0) {
      // Se tem GPU, pode usar mais workers para processar CPU tasks
      const gpuBonus = gpu.length * 2;
      baseWorkerCount = Math.min(baseWorkerCount + gpuBonus, cpu.count);
    }
    
    // Limites mínimos e máximos
    const minWorkers = this.config.minWorkers;
    const maxWorkers = Math.min(this.config.maxWorkers, Math.max(cpu.count, this.config.maxWorkers)); // Respeitando configuração e número de cores
    
    // Considera limites de memória
    const memoryLimitedWorkers = Math.floor(memory.free / (512 * 1024 * 1024)); // 512MB por worker
    
    const finalWorkerCount = Math.max(
      minWorkers,
      Math.min(baseWorkerCount, maxWorkers, memoryLimitedWorkers, memoryFactor)
    );
    
    return {
      recommended: finalWorkerCount,
      factors: {
        cpuBased: Math.floor(cpu.count * 0.8),
        memoryBased: memoryFactor,
        loadBased: baseWorkerCount,
        memoryLimited: memoryLimitedWorkers,
        gpuBonus: gpu ? gpu.length * 2 : 0
      },
      systemInfo: {
        cpuCount: cpu.count,
        memoryGB: Math.round(memoryGB),
        memoryUsagePercent: Math.round(memory.usagePercent),
        currentLoad: Math.round(loadPerCore * 100),
        hasGpu: gpu && gpu.length > 0,
        gpuCount: gpu ? gpu.length : 0
      }
    };
  }

  async getOptimalWorkerCount(forceRecalculate = false) {
    const now = Date.now();
    
    // Usa cache se disponível e não expirado
    if (!forceRecalculate && this.lastCalculation && this.workerCount && 
        (now - this.lastCalculation) < this.cacheTTL) {
      return this.workerCount;
    }
    
    // Detecta recursos do sistema
    await this.detectSystemResources();
    
    // Calcula número otimizado de workers
    const result = this.calculateOptimalWorkerCount();
    
    this.workerCount = result;
    this.lastCalculation = now;
    
    return result;
  }

  async getSystemReport() {
    if (!this.systemInfo) {
      await this.detectSystemResources();
    }
    
    const workerInfo = await this.getOptimalWorkerCount();
    
    return {
      timestamp: new Date().toISOString(),
      system: this.systemInfo,
      recommendedWorkers: workerInfo,
      performance: {
        memoryPressure: this.systemInfo.memory.usagePercent > this.config.memoryThreshold ? 'high' : 
                      this.systemInfo.memory.usagePercent > this.config.memoryThreshold * 0.75 ? 'medium' : 'low',
        cpuLoad: this.systemInfo.loadAvg[0] / this.systemInfo.cpu.count > this.config.cpuThreshold / 100 ? 'high' :
                this.systemInfo.loadAvg[0] / this.systemInfo.cpu.count > this.config.cpuThreshold * 0.75 / 100 ? 'medium' : 'low',
        recommendation: this.getPerformanceRecommendation()
      }
    };
  }

  getPerformanceRecommendation() {
    if (!this.systemInfo) {
      return 'Run system detection first';
    }
    
    const { memory, loadAvg, cpu } = this.systemInfo;
    const recommendations = [];
    
    if (memory.usagePercent > this.config.memoryThreshold) {
      recommendations.push('High memory usage detected. Consider reducing worker count or increasing system RAM.');
    }
    
    if (loadAvg[0] / cpu.count > this.config.cpuThreshold / 100) {
      recommendations.push('High CPU load detected. Consider reducing worker count or optimizing processes.');
    }
    
    if (memory.usagePercent < this.config.memoryThreshold * 0.375 && loadAvg[0] / cpu.count < this.config.cpuThreshold * 0.5 / 100) {
      recommendations.push('System resources are underutilized. Consider increasing worker count for better performance.');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('System resources are well balanced for current workload.');
    }
    
    return recommendations;
  }

  // Método para monitoramento contínuo
  startMonitoring(intervalMs = null, callback = null) {
    const monitoringInterval = intervalMs || this.config.interval;
    return setInterval(async () => {
      try {
        const report = await this.getSystemReport();
        
        if (callback && typeof callback === 'function') {
          callback(report);
        }
        
        // Log automático de mudanças significativas
        if (this.workerCount && 
            Math.abs(report.recommendedWorkers.recommended - this.workerCount.recommended) > 1) {
          console.log(`[WorkerAutoScaler] Worker count recommendation changed: ${this.workerCount.recommended} -> ${report.recommendedWorkers.recommended}`);
        }
        
      } catch (error) {
        console.error('[WorkerAutoScaler] Monitoring error:', error.message);
      }
    }, monitoringInterval);
  }

  // Método para obter a configuração atual
  getConfig() {
    return {
      ...this.config,
      currentCacheTTL: this.cacheTTL
    };
  }
}

module.exports = WorkerAutoScaler;