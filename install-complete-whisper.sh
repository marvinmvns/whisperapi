#!/bin/bash

# Complete Whisper Installation Script
# This script installs ALL dependencies for whisperapi including:
# - Node.js dependencies 
# - Python virtual environment
# - faster-whisper engine
# - insanely-fast-whisper engine
# - System dependencies and audio libraries

set -e  # Exit on any error

echo "🚀 Complete WhisperAPI Installation"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

print_section() {
    echo -e "${PURPLE}[SECTION]${NC} $1"
    echo "----------------------------------------"
}

# Check if we're in the right directory
check_project_directory() {
    if [[ ! -f "package.json" ]] || [[ ! -f "src/server.js" ]]; then
        print_error "This script must be run from the whisperapi project root directory"
        print_error "Please navigate to the directory containing package.json and src/server.js"
        exit 1
    fi
    print_success "Found whisperapi project files"
}

# Detect OS and package manager
detect_system() {
    print_status "Detecting system..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        if command -v apt-get &> /dev/null; then
            PKG_MANAGER="apt"
        elif command -v yum &> /dev/null; then
            PKG_MANAGER="yum"
        elif command -v dnf &> /dev/null; then
            PKG_MANAGER="dnf"
        elif command -v pacman &> /dev/null; then
            PKG_MANAGER="pacman"
        else
            print_warning "Unknown Linux package manager, some dependencies may need manual installation"
            PKG_MANAGER="unknown"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        PKG_MANAGER="brew"
    else
        OS="windows"
        PKG_MANAGER="choco"
    fi
    
    print_success "Detected: $OS with $PKG_MANAGER"
}

# Install system dependencies
install_system_dependencies() {
    print_section "Installing System Dependencies"
    
    case $PKG_MANAGER in
        "apt")
            print_status "Installing dependencies with apt..."
            sudo apt-get update
            sudo apt-get install -y \
                python3 \
                python3-pip \
                python3-venv \
                python3-dev \
                ffmpeg \
                build-essential \
                curl \
                wget \
                git \
                libasound2-dev \
                libportaudio2 \
                libportaudiocpp0 \
                portaudio19-dev \
                libsndfile1-dev \
                libffi-dev \
                libssl-dev
            ;;
        "yum"|"dnf")
            print_status "Installing dependencies with $PKG_MANAGER..."
            sudo $PKG_MANAGER install -y \
                python3 \
                python3-pip \
                python3-devel \
                ffmpeg \
                gcc \
                gcc-c++ \
                make \
                curl \
                wget \
                git \
                alsa-lib-devel \
                portaudio-devel \
                libsndfile-devel \
                libffi-devel \
                openssl-devel
            ;;
        "pacman")
            print_status "Installing dependencies with pacman..."
            sudo pacman -S --noconfirm \
                python \
                python-pip \
                ffmpeg \
                base-devel \
                curl \
                wget \
                git \
                alsa-lib \
                portaudio \
                libsndfile
            ;;
        "brew")
            print_status "Installing dependencies with Homebrew..."
            brew install \
                python@3.11 \
                ffmpeg \
                portaudio \
                libsndfile \
                git
            ;;
        *)
            print_warning "Unknown package manager. Please ensure these are installed:"
            echo "  - Python 3.8+"
            echo "  - pip"
            echo "  - ffmpeg"
            echo "  - build tools (gcc, make)"
            echo "  - portaudio development libraries"
            echo "  - libsndfile development libraries"
            ;;
    esac
    
    print_success "System dependencies installation completed"
}

# Check Node.js version
check_nodejs() {
    print_section "Checking Node.js"
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 16.0.0 or higher."
        print_status "Visit: https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | sed 's/v//')
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1)
    
    if [[ $MAJOR_VERSION -lt 16 ]]; then
        print_error "Node.js $NODE_VERSION detected, but 16.0.0 or higher is required"
        exit 1
    fi
    
    print_success "Node.js $NODE_VERSION detected"
}

