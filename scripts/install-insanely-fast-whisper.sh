#!/bin/bash

# Insanely Fast Whisper Installation Script
# This script installs all dependencies for insanely-fast-whisper engine

set -e  # Exit on any error

echo "🚀 Installing Insanely Fast Whisper Dependencies..."
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running in virtual environment
check_venv() {
    if [[ "$VIRTUAL_ENV" != "" ]]; then
        print_success "Virtual environment detected: $VIRTUAL_ENV"
        return 0
    elif [[ -d "./venv" ]]; then
        print_status "Local venv directory found, activating..."
        source ./venv/bin/activate
        print_success "Activated local virtual environment"
        return 0
    else
        print_warning "No virtual environment detected. Creating one..."
        python3 -m venv venv
        source ./venv/bin/activate
        print_success "Created and activated new virtual environment"
        return 0
    fi
}

# Check Python version
check_python() {
    print_status "Checking Python version..."
    
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 is not installed. Please install Python 3.8 or higher."
        exit 1
    fi
    
    PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    REQUIRED_VERSION="3.8"
    
    if python3 -c "import sys; exit(0 if sys.version_info >= (3, 8) else 1)"; then
        print_success "Python $PYTHON_VERSION detected (minimum 3.8 required)"
    else
        print_error "Python $PYTHON_VERSION detected, but 3.8 or higher is required"
        exit 1
    fi
}

# Check CUDA availability
check_cuda() {
    print_status "Checking CUDA availability..."
    
    if command -v nvidia-smi &> /dev/null; then
        GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null || echo "")
        if [[ -n "$GPU_INFO" ]]; then
            print_success "NVIDIA GPU detected:"
            echo "$GPU_INFO" | while read line; do
                echo "   - $line MB"
            done
            export CUDA_AVAILABLE=true
        else
            print_warning "nvidia-smi found but no GPU information available"
            export CUDA_AVAILABLE=false
        fi
    else
        print_warning "NVIDIA GPU not detected. Will install CPU-only version."
        export CUDA_AVAILABLE=false
    fi
}

# Install PyTorch
install_pytorch() {
    print_status "Installing PyTorch..."
    
    if [[ "$CUDA_AVAILABLE" == "true" ]]; then
        print_status "Installing PyTorch with CUDA support..."
        pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
    else
        print_status "Installing PyTorch CPU-only version..."
        pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
    fi
    
    # Test PyTorch installation
    python3 -c "import torch; print(f'PyTorch {torch.__version__} installed successfully')"
    
    if [[ "$CUDA_AVAILABLE" == "true" ]]; then
        CUDA_AVAILABLE_TORCH=$(python3 -c "import torch; print(torch.cuda.is_available())" 2>/dev/null || echo "False")
        if [[ "$CUDA_AVAILABLE_TORCH" == "True" ]]; then
            CUDA_DEVICE_COUNT=$(python3 -c "import torch; print(torch.cuda.device_count())" 2>/dev/null || echo "0")
            print_success "CUDA support enabled in PyTorch ($CUDA_DEVICE_COUNT device(s) available)"
        else
            print_warning "CUDA support not available in PyTorch (will use CPU)"
        fi
    fi
}

# Install Transformers and related packages
install_transformers() {
    print_status "Installing Transformers and related packages..."
    
    # Core transformers dependencies
    pip install transformers>=4.21.0
    pip install accelerate
    pip install datasets
    pip install optimum
    
    # Audio processing dependencies
    pip install librosa
    pip install soundfile
    
    # Additional optimization packages
    if [[ "$CUDA_AVAILABLE" == "true" ]]; then
        print_status "Installing CUDA-optimized packages..."
        pip install flash-attn --no-build-isolation || print_warning "flash-attn installation failed (optional)"
    fi
    
    print_success "Transformers ecosystem installed successfully"
}

# Install additional dependencies
install_additional_deps() {
    print_status "Installing additional dependencies..."
    
    # Scientific computing
    pip install numpy
    pip install scipy
    
    # Audio processing
    pip install librosa
    pip install soundfile
    pip install audioread
    
    # Utilities
    pip install tqdm
    pip install requests
    pip install Pillow
    
    print_success "Additional dependencies installed"
}

