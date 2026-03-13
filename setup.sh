#!/usr/bin/env bash
set -euo pipefail

# Setup script for running ScanmyData in a fresh environment (e.g. VPS).
# Installs Python dependencies and Playwright browser runtimes.

echo "➡️ Installing Python dependencies from requirements.txt..."
pip install -r requirements.txt

echo "➡️ Installing Playwright Chromium browser runtime..."
python -m playwright install chromium

echo "✅ Setup complete. You can now run the app (e.g. ./start.sh) or python app.py."
