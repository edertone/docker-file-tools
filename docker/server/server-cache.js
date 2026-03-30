const { promises: fs, mkdirSync, existsSync } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const CACHE_DIR = '/app/file-tools-cache';
const BLOB_DIR = path.join(CACHE_DIR, 'blobs');

let _cacheManager = null;

/**
 * Private helper to validate namespace strings.
 * Ensures the namespace is safe to use as a directory name.
 * @param {string} namespace
 */
function validateCacheNamespace(namespace) {
    if (!/^[a-zA-Z0-9_-]+$/.test(namespace)) {
        throw new Error('Invalid namespace. Only letters, numbers, underscores, and hyphens allowed.');
    }
}

/**
 * Returns the cache manager object for managing cached files.
 * The first time this is called, database and directories are initialized.
 * @returns {object} cacheManager with methods: set, getFilePath, del, clear, clearNamespace, prune
 */
function getCacheManager() {
    // Return existing instance if already initialized
    if (_cacheManager) return _cacheManager;

    // Try to create directories. If it fails due to permissions, log a clear error.
    try {
        if (!existsSync(CACHE_DIR)) {
            mkdirSync(CACHE_DIR, { recursive: true });
        }
        if (!existsSync(BLOB_DIR)) {
            mkdirSync(BLOB_DIR, { recursive: true });
        }
    } catch (err) {
        console.error('CRITICAL ERROR: Could not create cache directories.');
        console.error(`Please ensure the volume mounted at ${CACHE_DIR} is writable by the container user.`);
        console.error(err);
        process.exit(1);
    }

    // Initialize SQLite database
    let db;
    try {        
        // WAL mode allows better concurrency and prevents locking issues.
        // Performance optimizations for our use case.
        db = new Database(path.join(CACHE_DIR, 'file-tools-cache.db'));
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('page_size = 16384');

        // Create table: namespace, key, filename, data, expires_at (Timestamp in ms)
        db.exec(`
            CREATE TABLE IF NOT EXISTS file_cache (
                namespace TEXT NOT NULL,
                key TEXT NOT NULL,
                filename TEXT,   -- Nullable (used for disk files > 100KB)
                data BLOB,       -- Nullable (used for inline storage <= 100KB)
                created_at INTEGER NOT NULL,
                expires_at INTEGER,
                PRIMARY KEY (namespace, key)
            );
            CREATE INDEX IF NOT EXISTS idx_expires_at ON file_cache(expires_at);
        `);
    } catch (err) {
        console.error('Failed to initialize SQLite cache:', err);
        throw err;
    }

    _cacheManager = {
        // Set a value in the cache (Streams data to disk, stores metadata in DB)
        set: async (namespace, key, buffer, ttlSeconds) => {
            validateCacheNamespace(namespace);
            const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Number.MAX_SAFE_INTEGER;
            const createdAt = Date.now();
            const size = buffer.length;

            // Clean up potentially existing entry (and its file if it exists)
            const existing = db
                .prepare('SELECT filename FROM file_cache WHERE namespace = ? AND key = ?')
                .get(namespace, key);

            if (existing && existing.filename) {
                await fs.unlink(path.join(BLOB_DIR, namespace, existing.filename)).catch(() => {});
            }

            // 100KB is the scientific "sweet spot" where SQLite outperforms the filesystem.
            if (size <= 100 * 1024) {
                // STRATEGY A: Inline Storage (DB) - Efficient for < 100KB
                const stmt = db.prepare(
                    'INSERT OR REPLACE INTO file_cache (namespace, key, filename, data, created_at, expires_at) VALUES (?, ?, NULL, ?, ?, ?)'
                );
                stmt.run(namespace, key, buffer, createdAt, expiresAt);
            } else {
                // STRATEGY B: Disk Storage (File) - Efficient for > 100KB
                const namespaceDir = path.join(BLOB_DIR, namespace);
                if (!existsSync(namespaceDir)) {
                    await fs.mkdir(namespaceDir, { recursive: true });
                }

                // Generate file path
                const filename = crypto.randomUUID();
                const filePath = path.join(namespaceDir, filename);
                await fs.writeFile(filePath, buffer);

                const stmt = db.prepare(
                    'INSERT OR REPLACE INTO file_cache (namespace, key, filename, data, created_at, expires_at) VALUES (?, ?, ?, NULL, ?, ?)'
                );
                stmt.run(namespace, key, filename, createdAt, expiresAt);
            }
        },

        // Retrieve a cache entry's metadata and data source
        getEntry: (namespace, key) => {
            validateCacheNamespace(namespace);
            const now = Date.now();
            const row = db
                .prepare('SELECT filename, data, created_at FROM file_cache WHERE namespace = ? AND key = ? AND expires_at > ?')
                .get(namespace, key, now);

            if (!row) return null;

            // Result is either RAM Buffer or File Path
            if (row.data) {
                return { type: 'buffer', data: row.data, createdAt: row.created_at };
            } else if (row.filename) {
                const filePath = path.join(BLOB_DIR, namespace, row.filename);
                // Edge case safety: File might have been manually deleted
                if (!existsSync(filePath)) return null;
                return { type: 'file', path: filePath, createdAt: row.created_at };
            }
            return null;
        },

        // Delete a key from the cache. Returns true if deleted, false if not found.
        del: async (namespace, key) => {
            validateCacheNamespace(namespace);
            const stmt = db.prepare('SELECT filename FROM file_cache WHERE namespace = ? AND key = ?');
            const row = stmt.get(namespace, key);

            if (row) {
                db.prepare('DELETE FROM file_cache WHERE namespace = ? AND key = ?').run(namespace, key);
                // Only delete file if filename exists (it will be null for inline blobs)
                if (row.filename) {
                    await fs.unlink(path.join(BLOB_DIR, namespace, row.filename)).catch(() => {});
                }
                return true;
            }
            return false;
        },

        // Delete all keys belonging to a specific namespace
        clearNamespace: async namespace => {
            validateCacheNamespace(namespace);

            // Efficiently clear: Delete DB rows first
            const info = db.prepare('DELETE FROM file_cache WHERE namespace = ?').run(namespace);

            // Then recursively delete the entire folder for that namespace
            // This is much faster than deleting files one by one
            const namespaceDir = path.join(BLOB_DIR, namespace);
            await fs.rm(namespaceDir, { recursive: true, force: true }).catch(() => {});
            
            console.log(`Cleared cache namespace '${namespace}', removed ${info.changes} entries`);
            return info.changes;
        },

        // Clear the entire cache (All namespaces)
        clear: async () => {
            db.exec('DELETE FROM file_cache');
            // Delete the whole blobs folder and recreate it
            await fs.rm(BLOB_DIR, { recursive: true, force: true }).catch(() => {});
            if (!existsSync(BLOB_DIR)) {
                mkdirSync(BLOB_DIR, { recursive: true });
            }
            
            console.log('Cleared entire cache data');
        },

        // Prune expired cache entries (Global, across all namespaces)
        prune: async () => {
            const now = Date.now();
            const stmt = db.prepare('SELECT namespace, filename FROM file_cache WHERE expires_at <= ?');
            const rows = stmt.all(now);

            if (rows.length === 0) return 0;

            db.prepare('DELETE FROM file_cache WHERE expires_at <= ?').run(now);

            // Delete files from Disk
            rows.forEach(row => {
                if (row.filename) {
                    const filePath = path.join(BLOB_DIR, row.namespace, row.filename);
                    fs.unlink(filePath).catch(e => console.error(`Failed to delete ${filePath}`, e));
                }
            });
            
            console.log(`Pruned ${rows.length} expired cache entries`);

            return rows.length;
        }
    };

    return _cacheManager;
}

module.exports = {
    getCacheManager
};