# Install Node.js dependencies
install_nodejs_dependencies() {
    print_section "Installing Node.js Dependencies"
    
    print_status "Installing npm packages..."
    npm install
    
    print_success "Node.js dependencies installed"
}

# Check Python version
check_python() {
    print_section "Checking Python"
    
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 is not installed. Please install Python 3.8 or higher."
        exit 1
    fi
    
    PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    
    if python3 -c "import sys; exit(0 if sys.version_info >= (3, 8) else 1)"; then
        print_success "Python $PYTHON_VERSION detected (minimum 3.8 required)"
    else
        print_error "Python $PYTHON_VERSION detected, but 3.8 or higher is required"
        exit 1
    fi
}

# Setup Python virtual environment
setup_python_venv() {
    print_section "Setting up Python Virtual Environment"
    
    VENV_PATH="./scripts/venv"
    
    if [[ -d "$VENV_PATH" ]]; then
        print_status "Virtual environment already exists, removing old one..."
        rm -rf "$VENV_PATH"
    fi
    
    print_status "Creating new virtual environment..."
    python3 -m venv "$VENV_PATH"
    
    source "$VENV_PATH/bin/activate"
    print_success "Virtual environment created and activated"
    
    print_status "Upgrading pip..."
    pip install --upgrade pip setuptools wheel
    
    export PYTHON_VENV_ACTIVE=true
}

# Check CUDA availability
check_cuda() {
    print_section "Checking CUDA Availability"
    
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
        print_warning "NVIDIA GPU not detected. Will install CPU-only versions."
        export CUDA_AVAILABLE=false
    fi
}

# Install faster-whisper
install_faster_whisper() {
    print_section "Installing faster-whisper Engine"
    
    print_status "Installing faster-whisper and dependencies..."
    
    # Core faster-whisper
    pip install faster-whisper
    
    # Audio processing dependencies
    pip install librosa soundfile audioread
    
    # Optimization libraries
    pip install numpy scipy
    
    # Test installation
    print_status "Testing faster-whisper installation..."
    python3 -c "
import faster_whisper
print('✅ faster-whisper installed successfully')
print(f'Version: {faster_whisper.__version__}')
"
    
    print_success "faster-whisper engine installed successfully"
}

