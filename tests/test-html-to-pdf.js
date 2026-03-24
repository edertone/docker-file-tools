const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function htmlToPdfRequest(html) {
    const fetch = (await import('node-fetch')).default;

    const response = await fetch('http://localhost:5001/html-to-pdf-binary', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ html })
    });

    const arrayBuffer = await response.arrayBuffer();
    return {
        statusCode: response.status,
        buffer: Buffer.from(arrayBuffer),
        headers: {
            'content-type': response.headers.get('content-type'),
            'content-length': response.headers.get('content-length')
        }
    };
}

describe('HTML to PDF API', function () {
    this.timeout(10000);

    it('should convert HTML to PDF (binary)', async function () {
        const html = '<h1>Hello PDF!óÖ</h1><p>This is a test.日本語の表記体系</p>';
        const result = await htmlToPdfRequest(html);
        assert.strictEqual(result.statusCode, 200, 'Expected HTTP 200');
        assert.ok(result.buffer.length > 1000, 'PDF buffer should not be empty');

        // Save PDF to tests-out folder for manual inspection
        const outputDir = path.join(__dirname, '..', 'tests-out', 'html-to-pdf');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const outputPath = path.join(outputDir, 'output.pdf');
        fs.writeFileSync(outputPath, result.buffer);
    });

    it('should return a valid PDF file (header check)', async function () {
        const html = '<h1>Header Test</h1>';
        const result = await htmlToPdfRequest(html);
        const pdfHeader = result.buffer.slice(0, 5).toString();
        assert.strictEqual(pdfHeader, '%PDF-', 'PDF should start with %PDF-');
    });

    it('should return application/pdf content-type header', async function () {
        const html = '<h1>Content-Type Test</h1>';
        const result = await htmlToPdfRequest(html);
        assert(
            result.headers['content-type'] && result.headers['content-type'].includes('application/pdf'),
            'Content-Type should be application/pdf'
        );
    });
});
