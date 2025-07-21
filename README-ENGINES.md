# WhisperAPI - Engine Comparison Guide

WhisperAPI supports three different Whisper engine implementations, each with unique characteristics and optimal use cases.

## 🚀 Available Engines

### 1. whisper.cpp (Default)
**Original C++ implementation**
- ⚡ **Fastest startup time**
- 💾 **Low memory usage**
- 🔧 **Easy installation** (no Python dependencies)
- 📱 **CPU optimized**
- 🎯 **Best for**: Production environments with limited resources

**Configuration:**
```bash
WHISPER_ENGINE=whisper.cpp
```

### 2. faster-whisper
**Python implementation with CTranslate2**
- ⚡ **Faster inference** than whisper.cpp
- 🎯 **Better accuracy** for complex audio
- 🐍 **Requires Python** and additional dependencies
- 💾 **Medium memory usage**
- 🎯 **Best for**: Balanced performance and accuracy

**Configuration:**
```bash
WHISPER_ENGINE=faster-whisper
FASTER_WHISPER_DEVICE=cpu  # or cuda
FASTER_WHISPER_COMPUTE_TYPE=int8
```

### 3. insanely-fast-whisper
**Transformers-based implementation**
- 🏆 **Fastest processing** (especially with GPU)
- 🤖 **Latest transformer optimizations**
- 🖥️ **GPU accelerated** (CUDA recommended)
- 📦 **Batch processing support**
- 🎯 **Best for**: High-throughput scenarios with GPU

**Configuration:**
```bash
WHISPER_ENGINE=insanely-fast-whisper
INSANELY_FAST_WHISPER_MODEL=openai/whisper-large-v3-turbo
INSANELY_FAST_WHISPER_DEVICE=auto  # auto, cpu, cuda
INSANELY_FAST_WHISPER_TORCH_DTYPE=auto  # auto, float16, float32
INSANELY_FAST_WHISPER_BATCH_SIZE=24
INSANELY_FAST_WHISPER_CHUNK_LENGTH_S=30
```

## 📊 Performance Comparison

| Feature | whisper.cpp | faster-whisper | insanely-fast-whisper |
|---------|------------|----------------|----------------------|
| **Startup Time** | 🥇 Fastest | 🥈 Medium | 🥉 Slowest |
| **Processing Speed (CPU)** | 🥉 Baseline | 🥈 2-4x faster | 🥇 2-8x faster |
| **Processing Speed (GPU)** | ❌ N/A | 🥈 Fast | 🥇 Very Fast |
| **Memory Usage** | 🥇 Low | 🥈 Medium | 🥉 High |
| **Installation** | 🥇 Simple | 🥈 Medium | 🥉 Complex |
| **Dependencies** | 🥇 Minimal | 🥈 Python + libs | 🥉 Python + PyTorch |
| **Accuracy** | 🥈 Good | 🥇 Very Good | 🥇 Very Good |
| **Word Timestamps** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Batch Processing** | ❌ No | ⚠️ Limited | ✅ Yes |

## 🛠️ Installation

### Prerequisites (All Engines)
```bash
# Node.js dependencies
npm install

# FFmpeg (required for all engines)
sudo apt update && sudo apt install ffmpeg
```

### whisper.cpp (Default)
```bash
# Already installed with npm install
# No additional setup required
```

### faster-whisper
```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install faster-whisper
```

### insanely-fast-whisper
```bash
# Use the automated installation script
./scripts/install-insanely-fast-whisper.sh

# Or manual installation:
source venv/bin/activate
pip install torch transformers librosa numpy
```

## 🧪 Testing & Benchmarking

### Quick Engine Test
Test all three engines with the same audio file:
```bash
node test-engine-toggle.js
```

### Comprehensive Benchmark
Run detailed performance comparison:
```bash
node test-engine-benchmark.js
```

The benchmark will test each engine and generate a detailed report including:
- Processing times
- Memory usage
- Accuracy comparison
- Performance rankings

