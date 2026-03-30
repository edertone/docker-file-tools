const { serve } = require('@hono/node-server');
const { Hono } = require('hono');
const { createReadStream } = require('node:fs');
const { stream } = require('hono/streaming');
const pdfUtils = require('./server-pdf.js');
const imageUtils = require('./server-image.js');
const cacheUtils = require('./server-cache.js');

const app = new Hono();
const PORT = 5001;

// Override console methods to include timestamps on logs
const origLog = console.log;
console.log = (...args) => {
  origLog(new Date().toISOString(), ...args);
};

const origError = console.error;
console.error = (...args) => {
  origError(new Date().toISOString(), ...args);
};

// Error handling middleware
app.onError((err, c) => {
    console.error(err);
    const status = err.message.startsWith('Missing') || err.message.startsWith('Invalid') ? 400 : 500;
    return c.json({ error: err.message || 'Processing failed' }, status);
});

/**
 * Helper to parse body variables regardless of Content-Type.
 * Supports: application/json, multipart/form-data, application/x-www-form-urlencoded
 * @param {import('hono').Context} c
 */
async function parseBodyVariables(c) {
    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('application/json')) {
        return await c.req.json().catch(() => ({})); // Return empty obj on invalid JSON
    }
    return await c.req.parseBody();
}

/**
 * Helper to extract a file buffer from the parsed body.
 * Handles both Hono File objects (multipart) and Base64/String data (JSON/Text).
 */
async function getFileAsBuffer(body, key) {
    const val = body[key];
    if (!val) throw new Error(`Missing POST variable '${key}'`);

    // If it's a file upload (Object with arrayBuffer method)
    if (typeof val === 'object' && val.arrayBuffer) {
        return Buffer.from(await val.arrayBuffer());
    }
    // If it's a regular string field (from JSON or Text field)
    return Buffer.from(String(val));
}

// Dashboard HTML
app.get('/dashboard', async c => {
    const html = require('node:fs').readFileSync(require('node:path').join(__dirname, 'dashboard', 'index.html'), 'utf8');
    return c.html(html);
});

app.get('/dashboard/:page', async c => {
    const page = c.req.param('page');
    // Basic protection against directory traversal
    const safePage = require('node:path').basename(page);
    try {
        const html = require('node:fs').readFileSync(require('node:path').join(__dirname, 'dashboard', safePage), 'utf8');
        return c.html(html);
    } catch (e) {
        return c.notFound();
    }
});

// Image to JPG
app.post('/image-to-jpg', async c => {
    const body = await parseBodyVariables(c);
    const imageBuffer = await getFileAsBuffer(body, 'image');

    const options = {
        jpegQuality: body['jpegQuality'] ? parseInt(body['jpegQuality'], 10) : 75,
        transparentColor: body['transparentColor'] || '#FFFFFF'
    };

    const jpgBuffer = await imageUtils.convertImageToJpg(imageBuffer, options);

    return c.body(jpgBuffer, 200, {
        'Content-Type': 'image/jpeg'
    });
});

// PDF Validation
app.post('/pdf-is-valid', async c => {
    const body = await parseBodyVariables(c);
    const pdfBuffer = await getFileAsBuffer(body, 'pdf');

    const isValid = await pdfUtils.isValidPdf(pdfBuffer);
    return c.json({ valid: isValid });
});

// Count Pages
app.post('/pdf-count-pages', async c => {
    const body = await parseBodyVariables(c);
    const pdfBuffer = await getFileAsBuffer(body, 'pdf');

    const count = await pdfUtils.countPdfPages(pdfBuffer);
    return c.json({ pages: count });
});

// PDF Page to JPG
app.post('/pdf-get-page-as-jpg', async c => {
    const body = await parseBodyVariables(c);
    const pdfBuffer = await getFileAsBuffer(body, 'pdf');

    // Parse inputs
    const page = parseInt(body['page'], 10);
    if (isNaN(page)) throw new Error("Missing POST variable 'page'");

    const options = {
        width: body['width'] ? parseInt(body['width'], 10) : undefined,
        height: body['height'] ? parseInt(body['height'], 10) : undefined,
        jpegQuality: body['jpegQuality'] ? parseInt(body['jpegQuality'], 10) : 75
    };

    const imgBuffer = await pdfUtils.getPdfPageAsJpg(pdfBuffer, page, options);

    return c.body(imgBuffer, 200, {
        'Content-Type': 'image/jpeg'
    });
});

