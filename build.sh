#!/bin/bash

# Social Media Manager - Build Script
# Creates distributable executables for macOS, Windows, and Linux

set -e

echo "=============================================="
echo "  Building Social Media Manager"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Directories
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"
BIN_DIR="$DIST_DIR/bin"

# Clean previous build
echo ""
echo "Cleaning previous build..."
rm -rf "$DIST_DIR"
mkdir -p "$BIN_DIR"

# Install dependencies
echo ""
echo "Installing dependencies..."
DIRS=("." "shared" "manager" "background_engine" "post_generator" "auto_poster")

for DIR in "${DIRS[@]}"; do
    if [ -f "$ROOT_DIR/$DIR/package.json" ]; then
        echo "  Installing in $DIR..."
        cd "$ROOT_DIR/$DIR"
        npm install --production 2>/dev/null || npm install
        cd "$ROOT_DIR"
    fi
done

# Install dev dependencies in root for pkg
echo "  Installing build tools..."
npm install

# Build executables with pkg
echo ""
echo "Building executables..."
npx pkg . --out-path "$BIN_DIR" --compress GZip

# Create distribution folders for each platform
echo ""
echo "Creating distribution packages..."

PLATFORMS=("macos-x64" "macos-arm64" "win-x64" "linux-x64")

for PLATFORM in "${PLATFORMS[@]}"; do
    PLATFORM_DIR="$DIST_DIR/social-media-manager-$PLATFORM"
    mkdir -p "$PLATFORM_DIR"

    # Determine executable name
    case $PLATFORM in
        win-*)
            EXE_NAME="social-media-manager.exe"
            SRC_NAME="social-media-manager-win-x64.exe"
            ;;
        macos-x64)
            EXE_NAME="social-media-manager"
            SRC_NAME="social-media-manager-macos-x64"
            ;;
        macos-arm64)
            EXE_NAME="social-media-manager"
            SRC_NAME="social-media-manager-macos-arm64"
            ;;
        linux-*)
            EXE_NAME="social-media-manager"
            SRC_NAME="social-media-manager-linux-x64"
            ;;
    esac

    # Copy executable
    if [ -f "$BIN_DIR/$SRC_NAME" ]; then
        cp "$BIN_DIR/$SRC_NAME" "$PLATFORM_DIR/$EXE_NAME"
        echo "  Created $PLATFORM package"
    fi

    # Copy static assets (required for runtime)
    mkdir -p "$PLATFORM_DIR/manager/public"
    mkdir -p "$PLATFORM_DIR/background_engine/public"
    mkdir -p "$PLATFORM_DIR/background_engine/backgrounds"
    mkdir -p "$PLATFORM_DIR/post_generator/public"
    mkdir -p "$PLATFORM_DIR/auto_poster/public"
    mkdir -p "$PLATFORM_DIR/shared/db"
    mkdir -p "$PLATFORM_DIR/shared/config"

    cp -r "$ROOT_DIR/manager/public/"* "$PLATFORM_DIR/manager/public/" 2>/dev/null || true
    cp -r "$ROOT_DIR/background_engine/public/"* "$PLATFORM_DIR/background_engine/public/" 2>/dev/null || true
    cp -r "$ROOT_DIR/post_generator/public/"* "$PLATFORM_DIR/post_generator/public/" 2>/dev/null || true
    cp -r "$ROOT_DIR/auto_poster/public/"* "$PLATFORM_DIR/auto_poster/public/" 2>/dev/null || true
    cp "$ROOT_DIR/shared/config/services.js" "$PLATFORM_DIR/shared/config/" 2>/dev/null || true

    # Copy .env.example
    cp "$ROOT_DIR/.env.example" "$PLATFORM_DIR/.env.example" 2>/dev/null || true

    # Create platform-specific run script
    case $PLATFORM in
        win-*)
            cat > "$PLATFORM_DIR/run.bat" << 'BATCH'
@echo off
echo Starting Social Media Manager...
echo.
echo Services will be available at:
echo   Manager:          http://localhost:3000
echo   Background Engine: http://localhost:3001
echo   Post Generator:   http://localhost:3002
echo   Auto Poster:      http://localhost:3003
echo.
social-media-manager.exe
pause
BATCH
            ;;
        *)
            cat > "$PLATFORM_DIR/run.sh" << 'SHELL'
#!/bin/bash
echo "Starting Social Media Manager..."
echo ""
echo "Services will be available at:"
echo "  Manager:          http://localhost:3000"
echo "  Background Engine: http://localhost:3001"
echo "  Post Generator:   http://localhost:3002"
echo "  Auto Poster:      http://localhost:3003"
echo ""
./social-media-manager
SHELL
            chmod +x "$PLATFORM_DIR/run.sh"
            chmod +x "$PLATFORM_DIR/$EXE_NAME"
            ;;
    esac

    # Create README
    cat > "$PLATFORM_DIR/README.txt" << 'README'
Social Media Manager
====================

Quick Start:
1. Copy .env.example to .env and configure your API keys
2. Run the application:
   - macOS/Linux: ./run.sh (or ./social-media-manager)
   - Windows: run.bat (or social-media-manager.exe)

Services:
- Manager (Dashboard):   http://localhost:3000
- Background Engine:     http://localhost:3001
- Post Generator:        http://localhost:3002
- Auto Poster:           http://localhost:3003

Configuration:
Edit the .env file to set:
- GEMINI_API_KEY: For AI-powered background generation
- Database and other service configurations

README

    # Create zip archive
    cd "$DIST_DIR"
    zip -r "social-media-manager-$PLATFORM.zip" "social-media-manager-$PLATFORM" -x "*.DS_Store" > /dev/null
    echo "  Packaged: social-media-manager-$PLATFORM.zip"
done

# Cleanup bin directory
rm -rf "$BIN_DIR"

echo ""
echo -e "${GREEN}=============================================="
echo "  Build Complete!"
echo "==============================================${NC}"
echo ""
echo "Distribution packages created in: $DIST_DIR"
echo ""
ls -la "$DIST_DIR"/*.zip 2>/dev/null || echo "No zip files found"
echo ""
echo "To test locally:"
echo "  cd dist/social-media-manager-macos-arm64"
echo "  ./run.sh"
echo ""
