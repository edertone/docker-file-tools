const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PDF_FILE_PATH = path.join(__dirname, 'resources', 'pdf-samples', 'sample30.pdf');
const ENDPOINT = 'http://localhost:5001/pdf-get-page-as-jpg';
const OUT_DIR = path.join(__dirname, '..', 'tests-out', 'pdf-get-page-as-jpg');

function ensureOutDir() {
    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }
}

async function sendPdfToJpgEndpoint({ page = 0, width, height, jpegQuality = 75 }) {
    if (!fs.existsSync(PDF_FILE_PATH)) {
        throw new Error('sample30.pdf not found in resources directory');
    }

    const fetch = (await import('node-fetch')).default;
    const FormData = require('form-data');
    const pdfBuffer = fs.readFileSync(PDF_FILE_PATH);

    const formData = new FormData();
    formData.append('pdf', pdfBuffer, 'sample.pdf');
    formData.append('page', page.toString());
    if (width !== undefined) {
        formData.append('width', width.toString());
    }
    if (height !== undefined) {
        formData.append('height', height.toString());
    }
    formData.append('jpegQuality', jpegQuality.toString());

    const response = await fetch(ENDPOINT, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
        statusCode: response.status,
        headers: {
            'content-type': response.headers.get('content-type'),
            'content-length': response.headers.get('content-length')
        },
        buffer
    };
}

