#!/bin/bash
# Install worker as a LaunchAgent to auto-start on Mac boot
#
# Usage: ./scripts/active/install-worker-service.sh
# To uninstall: launchctl unload ~/Library/LaunchAgents/com.echocatering.worker.plist

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKER_DIR="$REPO_ROOT/worker"
NODE_PATH=$(which node)

if [ -z "$NODE_PATH" ]; then
  echo "❌ Error: Node.js not found. Please install Node.js first."
  exit 1
fi

echo "✅ Node.js found at: $NODE_PATH"
echo "✅ Repo root: $REPO_ROOT"
echo "✅ Worker directory: $WORKER_DIR"

# Check if worker/index.js exists
if [ ! -f "$WORKER_DIR/index.js" ]; then
  echo "❌ Error: worker/index.js not found at $WORKER_DIR/index.js"
  exit 1
fi

# Check if worker/local.env exists
if [ ! -f "$WORKER_DIR/local.env" ]; then
  echo "⚠️  Warning: worker/local.env not found. The worker will fail to start without it."
  echo "   Create it first, then run this script again."
  exit 1
fi

# Create LaunchAgents directory if it doesn't exist
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
mkdir -p "$LAUNCH_AGENTS_DIR"

# Create plist file
PLIST_FILE="$LAUNCH_AGENTS_DIR/com.echocatering.worker.plist"

cat > "$PLIST_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.echocatering.worker</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$WORKER_DIR/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$WORKER_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/echocatering-worker.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/echocatering-worker-error.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
EOF

echo "✅ Created plist file: $PLIST_FILE"

# Load the service
echo "📦 Loading LaunchAgent..."
launchctl load "$PLIST_FILE" 2>/dev/null || launchctl bootstrap gui/$(id -u) "$PLIST_FILE" 2>/dev/null || {
  echo "⚠️  Note: Service may already be loaded. Continuing..."
}

echo ""
echo "✅ Worker service installed successfully!"
echo ""
echo "The worker will now start automatically when you log in to your Mac."
echo ""
echo "Useful commands:"
echo "  Check status:     launchctl list | grep echocatering"
echo "  View logs:        tail -f ~/Library/Logs/echocatering-worker.log"
echo "  View error logs:  tail -f ~/Library/Logs/echocatering-worker-error.log"
echo "  Stop service:     launchctl unload ~/Library/LaunchAgents/com.echocatering.worker.plist"
echo "  Start service:    launchctl load ~/Library/LaunchAgents/com.echocatering.worker.plist"
echo ""


