const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ENDPOINT = 'http://localhost:5001/pdf-count-pages';

const TEST_CASES = [
    { file: 'sample1.pdf', expected: 1 },
    { file: 'sample4.pdf', expected: 4 },
    { file: 'sample30.pdf', expected: 30 }
];

async function countPagesForFile(pdfPath, expectedPages) {
    if (!fs.existsSync(pdfPath)) {
        return { success: false, error: 'File not found' };
    }

    try {
        const fetch = (await import('node-fetch')).default;
        const FormData = require('form-data');

        const fileContents = fs.readFileSync(pdfPath);
        const fileName = path.basename(pdfPath);

        const formData = new FormData();
        formData.append('pdf', fileContents, fileName);

        const response = await fetch(ENDPOINT, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        if (!response.ok) {
            return {
                success: false,
                actual: null,
                expected: expectedPages,
                error: `HTTP ${response.status}: ${response.statusText}`
            };
        }

        const result = await response.json();

        if (result.pages !== undefined) {
            const pass = result.pages === expectedPages;
            return {
                success: pass,
                actual: result.pages,
                expected: expectedPages,
                error: pass ? null : `Expected ${expectedPages}, got ${result.pages}`
            };
        } else {
            return {
                success: false,
                actual: null,
                expected: expectedPages,
                error: result.error || 'No pages count returned'
            };
        }
    } catch (error) {
        return {
            success: false,
            actual: null,
            expected: expectedPages,
            error: 'Request failed: ' + error.message
        };
    }
}

describe('PDF Count Pages API', function () {
    this.timeout(10000); // Allow up to 10s per test
    TEST_CASES.forEach(({ file, expected }) => {
        it(`should return ${expected} pages for ${file}`, async function () {
            const pdfPath = path.join(__dirname, 'resources', 'pdf-samples', file);
            const result = await countPagesForFile(pdfPath, expected);
            assert.strictEqual(result.success, true, result.error || 'Unknown error');
            assert.strictEqual(result.actual, expected, result.error || 'Page count mismatch');
        });
    });
});