describe('PDF Get Page as JPG API', function () {
    this.timeout(15000);
    before(ensureOutDir);

    it('should return a JPEG image for the first page with width', async function () {
        const result = await sendPdfToJpgEndpoint({ page: 0, width: 300, jpegQuality: 75 });
        assert.strictEqual(result.statusCode, 200, 'Expected HTTP 200');
        assert.ok(result.headers['content-type'].includes('image/jpeg'), 'Expected image/jpeg content type');
        assert.ok(result.buffer.length > 1000, 'JPEG buffer should not be empty');
    });

    it('should return a high quality JPEG with width', async function () {
        const result = await sendPdfToJpgEndpoint({ page: 0, width: 800, jpegQuality: 100 });
        assert.strictEqual(result.statusCode, 200, 'Expected HTTP 200');
        assert.ok(result.headers['content-type'].includes('image/jpeg'), 'Expected image/jpeg content type');
        assert.ok(
            result.buffer.length > 100000,
            `JPEG buffer should be larger than 100KB, got ${result.buffer.length} bytes`
        );
    });

    it('should return a low quality JPEG with width', async function () {
        const result = await sendPdfToJpgEndpoint({ page: 0, width: 300, jpegQuality: 30 });
        assert.strictEqual(result.statusCode, 200, 'Expected HTTP 200');
        assert.ok(result.headers['content-type'].includes('image/jpeg'), 'Expected image/jpeg content type');
        assert.ok(
            result.buffer.length < 100000,
            `JPEG buffer should be smaller than 100KB, got ${result.buffer.length} bytes`
        );
    });

    it('should return a JPEG thumbnail with width only', async function () {
        const result = await sendPdfToJpgEndpoint({ width: 300 });
        assert.strictEqual(result.statusCode, 200, 'Expected HTTP 200');
        assert.ok(result.headers['content-type'].includes('image/jpeg'), 'Expected image/jpeg content type');
        assert.ok(result.buffer.length > 1000, 'JPEG buffer should not be empty');
        // Check JPEG header
        assert.strictEqual(result.buffer[0], 0xff, 'JPEG should start with 0xFF');
        assert.strictEqual(result.buffer[1], 0xd8, 'JPEG should start with 0xD8');
        fs.writeFileSync(path.join(OUT_DIR, 'thumbnail-width-300.jpg'), result.buffer);
    });

    it('should return a JPEG thumbnail with height only', async function () {
        const result = await sendPdfToJpgEndpoint({ height: 400 });
        assert.strictEqual(result.statusCode, 200, 'Expected HTTP 200');
        assert.ok(result.headers['content-type'].includes('image/jpeg'), 'Expected image/jpeg content type');
        assert.ok(result.buffer.length > 1000, 'JPEG buffer should not be empty');
        // Check JPEG header
        assert.strictEqual(result.buffer[0], 0xff, 'JPEG should start with 0xFF');
        assert.strictEqual(result.buffer[1], 0xd8, 'JPEG should start with 0xD8');
        fs.writeFileSync(path.join(OUT_DIR, 'thumbnail-height-400.jpg'), result.buffer);
    });

    it('should return a JPEG thumbnail with both width and height', async function () {
        const result = await sendPdfToJpgEndpoint({ width: 250, height: 350 });
        assert.strictEqual(result.statusCode, 200, 'Expected HTTP 200');
        assert.ok(result.headers['content-type'].includes('image/jpeg'), 'Expected image/jpeg content type');
        assert.ok(result.buffer.length > 1000, 'JPEG buffer should not be empty');
        // Check JPEG header
        assert.strictEqual(result.buffer[0], 0xff, 'JPEG should start with 0xFF');
        assert.strictEqual(result.buffer[1], 0xd8, 'JPEG should start with 0xD8');
        fs.writeFileSync(path.join(OUT_DIR, 'thumbnail-250x350.jpg'), result.buffer);
    });

    it('should return a JPEG thumbnail with both width and height but not proportional', async function () {
        const result = await sendPdfToJpgEndpoint({ width: 250, height: 150 });
        assert.strictEqual(result.statusCode, 200, 'Expected HTTP 200');
        assert.ok(result.headers['content-type'].includes('image/jpeg'), 'Expected image/jpeg content type');
        assert.ok(result.buffer.length > 1000, 'JPEG buffer should not be empty');
        // Check JPEG header
        assert.strictEqual(result.buffer[0], 0xff, 'JPEG should start with 0xFF');
        assert.strictEqual(result.buffer[1], 0xd8, 'JPEG should start with 0xD8');
        fs.writeFileSync(path.join(OUT_DIR, 'thumbnail-250x150.jpg'), result.buffer);
    });

    it('should return a high quality JPEG thumbnail', async function () {
        const result = await sendPdfToJpgEndpoint({ width: 300, jpegQuality: 95 });
        assert.strictEqual(result.statusCode, 200, 'Expected HTTP 200');
        assert.ok(result.headers['content-type'].includes('image/jpeg'), 'Expected image/jpeg content type');
        assert.ok(
            result.buffer.length > 5000,
            `High quality JPEG buffer should be larger, got ${result.buffer.length} bytes`
        );
        // Check JPEG header
        assert.strictEqual(result.buffer[0], 0xff, 'JPEG should start with 0xFF');
        assert.strictEqual(result.buffer[1], 0xd8, 'JPEG should start with 0xD8');
        fs.writeFileSync(path.join(OUT_DIR, 'thumbnail-quality-95.jpg'), result.buffer);
    });

    it('should return a low quality JPEG thumbnail', async function () {
        const result = await sendPdfToJpgEndpoint({ width: 300, jpegQuality: 30 });
        assert.strictEqual(result.statusCode, 200, 'Expected HTTP 200');
        assert.ok(result.headers['content-type'].includes('image/jpeg'), 'Expected image/jpeg content type');
        assert.ok(result.buffer.length > 1000, 'JPEG buffer should not be empty');
        // Check JPEG header
        assert.strictEqual(result.buffer[0], 0xff, 'JPEG should start with 0xFF');
        assert.strictEqual(result.buffer[1], 0xd8, 'JPEG should start with 0xD8');
        fs.writeFileSync(path.join(OUT_DIR, 'thumbnail-quality-30.jpg'), result.buffer);
    });

    it('should return error 500 when no dimensions are provided', async function () {
        const result = await sendPdfToJpgEndpoint({});
        assert.strictEqual(result.statusCode, 500, 'Expected HTTP 500 for missing dimensions');
        const responseText = result.buffer.toString();
        const response = JSON.parse(responseText);
        assert.ok(response.error.includes('Either width or height'), 'Error should mention missing dimensions');
    });
});
