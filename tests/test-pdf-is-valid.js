const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ENDPOINT = 'http://localhost:5001/pdf-is-valid';
const TEST_FILES = [
    { name: 'sample1.pdf', description: '1-page PDF', valid: true },
    { name: 'sample4.pdf', description: '4-page PDF', valid: true },
    { name: 'sample30.pdf', description: '30-page PDF', valid: true },
    { name: 'sample-invalid.pdf', description: 'Invalid PDF', valid: false }
];

async function isValidPdfRequest(fileName) {
    const filePath = path.join(__dirname, 'resources', 'pdf-samples', fileName);
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${fileName}`);
    }

    const fetch = (await import('node-fetch')).default;
    const FormData = require('form-data');

    const pdfBuffer = fs.readFileSync(filePath);
    const formData = new FormData();
    formData.append('pdf', pdfBuffer, fileName);

    const response = await fetch(ENDPOINT, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
    });

    try {
        return await response.json();
    } catch (e) {
        const text = await response.text();
        return { error: text };
    }
}

describe('PDF Is Valid API', function () {
    this.timeout(10000);
    TEST_FILES.forEach(({ name, description, valid }) => {
        it(`should return valid=${valid} for ${description} (${name})`, async function () {
            const result = await isValidPdfRequest(name);
            if (valid) {
                assert.strictEqual(result.valid, true, `Expected valid PDF for ${name}`);
            } else {
                assert.strictEqual(result.valid, false, `Expected invalid PDF for ${name}`);
            }
        });
    });
});
