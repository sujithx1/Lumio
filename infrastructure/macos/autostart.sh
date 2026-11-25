#!/bin/bash
# Installs (or removes) a launch agent that starts Lumio's database and relay server at login.
#   infrastructure/macos/autostart.sh on     install and start now
#   infrastructure/macos/autostart.sh off    stop and remove
#   infrastructure/macos/autostart.sh status
set -euo pipefail

LABEL="app.lumio.server"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGS="$HOME/Library/Logs/Lumio"
DOMAIN="gui/$(id -u)"

case "${1:-status}" in
  on)
    mkdir -p "$LOGS" "$(dirname "$PLIST")"
    cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$ROOT/infrastructure/macos/lumio-server.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$LOGS/server.log</string>
  <key>StandardErrorPath</key><string>$LOGS/server.log</string>
</dict>
</plist>
PLIST
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "Lumio server will now start at login. Logs: $LOGS/server.log"
    ;;
  off)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Lumio server auto-start removed."
    ;;
  status)
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      launchctl print "$DOMAIN/$LABEL" | grep -E "state =|pid =|last exit code" | sed 's/^\s*//'
    else
      echo "not installed"
    fi
    ;;
  *) echo "usage: $0 on|off|status" >&2; exit 2 ;;
esac
