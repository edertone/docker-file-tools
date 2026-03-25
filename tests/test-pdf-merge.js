const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ENDPOINT = 'http://localhost:5001/pdf-merge';
const OUT_DIR = path.join(__dirname, '..', 'tests-out', 'pdf-merge');

function ensureOutDir() {
    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }
}

async function mergePdfs(filesOrArrays) {
    const fetch = (await import('node-fetch')).default;
    const FormData = require('form-data');

    const formData = new FormData();
    filesOrArrays.forEach((fileInfo) => {
        const { key, filename } = fileInfo;
        const filePath = path.join(__dirname, 'resources', 'pdf-samples', filename);
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filename}`);
        }
        const pdfBuffer = fs.readFileSync(filePath);
        formData.append(key, pdfBuffer, filename);
    });

    const response = await fetch(ENDPOINT, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
        statusCode: response.status,
        headers: {
            'content-type': response.headers.get('content-type')
        },
        buffer
    };
}

describe('PDF Merge API', function () {
    this.timeout(15000);
    before(ensureOutDir);

    it('should merge two PDFs using pdfs array parameter', async function () {
        const result = await mergePdfs([
            { key: 'pdfs', filename: 'sample1.pdf' },
            { key: 'pdfs', filename: 'sample4.pdf' }
        ]);
        assert.strictEqual(result.statusCode, 200, 'Expected HTTP 200');
        assert.ok(result.headers['content-type'].includes('application/pdf'), 'Expected application/pdf');
        assert.ok(result.buffer.length > 1000, 'PDF buffer should not be empty');
        fs.writeFileSync(path.join(OUT_DIR, 'merged-array.pdf'), result.buffer);
    });

    it('should throw an error if missing pdfs', async function () {
        try {
            await mergePdfs([
                { key: 'pdfs', filename: 'sample1.pdf' }
            ]);
            assert.fail('Should have thrown error');
        } catch (e) {
            assert.ok(e.message.includes('At least two PDF files'));
        }
    });

});