# Test insanely-fast-whisper functionality
test_installation() {
    print_status "Testing insanely-fast-whisper installation..."
    
    # Test import
    python3 -c "
import torch
import transformers
import librosa
import numpy as np
from transformers import pipeline, AutoModelForSpeechSeq2Seq, AutoProcessor

print('✅ All imports successful')
print(f'PyTorch version: {torch.__version__}')
print(f'Transformers version: {transformers.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'CUDA devices: {torch.cuda.device_count()}')
    for i in range(torch.cuda.device_count()):
        print(f'  Device {i}: {torch.cuda.get_device_name(i)}')
"

    # Test model loading (small model for quick test)
    print_status "Testing model loading with tiny model..."
    python3 -c "
from transformers import pipeline
import torch

device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

try:
    pipe = pipeline(
        'automatic-speech-recognition',
        model='openai/whisper-tiny',
        torch_dtype=torch_dtype,
        device=device,
    )
    print('✅ Model loading test successful')
except Exception as e:
    print(f'❌ Model loading test failed: {e}')
    raise
"
    
    print_success "Installation test completed successfully!"
}

# Download recommended models
download_models() {
    print_status "Pre-downloading recommended models..."
    
    # List of models to pre-download
    MODELS=(
        "openai/whisper-tiny"
        "openai/whisper-base"
        "openai/whisper-small"
    )
    
    # Only download large models if CUDA is available
    if [[ "$CUDA_AVAILABLE" == "true" ]]; then
        MODELS+=("openai/whisper-large-v3-turbo")
    fi
    
    for model in "${MODELS[@]}"; do
        print_status "Downloading model: $model"
        python3 -c "
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor
try:
    model = AutoModelForSpeechSeq2Seq.from_pretrained('$model')
    processor = AutoProcessor.from_pretrained('$model')
    print('✅ $model downloaded successfully')
except Exception as e:
    print('❌ Failed to download $model: ' + str(e))
"
    done
    
    print_success "Model pre-download completed"
}

# Update environment configuration
update_env_config() {
    print_status "Updating environment configuration..."
    
    ENV_FILE=".env"
    
    if [[ ! -f "$ENV_FILE" ]]; then
        if [[ -f ".env.example" ]]; then
            cp .env.example "$ENV_FILE"
            print_status "Created .env from .env.example"
        else
            print_warning ".env.example not found, creating basic .env"
            touch "$ENV_FILE"
        fi
    fi
    
    # Update insanely-fast-whisper specific settings
    if [[ "$CUDA_AVAILABLE" == "true" ]]; then
        print_status "Configuring for CUDA usage..."
        
        # Update .env for CUDA usage
        if grep -q "INSANELY_FAST_WHISPER_DEVICE=" "$ENV_FILE"; then
            sed -i 's/INSANELY_FAST_WHISPER_DEVICE=.*/INSANELY_FAST_WHISPER_DEVICE=auto/' "$ENV_FILE"
        else
            echo "INSANELY_FAST_WHISPER_DEVICE=auto" >> "$ENV_FILE"
        fi
        
        if grep -q "INSANELY_FAST_WHISPER_TORCH_DTYPE=" "$ENV_FILE"; then
            sed -i 's/INSANELY_FAST_WHISPER_TORCH_DTYPE=.*/INSANELY_FAST_WHISPER_TORCH_DTYPE=float16/' "$ENV_FILE"
        else
            echo "INSANELY_FAST_WHISPER_TORCH_DTYPE=float16" >> "$ENV_FILE"
        fi
    else
        print_status "Configuring for CPU usage..."
        
        # Update .env for CPU usage
        if grep -q "INSANELY_FAST_WHISPER_DEVICE=" "$ENV_FILE"; then
            sed -i 's/INSANELY_FAST_WHISPER_DEVICE=.*/INSANELY_FAST_WHISPER_DEVICE=cpu/' "$ENV_FILE"
        else
            echo "INSANELY_FAST_WHISPER_DEVICE=cpu" >> "$ENV_FILE"
        fi
        
        if grep -q "INSANELY_FAST_WHISPER_TORCH_DTYPE=" "$ENV_FILE"; then
            sed -i 's/INSANELY_FAST_WHISPER_TORCH_DTYPE=.*/INSANELY_FAST_WHISPER_TORCH_DTYPE=float32/' "$ENV_FILE"
        else
            echo "INSANELY_FAST_WHISPER_TORCH_DTYPE=float32" >> "$ENV_FILE"
        fi
    fi
    
    print_success "Environment configuration updated"
}

# Main installation process
main() {
    print_status "Starting Insanely Fast Whisper installation..."
    
    check_python
    check_venv
    check_cuda
    
    print_status "Upgrading pip..."
    pip install --upgrade pip
    
    install_pytorch
    install_transformers
    install_additional_deps
    
    test_installation
    
    # Ask user if they want to download models
    echo ""
    read -p "Do you want to pre-download recommended models? This will take some time but improve first-run performance. (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        download_models
    else
        print_status "Skipping model pre-download. Models will be downloaded on first use."
    fi
    
    update_env_config
    
    echo ""
    print_success "🎉 Insanely Fast Whisper installation completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Set WHISPER_ENGINE=insanely-fast-whisper in your .env file"
    echo "2. Start the server with: node src/server.js"
    echo "3. Test with: node test-engine-toggle.js"
    echo ""
    echo "Configuration details:"
    echo "- Models will be automatically downloaded on first use"
    if [[ "$CUDA_AVAILABLE" == "true" ]]; then
        echo "- GPU acceleration: Enabled"
    else
        echo "- GPU acceleration: Disabled (CPU only)"
    fi
    echo "- Default model: openai/whisper-large-v3-turbo"
    echo ""
    echo "For benchmarking all engines, run: node test-engine-benchmark.js"
}

# Run main installation
main "$@"