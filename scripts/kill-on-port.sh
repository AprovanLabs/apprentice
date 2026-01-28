#!/bin/sh

set -e

port=$1

if [ -z "$port" ]; then
    echo "Usage: $0 <port>"
    exit 1
fi

echo "🔍 Checking for processes using port $port..."

pid=$(lsof -t -i:$port)

if [ -z "$pid" ]; then
    echo "✅ No processes found using port $port."
else
    echo "🚨 Found process with PID $pid using port $port. Terminating..."
    kill -9 $pid
    echo "✅ Process $pid terminated."
fi