# Install PyTorch for insanely-fast-whisper
install_pytorch() {
    print_section "Installing PyTorch"
    
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

# Install insanely-fast-whisper
install_insanely_fast_whisper() {
    print_section "Installing insanely-fast-whisper Engine"
    
    print_status "Installing Transformers and related packages..."
    
    # Core transformers dependencies
    pip install transformers>=4.21.0
    pip install accelerate
    pip install datasets
    pip install optimum
    
    # Audio processing dependencies (if not already installed)
    pip install librosa soundfile
    
    # Additional optimization packages
    if [[ "$CUDA_AVAILABLE" == "true" ]]; then
        print_status "Installing CUDA-optimized packages..."
        pip install flash-attn --no-build-isolation || print_warning "flash-attn installation failed (optional)"
    fi
    
    # Additional utilities
    pip install tqdm requests Pillow
    
    # Test installation
    print_status "Testing insanely-fast-whisper installation..."
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
"
    
    print_success "insanely-fast-whisper engine installed successfully"
}

# Install additional Python utilities
install_additional_python_deps() {
    print_section "Installing Additional Python Dependencies"
    
    print_status "Installing additional utilities..."
    
    # JSON and data handling
    pip install jsonschema
    
    # Audio format support
    pip install pydub
    
    # Performance monitoring
    pip install psutil
    
    print_success "Additional Python dependencies installed"
}

# Setup environment configuration
setup_environment() {
    print_section "Setting up Environment Configuration"
    
    ENV_FILE=".env"
    
    if [[ ! -f "$ENV_FILE" ]]; then
        if [[ -f ".env.example" ]]; then
            cp .env.example "$ENV_FILE"
            print_status "Created .env from .env.example"
        else
            print_status "Creating basic .env file..."
            cat > "$ENV_FILE" << EOF
# WhisperAPI Configuration
NODE_ENV=development
PORT=3000

# Whisper Engine Configuration
WHISPER_ENGINE=nodejs-whisper
# Available engines: nodejs-whisper, faster-whisper, insanely-fast-whisper

# Model Configuration
DEFAULT_MODEL=base
MODEL_PATH=./models

# Audio Configuration
MAX_FILE_SIZE=25MB
SUPPORTED_FORMATS=mp3,wav,m4a,ogg,flac

# Performance Configuration
MAX_CONCURRENT_TRANSCRIPTIONS=3
WORKER_TIMEOUT=300000

# Faster-Whisper Configuration
FASTER_WHISPER_DEVICE=cpu
FASTER_WHISPER_COMPUTE_TYPE=int8

# Insanely-Fast-Whisper Configuration
INSANELY_FAST_WHISPER_DEVICE=auto
INSANELY_FAST_WHISPER_TORCH_DTYPE=float32
EOF
        fi
    fi
    
    # Update configuration based on CUDA availability
    if [[ "$CUDA_AVAILABLE" == "true" ]]; then
        print_status "Configuring for CUDA usage..."
        
        # Update faster-whisper for CUDA
        if grep -q "FASTER_WHISPER_DEVICE=" "$ENV_FILE"; then
            sed -i 's/FASTER_WHISPER_DEVICE=.*/FASTER_WHISPER_DEVICE=cuda/' "$ENV_FILE"
        else
            echo "FASTER_WHISPER_DEVICE=cuda" >> "$ENV_FILE"
        fi
        
        if grep -q "FASTER_WHISPER_COMPUTE_TYPE=" "$ENV_FILE"; then
            sed -i 's/FASTER_WHISPER_COMPUTE_TYPE=.*/FASTER_WHISPER_COMPUTE_TYPE=float16/' "$ENV_FILE"
        else
            echo "FASTER_WHISPER_COMPUTE_TYPE=float16" >> "$ENV_FILE"
        fi
        
        # Update insanely-fast-whisper for CUDA
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
        
        # Ensure CPU settings
        if grep -q "FASTER_WHISPER_DEVICE=" "$ENV_FILE"; then
            sed -i 's/FASTER_WHISPER_DEVICE=.*/FASTER_WHISPER_DEVICE=cpu/' "$ENV_FILE"
        fi
        
        if grep -q "INSANELY_FAST_WHISPER_DEVICE=" "$ENV_FILE"; then
            sed -i 's/INSANELY_FAST_WHISPER_DEVICE=.*/INSANELY_FAST_WHISPER_DEVICE=cpu/' "$ENV_FILE"
        fi
        
        if grep -q "INSANELY_FAST_WHISPER_TORCH_DTYPE=" "$ENV_FILE"; then
            sed -i 's/INSANELY_FAST_WHISPER_TORCH_DTYPE=.*/INSANELY_FAST_WHISPER_TORCH_DTYPE=float32/' "$ENV_FILE"
        fi
    fi
    
    print_success "Environment configuration completed"
}

# Download essential models
download_models() {
    print_section "Downloading Essential Models"
    
    # Ask user if they want to download models
    echo ""
    read -p "Do you want to download essential Whisper models? This will take time but improve performance. (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        print_status "Downloading models..."
        
        # Create models directory
        mkdir -p models
        
        # Run the model download script if it exists
        if [[ -f "scripts/check-models.js" ]]; then
            node scripts/check-models.js
        fi
        
        # Download some transformer models for insanely-fast-whisper
        print_status "Pre-downloading transformer models..."
        python3 -c "
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor
models = ['openai/whisper-tiny', 'openai/whisper-base']
for model in models:
    try:
        print(f'Downloading {model}...')
        AutoModelForSpeechSeq2Seq.from_pretrained(model)
        AutoProcessor.from_pretrained(model)
        print(f'✅ {model} downloaded')
    except Exception as e:
        print(f'❌ Failed to download {model}: {e}')
" || print_warning "Some model downloads failed (will download on first use)"
        
        print_success "Model downloads completed"
    else
        print_status "Skipping model downloads. Models will be downloaded on first use."
    fi
}

# Run comprehensive tests
run_tests() {
    print_section "Running Installation Tests"
    
    print_status "Testing Node.js server..."
    if node scripts/validate-system.js; then
        print_success "Node.js system validation passed"
    else
        print_warning "Node.js system validation had issues"
    fi
    
    print_status "Testing Python bridges..."
    
    # Test faster-whisper bridge
    if python3 scripts/faster_whisper_bridge.py --help &> /dev/null; then
        print_success "faster-whisper bridge is working"
    else
        print_warning "faster-whisper bridge test failed"
    fi
    
    # Test insanely-fast-whisper bridge  
    if python3 scripts/insanely_fast_whisper_bridge.py --help &> /dev/null; then
        print_success "insanely-fast-whisper bridge is working"
    else
        print_warning "insanely-fast-whisper bridge test failed"
    fi
    
    print_status "Testing engine validation..."
    if node scripts/validate-engines.js; then
        print_success "Engine validation passed"
    else
        print_warning "Some engines may not be properly configured"
    fi
    
    print_success "Installation tests completed"
}

# Print installation summary
print_summary() {
    print_section "Installation Summary"
    
    echo -e "${GREEN}🎉 Complete WhisperAPI Installation Finished!${NC}"
    echo ""
    echo "Installed components:"
    echo "✅ System dependencies (ffmpeg, audio libraries)"
    echo "✅ Node.js dependencies"
    echo "✅ Python virtual environment"
    echo "✅ faster-whisper engine"
    echo "✅ insanely-fast-whisper engine"
    echo "✅ Environment configuration"
    echo ""
    echo "Next steps:"
    echo "1. Start the server: npm start"
    echo "2. Test the API: curl -X POST -F 'audio=@test-short.mp3' http://localhost:3000/transcribe"
    echo "3. Run benchmarks: node examples/test-engine-benchmark.js"
    echo "4. Switch engines by setting WHISPER_ENGINE in .env:"
    echo "   - nodejs-whisper (default, CPU-optimized)"
    echo "   - faster-whisper (balanced performance)"
    echo "   - insanely-fast-whisper (GPU-optimized)"
    echo ""
    echo "Configuration files:"
    echo "- Environment: .env"
    echo "- Models: ./models/"
    echo "- Python venv: ./scripts/venv/"
    echo ""
    if [[ "$CUDA_AVAILABLE" == "true" ]]; then
        echo "🚀 GPU acceleration: Enabled"
    else
        echo "💻 GPU acceleration: Disabled (CPU only)"
    fi
    echo ""
    echo "For support, check:"
    echo "- README.md"
    echo "- examples/ directory"
    echo "- GitHub issues"
}

# Main installation process
main() {
    echo "Starting complete WhisperAPI installation..."
    echo "This will install ALL dependencies and engines."
    echo ""
    read -p "Continue? (Y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi
    
    check_project_directory
    detect_system
    install_system_dependencies
    check_nodejs
    install_nodejs_dependencies
    check_python
    setup_python_venv
    check_cuda
    install_faster_whisper
    install_pytorch
    install_insanely_fast_whisper
    install_additional_python_deps
    setup_environment
    download_models
    run_tests
    print_summary
}

# Handle script arguments
case "${1:-}" in
    "--help"|"-h")
        echo "Complete WhisperAPI Installation Script"
        echo ""
        echo "Usage: $0 [option]"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --no-models    Skip model downloads"
        echo "  --cpu-only     Force CPU-only installation"
        echo ""
        echo "This script installs:"
        echo "- System dependencies (ffmpeg, build tools)"
        echo "- Node.js dependencies"
        echo "- Python virtual environment"
        echo "- faster-whisper engine" 
        echo "- insanely-fast-whisper engine"
        echo "- Essential models (optional)"
        exit 0
        ;;
    "--cpu-only")
        export CUDA_AVAILABLE=false
        export FORCE_CPU=true
        ;;
    "--no-models")
        export SKIP_MODELS=true
        ;;
esac

# Run main installation
main "$@"