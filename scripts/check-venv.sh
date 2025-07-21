#!/bin/bash

# Script to validate and activate Python virtual environment
VENV_PATH="./scripts/venv"
REQUIREMENTS_FILE="./requirements.txt"

# Check if virtual environment exists
if [ ! -d "$VENV_PATH" ]; then
    echo "Virtual environment not found. Creating one..."
    python3 -m venv "$VENV_PATH"
    if [ $? -ne 0 ]; then
        echo "Failed to create virtual environment"
        exit 1
    fi
fi

# Activate virtual environment
source "$VENV_PATH/bin/activate"

# Check if activation was successful
if [ -z "$VIRTUAL_ENV" ]; then
    echo "Failed to activate virtual environment"
    exit 1
fi

echo "Virtual environment activated: $VIRTUAL_ENV"

# Install requirements if requirements.txt exists
if [ -f "$REQUIREMENTS_FILE" ]; then
    echo "Installing/updating Python dependencies..."
    pip install -r "$REQUIREMENTS_FILE"
fi

# Keep the virtual environment active for the parent process
exec "$@"