## 🎯 Choosing the Right Engine

### Use **whisper.cpp** when:
- 🏃‍♂️ You need fast startup times
- 💰 Running on limited hardware/budget
- 🐳 Deploying in containers
- 🔧 You want minimal dependencies
- 📱 CPU-only environment

### Use **faster-whisper** when:
- ⚖️ You need balanced performance/accuracy
- 🎯 Processing quality is important
- 💾 You have moderate memory available
- 🐍 Python environment is acceptable

### Use **insanely-fast-whisper** when:
- 🏆 Maximum speed is priority
- 🖥️ GPU acceleration is available
- 📈 High-throughput processing needed
- 🤖 You want latest AI optimizations
- 📦 Batch processing is required

## 🔧 Configuration Examples

### Development Setup (Quick Start)
```bash
# .env
WHISPER_ENGINE=whisper.cpp
AUTO_DOWNLOAD_MODEL=small
MAX_WORKERS=2
```

### Production Setup (Balanced)
```bash
# .env
WHISPER_ENGINE=faster-whisper
FASTER_WHISPER_DEVICE=cpu
FASTER_WHISPER_COMPUTE_TYPE=int8
AUTO_DOWNLOAD_MODEL=large-v3-turbo
MAX_WORKERS=4
```

### High-Performance Setup (GPU)
```bash
# .env
WHISPER_ENGINE=insanely-fast-whisper
INSANELY_FAST_WHISPER_MODEL=openai/whisper-large-v3-turbo
INSANELY_FAST_WHISPER_DEVICE=auto
INSANELY_FAST_WHISPER_TORCH_DTYPE=float16
INSANELY_FAST_WHISPER_BATCH_SIZE=24
MAX_WORKERS=2  # Fewer workers needed with GPU
```

## 📈 Performance Tips

### General Optimization
- Use appropriate model size for your accuracy needs
- Monitor memory usage with `GET /system-report`
- Enable auto-scaling: `AUTO_SCALE=true`

### whisper.cpp Optimization
```bash
# Use smaller models for speed
AUTO_DOWNLOAD_MODEL=small  # or tiny for maximum speed

# Increase workers for CPU parallelization
MAX_WORKERS=4
```

### faster-whisper Optimization
```bash
# Use int8 for speed, float16 for accuracy
FASTER_WHISPER_COMPUTE_TYPE=int8

# Enable GPU if available
FASTER_WHISPER_DEVICE=cuda
```

### insanely-fast-whisper Optimization
```bash
# Increase batch size for GPU utilization
INSANELY_FAST_WHISPER_BATCH_SIZE=32

# Use float16 for GPU speed
INSANELY_FAST_WHISPER_TORCH_DTYPE=float16

# Adjust chunk length for memory/speed balance
INSANELY_FAST_WHISPER_CHUNK_LENGTH_S=30
```

## 🐛 Troubleshooting

### Common Issues

**whisper.cpp startup fails:**
```bash
# Check model files
ls models/
# Re-download if needed
rm models/* && npm run postinstall
```

**faster-whisper import errors:**
```bash
# Ensure virtual environment is activated
source venv/bin/activate
pip install --upgrade faster-whisper
```

**insanely-fast-whisper CUDA issues:**
```bash
# Check CUDA installation
nvidia-smi
python3 -c "import torch; print(torch.cuda.is_available())"

# Reinstall PyTorch with CUDA
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

### Getting Help

1. Check server logs: `tail -f server.log`
2. Run health check: `curl http://localhost:3001/health`
3. View system report: `curl http://localhost:3001/system-report`
4. Test individual engines: `node test-engine-toggle.js`

## 🚀 Quick Start

1. **Choose your engine** based on requirements above
2. **Install dependencies** using appropriate method
3. **Configure .env** with your engine settings
4. **Start server**: `node src/server.js`
5. **Test**: `node test-engine-toggle.js`
6. **Benchmark**: `node test-engine-benchmark.js`

Happy transcribing! 🎤✨