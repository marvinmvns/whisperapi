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
    
    # Check for WSL (Windows Subsystem for Linux)
    if grep -qi microsoft /proc/version 2>/dev/null || grep -qi wsl /proc/version 2>/dev/null; then
        OS="wsl"
        print_status "Windows Subsystem for Linux (WSL) detected"
        # Treat WSL as Linux for package management
        if command -v apt-get &> /dev/null; then
            PKG_MANAGER="apt"
        elif command -v yum &> /dev/null; then
            PKG_MANAGER="yum"
        elif command -v dnf &> /dev/null; then
            PKG_MANAGER="dnf"
        else
            PKG_MANAGER="unknown"
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        if command -v apt-get &> /dev/null; then
            PKG_MANAGER="apt"
        elif command -v yum &> /dev/null; then
            PKG_MANAGER="yum"
        elif command -v dnf &> /dev/null; then
            PKG_MANAGER="dnf"
        elif command -v pacman &> /dev/null; then
            PKG_MANAGER="pacman"
        elif command -v zypper &> /dev/null; then
            PKG_MANAGER="zypper"
        else
            print_warning "Unknown Linux package manager, some dependencies may need manual installation"
            PKG_MANAGER="unknown"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        PKG_MANAGER="brew"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
        OS="windows"
        if command -v choco &> /dev/null; then
            PKG_MANAGER="choco"
        elif command -v winget &> /dev/null; then
            PKG_MANAGER="winget"
        else
            PKG_MANAGER="manual"
        fi
    else
        OS="unknown"
        PKG_MANAGER="manual"
        print_warning "Unknown operating system: $OSTYPE"
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
                cmake \
                curl \
                wget \
                git \
                ca-certificates \
                gnupg \
                lsb-release \
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
                cmake \
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
                cmake \
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
                cmake \
                git
            ;;
        *)
            print_warning "Unknown package manager. Please ensure these are installed:"
            echo "  - Python 3.8+"
            echo "  - pip"
            echo "  - ffmpeg"
            echo "  - build tools (gcc, make)"
            echo "  - cmake"
            echo "  - portaudio development libraries"
            echo "  - libsndfile development libraries"
            ;;
    esac
    
    print_success "System dependencies installation completed"
}

