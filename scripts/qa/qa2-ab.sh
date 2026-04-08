#!/bin/bash
# qa2-ab.sh <port> <agent-browser args...>
# Routes through a per-port daemon
PORT=$1
shift
DAEMON_PORT=$((4848+PORT-9250))
AGENT_BROWSER_DAEMON_PORT=$DAEMON_PORT npx --yes agent-browser --cdp $PORT "$@"
