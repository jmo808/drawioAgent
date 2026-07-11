#!/bin/bash
set -e

# Go to agent directory
cd "$(dirname "$0")/../services/agent"

echo "Creating python virtual environment..."
python3 -m venv .venv

echo "Activating virtual environment..."
source .venv/bin/activate

echo "Upgrading pip..."
pip install --upgrade pip

echo "Installing requirements..."
pip install -r requirements.txt

echo "Setup complete!"
