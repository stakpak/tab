#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m' # No Color
BLUE='\033[0;34m'

echo -e "${BLUE}Starting installation process...${NC}"

# Check for required tools
if ! command -v cargo &> /dev/null; then
    echo "cargo could not be found. Please install Rust and Cargo."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "npm could not be found. Please install Node.js and npm."
    exit 1
fi

# Build CLI
echo -e "${BLUE}Building CLI...${NC}"
cd cli
cargo build --release
cd ..
echo -e "${GREEN}CLI built successfully.${NC}"

# Build Daemon
echo -e "${BLUE}Building Daemon...${NC}"
cd daemon
npm install
npm run build:pkg

echo -e "${BLUE}Packaging Daemon...${NC}"
# Use npx to run pkg without global installation
# Explicitly targeting node18 as pkg 5.8.1 supports up to node18
# Detect OS and set pkg target
if [[ "$OSTYPE" == "darwin"* ]]; then
  PKG_TARGET="node18-macos-x64"
  echo "Detected macOS. Target: $PKG_TARGET"
else
  PKG_TARGET="node18-linux-x64"
  echo "Detected Linux. Target: $PKG_TARGET"
fi

npx pkg . --targets "$PKG_TARGET" --output tab-daemon
cd ..
echo -e "${GREEN}Daemon built and packaged successfully.${NC}"

# Organize executables
echo -e "${BLUE}Organizing executables...${NC}"
mkdir -p bin

# Copy CLI binary
if [ -f "cli/target/release/tab" ]; then
    cp cli/target/release/tab bin/
else
    echo "Error: CLI binary not found at cli/target/release/tab"
    exit 1
fi

# Move Daemon binary
if [ -f "daemon/tab-daemon" ]; then
    mv daemon/tab-daemon bin/
else
    echo "Error: Daemon binary not found at daemon/tab-daemon"
    exit 1
fi

chmod +x bin/tab
chmod +x bin/tab-daemon

echo -e "${GREEN}Installation complete!${NC}"
echo -e "${GREEN}Executables are located in:${NC}"
echo -e "  - bin/tab"
echo -e "  - bin/tab-daemon"
