#!/bin/sh

# Redirect all script output to log files
exec >> /app/logs/startup.log 2>&1

echo "Starting file-tools container..."

# Check if cache directory exists and is writable
if [ ! -d "/app/file-tools-cache" ]; then
    echo "Creating cache directory..."
    mkdir -p /app/file-tools-cache
fi

if [ ! -w "/app/file-tools-cache" ]; then
    echo "Cache directory is not writable by converter user"
    echo "This usually means the host volume has incorrect ownership"
    echo "Please run: sudo chown -R $(id -u converter):$(id -g converter) /path/to/host/cache/directory"
    echo "Attempting to continue anyway..."
fi

# Test if we can actually write to the cache directory
if ! touch /app/file-tools-cache/test-write 2>/dev/null; then
    echo "CRITICAL: Cannot write to cache directory. Container will likely crash on cache operations."
    echo "Host directory ownership must match container user (UID: $(id -u converter))"
else
    rm -f /app/file-tools-cache/test-write
    echo "Cache directory is writable - proceeding normally"
fi

# Start the Node.js server
node server.js > /app/logs/node.log 2> /app/logs/node-error.log