// PDF Merge
app.post('/pdf-merge', async c => {
    // Parse body keeping all values for duplicate keys as arrays
    const contentType = c.req.header('content-type') || '';
    let body;
    if (contentType.includes('application/json')) {
        body = await c.req.json().catch(() => ({}));
    } else {
        body = await c.req.parseBody({ all: true }).catch(() => ({}));
    }

    let buffers = [];
    const files = Array.isArray(body['pdfs']) ? body['pdfs'] : (body['pdfs'] ? [body['pdfs']] : []);

    for (const val of files) {
        if (typeof val === 'object' && val.arrayBuffer) {
            buffers.push(Buffer.from(await val.arrayBuffer()));
        } else if (typeof val === 'string') {
            buffers.push(Buffer.from(val, 'base64')); // Attempt base64 decoding if json
        }
    }

    if (buffers.length < 2) {
        throw new Error("At least two PDF files are required to merge. Provide them as a 'pdfs' array.");
    }

    const mergedBuffer = await pdfUtils.mergePdfFiles(buffers);

    return c.body(mergedBuffer, 200, {
        'Content-Type': 'application/pdf'
    });
});

// HTML to PDF
const handleHtmlToPdf = async (c, returnBase64) => {
    const body = await parseBodyVariables(c);
    const html = body['html'];

    if (!html) throw new Error("Missing POST variable 'html'");

    // Handle case where HTML might be uploaded as a file object vs simple string
    const htmlString = typeof html === 'object' && html.text ? await html.text() : String(html);

    const pdfBuffer = await pdfUtils.convertHtmlToPdf(htmlString);

    if (returnBase64) {
        return c.json(pdfBuffer.toString('base64'));
    } else {
        return c.body(pdfBuffer, 200, {
            'Content-Type': 'application/pdf'
        });
    }
};

app.post('/html-to-pdf-binary', c => handleHtmlToPdf(c, false));
app.post('/html-to-pdf-base64', c => handleHtmlToPdf(c, true));

// Store a value to the cache
app.post('/cache-set', async c => {
    const body = await parseBodyVariables(c);
    const { namespace, key, expire } = body;

    if (!namespace) throw new Error("Missing 'namespace' in POST body");
    if (!key) throw new Error("Missing 'key' in POST body");

    const value = await getFileAsBuffer(body, 'value');

    // Parse TTL if present (seconds), otherwise undefined (which becomes permanent)
    await cacheUtils.getCacheManager().set(namespace, key, value, expire ? parseInt(expire, 10) : undefined);

    return c.json({ success: true });
});

// Obtain a previously stored value from the cache
app.post('/cache-get', async c => {
    const body = await parseBodyVariables(c);
    const { namespace, key } = body;

    if (!namespace) throw new Error("Missing 'namespace' in POST body");
    if (!key) throw new Error("Missing 'key' in POST body");

    const entry = cacheUtils.getCacheManager().getEntry(namespace, key);

    if (!entry) {
        return c.json({ error: 'Key not found in specified namespace or has expired' }, 404);
    }

    const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Cache-Created-At': new Date(entry.createdAt).toISOString()
    };

    // CASE 1: Data stored directly in DB (Buffer)
    if (entry.type === 'buffer') {
        return c.body(entry.data, 200, headers);
    }

    // CASE 2: Data stored on Disk (File Stream)
    if (entry.type === 'file') {
        return stream(
            c,
            async stream => {
                try {
                    const fileStream = createReadStream(entry.path);
                    for await (const chunk of fileStream) {
                        await stream.write(chunk);
                    }
                } catch (err) {
                    console.error(`Error streaming file ${entry.path}:`, err);
                }
            },
            { headers }
        );
    }

    return c.json({ error: 'Storage retrieval error' }, 500);
});

// Delete a key and its value from the cache
app.post('/cache-delete-key', async c => {
    const body = await parseBodyVariables(c);
    const { namespace, key } = body;

    if (!namespace) throw new Error("Missing 'namespace' in POST body");
    if (!key) throw new Error("Missing 'key' in POST body");

    const wasDeleted = await cacheUtils.getCacheManager().del(namespace, key);

    return c.json({
        success: true,
        deleted: wasDeleted
    });
});

// Clear an entire namespace
app.post('/cache-clear-namespace', async c => {
    const body = await parseBodyVariables(c);
    const { namespace } = body;

    if (!namespace) throw new Error("Missing 'namespace' in POST body");
    const deletedCount = await cacheUtils.getCacheManager().clearNamespace(namespace);

    return c.json({
        success: true,
        deleted: deletedCount
    });
});

// Delete all keys from the cache - Use with caution!
app.post('/cache-delete-all', async c => {
    await cacheUtils.getCacheManager().clear();
    return c.json({ success: true });
});

// Delete all expired keys from the cache
app.post('/cache-prune', async c => {
    try {
        const deletedCount = await cacheUtils.getCacheManager().prune();
        return c.json({
            success: true,
            deleted: deletedCount
        });
    } catch (e) {
        console.error(e);
        return c.json({ error: 'Pruning failed' }, 500);
    }
});

// AUTOMATIC CACHE CLEANUP
// Run a prune job every 2 hours to remove expired items
setInterval(
    async () => {
        try {
            await cacheUtils.getCacheManager().prune();
        } catch (e) {
            console.error('[Cache Prune] Failed:', e);
        }
    },
    1000 * 60 * 60 * 2
);

// Start Server
console.log(`Server running on http://0.0.0.0:${PORT}`);
serve({
    fetch: app.fetch,
    port: PORT
});
