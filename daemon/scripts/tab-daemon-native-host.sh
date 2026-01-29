#!/bin/bash
# Native messaging host wrapper script
# This script is invoked by Chrome when the extension calls sendNativeMessage.
# It runs the daemon in query mode to get the WebSocket endpoint.

exec /usr/local/bin/tab-daemon --query "$@"
