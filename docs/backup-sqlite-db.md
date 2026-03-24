# File Tools Microservice

## How to safely backup the cache sqlite database

The following code shows an example on how to safely backup the sqlite db if being actively used by this microservice

```bash
#!/bin/bash

# 1. Define paths
SOURCE_DB="/app/file-tools-cache/file-tools-cache.db"
SOURCE_BLOBS="/app/file-tools-cache/blobs/"
BACKUP_DIR="/path/to/your/backup/folder"  # <--- Change this to your actual backup location
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Create backup folder
mkdir -p "$BACKUP_DIR/$TIMESTAMP/blobs"

# 2. Safe Database Backup
# The ".backup" command handles the WAL file merging and locking automatically.
echo "Backing up Database..."
sqlite3 "$SOURCE_DB" ".backup '$BACKUP_DIR/$TIMESTAMP/file-tools-cache.db'"

# 3. Rsync the Blobs
# We use rsync to efficiently copy the files.
# The --ignore-missing-args flag is useful in case the 'Prune' job deletes a file 
# while rsync is running, preventing the script from erroring out.
echo "Backing up Blobs..."
rsync -av --ignore-missing-args "$SOURCE_BLOBS" "$BACKUP_DIR/$TIMESTAMP/blobs/"

echo "Backup Complete: $BACKUP_DIR/$TIMESTAMP"
```