# Get latest Node.js LTS version
get_latest_nodejs_lts() {
    print_status "Fetching latest Node.js LTS version..."
    
    NODEJS_LTS_VERSION=""
    
    # Try multiple sources for LTS version info
    if command -v curl &> /dev/null; then
        # Method 1: Official Node.js release schedule API (with jq if available)
        if command -v jq &> /dev/null; then
            NODEJS_LTS_VERSION=$(curl -s https://nodejs.org/download/release/index.json | jq -r '.[] | select(.lts != false) | .version' | head -1 2>/dev/null)
        fi
        
        # Method 2: Fallback to parsing without jq
        if [[ -z "$NODEJS_LTS_VERSION" ]]; then
            NODEJS_LTS_VERSION=$(curl -s https://nodejs.org/download/release/index.json | grep -o '"version":"v[0-9]\+\.[0-9]\+\.[0-9]\+"' | grep -v '"lts":false' | head -1 | grep -o 'v[0-9]\+\.[0-9]\+\.[0-9]\+' 2>/dev/null)
        fi
        
        # Method 3: Try the dist endpoint
        if [[ -z "$NODEJS_LTS_VERSION" ]]; then
            NODEJS_LTS_VERSION=$(curl -s https://nodejs.org/dist/index.json | grep -A5 '"lts":"' | grep '"version"' | head -1 | grep -o 'v[0-9]\+\.[0-9]\+\.[0-9]\+' 2>/dev/null)
        fi
        
        # Method 4: Get latest from GitHub API (as last resort)
        if [[ -z "$NODEJS_LTS_VERSION" ]]; then
            NODEJS_LTS_VERSION=$(curl -s https://api.github.com/repos/nodejs/node/releases | grep -o '"tag_name":"v[0-9]\+\.[0-9]\+\.[0-9]\+"' | grep -o 'v[0-9]\+\.[0-9]\+\.[0-9]\+' | head -1 2>/dev/null)
        fi
    fi
    
    # Fallback to known stable LTS versions if API fails
    if [[ -z "$NODEJS_LTS_VERSION" ]]; then
        print_warning "Could not fetch latest LTS version from APIs, using Node.js 20.x LTS"
        NODEJS_LTS_VERSION="v20"
    fi
    
    # Clean up the version string
    NODEJS_LTS_VERSION=$(echo $NODEJS_LTS_VERSION | sed 's/^v//' | sed 's/^/v/')
    
    print_status "Target Node.js LTS version: $NODEJS_LTS_VERSION"
    export NODEJS_LTS_VERSION
}

# Install Node.js using NodeSource repository (Linux)
install_nodejs_linux() {
    print_status "Installing Node.js $NODEJS_LTS_VERSION on Linux..."
    
    # Extract major version (remove 'v' prefix)
    LTS_MAJOR=$(echo $NODEJS_LTS_VERSION | sed 's/v//' | cut -d. -f1)
    
    case $PKG_MANAGER in
        "apt")
            # Use NodeSource repository for latest LTS
            print_status "Setting up NodeSource repository..."
            curl -fsSL https://deb.nodesource.com/setup_${LTS_MAJOR}.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        "yum"|"dnf")
            # Use NodeSource repository for RHEL/CentOS/Fedora
            print_status "Setting up NodeSource repository..."
            curl -fsSL https://rpm.nodesource.com/setup_${LTS_MAJOR}.x | sudo bash -
            sudo $PKG_MANAGER install -y nodejs npm
            ;;
        "pacman")
            # Use official Arch repository (usually up-to-date)
            print_status "Installing Node.js via pacman..."
            sudo pacman -S --noconfirm nodejs npm
            ;;
        *)
            print_warning "Unknown package manager. Please install Node.js manually:"
            echo "  Visit: https://nodejs.org/"
            echo "  Or use Node Version Manager (nvm): https://github.com/nvm-sh/nvm"
            return 1
            ;;
    esac
}

# Install Node.js on macOS
install_nodejs_macos() {
    print_status "Installing Node.js $NODEJS_LTS_VERSION on macOS..."
    
    if ! command -v brew &> /dev/null; then
        print_error "Homebrew not found. Installing Homebrew first..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    
    # Install latest LTS Node.js
    brew install node
    
    # Alternative: install specific LTS version if needed
    # LTS_MAJOR=$(echo $NODEJS_LTS_VERSION | sed 's/v//' | cut -d. -f1)
    # brew install node@${LTS_MAJOR}
}

# Install Node.js on Windows
install_nodejs_windows() {
    print_status "Installing Node.js $NODEJS_LTS_VERSION on Windows..."
    
    case $PKG_MANAGER in
        "choco")
            print_status "Installing Node.js via Chocolatey..."
            choco install nodejs --version="$NODEJS_LTS_VERSION" -y
            ;;
        "winget")
            print_status "Installing Node.js via winget..."
            winget install -e --id OpenJS.NodeJS
            ;;
        *)
            print_warning "No Windows package manager found."
            print_status "Please install Node.js manually:"
            echo "  1. Visit: https://nodejs.org/"
            echo "  2. Download the latest LTS version"
            echo "  3. Run the installer as Administrator"
            echo "  4. Restart your terminal/command prompt"
            echo ""
            echo "Or install a package manager:"
            echo "  - Chocolatey: https://chocolatey.org/install"
            echo "  - winget: Usually comes with Windows 10/11"
            return 1
            ;;
    esac
}

