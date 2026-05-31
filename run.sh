#!/bin/bash

# Social Media Manager - Run Script (Development)
# Kills any processes using required ports and starts all services

PORTS=(3000 3001 3002 3003)

echo "=============================================="
echo "  Social Media Manager (Development)"
echo "=============================================="

echo ""
echo "Checking for processes on required ports..."

for PORT in "${PORTS[@]}"; do
    PID=$(lsof -ti :$PORT 2>/dev/null)
    if [ -n "$PID" ]; then
        echo "  Killing process $PID on port $PORT"
        kill $PID 2>/dev/null
        sleep 0.5
    fi
done

echo ""
echo "Starting services..."
echo ""

npm start