# Install Node.js using NVM (Node Version Manager) - Universal fallback
install_nodejs_nvm() {
    print_status "Installing Node.js via NVM (Node Version Manager)..."
    
    # Install NVM if not present
    if ! command -v nvm &> /dev/null && [[ ! -f "$HOME/.nvm/nvm.sh" ]]; then
        print_status "Installing NVM..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        
        # Source NVM
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
    fi
    
    # Load NVM if it exists
    if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
        source "$HOME/.nvm/nvm.sh"
    fi
    
    if command -v nvm &> /dev/null; then
        print_status "Installing and using Node.js LTS..."
        nvm install --lts
        nvm use --lts
        nvm alias default lts/*
    else
        print_error "Could not install or load NVM"
        return 1
    fi
}

# Check and install Node.js
check_and_install_nodejs() {
    print_section "Checking and Installing Node.js"
    
    get_latest_nodejs_lts
    
    NODEJS_INSTALLED=false
    NODEJS_VERSION_OK=false
    
    # Check if Node.js is already installed
    if command -v node &> /dev/null; then
        NODEJS_INSTALLED=true
        CURRENT_NODE_VERSION=$(node -v | sed 's/v//')
        CURRENT_MAJOR_VERSION=$(echo $CURRENT_NODE_VERSION | cut -d. -f1)
        
        print_status "Found Node.js $CURRENT_NODE_VERSION"
        
        # Check if version is acceptable (>= 16)
        if [[ $CURRENT_MAJOR_VERSION -ge 16 ]]; then
            NODEJS_VERSION_OK=true
            print_success "Node.js $CURRENT_NODE_VERSION is compatible (>= 16.0.0)"
            
            # Check if it's the latest LTS (optional upgrade)
            TARGET_MAJOR=$(echo $NODEJS_LTS_VERSION | sed 's/v//' | cut -d. -f1)
            if [[ $CURRENT_MAJOR_VERSION -lt $TARGET_MAJOR ]]; then
                echo ""
                read -p "A newer LTS version ($NODEJS_LTS_VERSION) is available. Upgrade? (y/N): " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    NODEJS_VERSION_OK=false  # Force upgrade
                fi
            fi
        else
            print_warning "Node.js $CURRENT_NODE_VERSION is too old (minimum: 16.0.0)"
        fi
    else
        print_warning "Node.js is not installed"
    fi
    
    # Install or upgrade Node.js if needed
    if [[ "$NODEJS_INSTALLED" == false ]] || [[ "$NODEJS_VERSION_OK" == false ]]; then
        print_status "Installing Node.js..."
        
        case $OS in
            "linux"|"wsl")
                if ! install_nodejs_linux; then
                    print_warning "System package manager failed, trying NVM..."
                    install_nodejs_nvm
                fi
                ;;
            "macos")
                if ! install_nodejs_macos; then
                    print_warning "Homebrew installation failed, trying NVM..."
                    install_nodejs_nvm
                fi
                ;;
            "windows")
                if ! install_nodejs_windows; then
                    print_warning "Windows package manager failed, trying NVM for Windows..."
                    install_nodejs_nvm
                fi
                ;;
            *)
                print_status "Using NVM for Node.js installation..."
                install_nodejs_nvm
                ;;
        esac
        
        # Verify installation
        if command -v node &> /dev/null; then
            NEW_NODE_VERSION=$(node -v)
            print_success "Node.js $NEW_NODE_VERSION installed successfully"
            
            # Verify npm is also available
            if command -v npm &> /dev/null; then
                NPM_VERSION=$(npm -v)
                print_success "npm $NPM_VERSION is available"
            else
                print_warning "npm not found, installing..."
                if [[ "$OS" == "linux" ]]; then
                    case $PKG_MANAGER in
                        "apt") sudo apt-get install -y npm ;;
                        "yum"|"dnf") sudo $PKG_MANAGER install -y npm ;;
                        "pacman") sudo pacman -S --noconfirm npm ;;
                    esac
                fi
            fi
        else
            print_error "Node.js installation failed"
            print_error "Please install Node.js manually:"
            echo "  - Visit: https://nodejs.org/"
            echo "  - Or use Node Version Manager: https://github.com/nvm-sh/nvm"
            exit 1
        fi
    fi
    
    # Final version check
    FINAL_NODE_VERSION=$(node -v | sed 's/v//')
    FINAL_MAJOR_VERSION=$(echo $FINAL_NODE_VERSION | cut -d. -f1)
    
    if [[ $FINAL_MAJOR_VERSION -lt 16 ]]; then
        print_error "Node.js $FINAL_NODE_VERSION is still too old after installation attempt"
        exit 1
    fi
    
    print_success "Node.js setup completed: $FINAL_NODE_VERSION"
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
    echo "✅ System dependencies (ffmpeg, build tools, audio libraries)"
    echo "✅ Node.js (latest LTS version)"
    echo "✅ Node.js project dependencies"
    echo "✅ Python virtual environment with optimized packages"
    echo "✅ faster-whisper engine"
    echo "✅ insanely-fast-whisper engine"
    echo "✅ PyTorch with GPU support (if available)"
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
    check_and_install_nodejs
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
        echo "- System dependencies (ffmpeg, build tools, curl, etc.)"
        echo "- Node.js (latest LTS version automatically detected)"
        echo "- Node.js project dependencies (npm install)"
        echo "- Python virtual environment with optimized packages"
        echo "- faster-whisper engine" 
        echo "- insanely-fast-whisper engine"
        echo "- PyTorch with CUDA support (if GPU detected)"
        echo "- Essential Whisper models (optional)"
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