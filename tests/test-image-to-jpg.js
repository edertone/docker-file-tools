const assert = require('assert');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:5001';
const OUT_DIR = path.join(__dirname, '..', 'tests-out', 'image-to-jpg');

function ensureOutDir() {
    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }
}

/**
 * Helper to make API requests for image conversion.
 * @param {Buffer} imageBuffer - The image buffer to send.
 * @param {string} originalFilename - The original filename of the image.
 * @param {number} [jpegQuality] - Optional JPEG quality setting.
 * @param {string} [transparentColor] - Optional transparent background color.
 * @returns {Promise<Object>} - The response object with statusCode, buffer, and headers.
 */
async function convertImage(imageBuffer, originalFilename, jpegQuality, transparentColor) {
    const fetch = (await import('node-fetch')).default;
    const FormData = require('form-data');

    const formData = new FormData();
    formData.append('image', imageBuffer, originalFilename);

    if (jpegQuality !== undefined) {
        formData.append('jpegQuality', String(jpegQuality));
    }

    if (transparentColor !== undefined) {
        formData.append('transparentColor', transparentColor);
    }

    const response = await fetch(`${API_URL}/image-to-jpg`, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
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

describe('Image to JPG API', function () {
    this.timeout(10000); // Allow up to 10s per test
    const imageDir = path.join(__dirname, 'resources', 'image-to-jpg');

    before(function () {
        ensureOutDir();
    });

    it('should convert a PNG image to JPG', async function () {
        const imagePath = path.join(imageDir, 'png-sample.png');
        const imageBuffer = fs.readFileSync(imagePath);

        const response = await convertImage(imageBuffer, 'png-sample.png');
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.headers['content-type'], 'image/jpeg');

        assert(response.buffer.length > 0, 'Response buffer should not be empty');

        // Save the converted image
        const outputPath = path.join(OUT_DIR, 'png-sample.jpg');
        fs.writeFileSync(outputPath, response.buffer);
    });

    it('should convert a PNG image with transparent background to JPG with white background', async function () {
        const imagePath = path.join(imageDir, 'png-sample-transparent.png');
        const imageBuffer = fs.readFileSync(imagePath);

        const response = await convertImage(imageBuffer, 'png-sample-transparent.png');
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.headers['content-type'], 'image/jpeg');

        assert(response.buffer.length > 0, 'Response buffer should not be empty');

        // Save the converted image
        const outputPath = path.join(OUT_DIR, 'png-sample-transparent-bg-white.jpg');
        fs.writeFileSync(outputPath, response.buffer);
    });

    it('should convert a PNG image with transparent background to JPG with black background', async function () {
        const imagePath = path.join(imageDir, 'png-sample-transparent.png');
        const imageBuffer = fs.readFileSync(imagePath);

        const response = await convertImage(imageBuffer, 'png-sample-transparent.png', undefined, '#000000');
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.headers['content-type'], 'image/jpeg');

        assert(response.buffer.length > 0, 'Response buffer should not be empty');

        // Save the converted image
        const outputPath = path.join(OUT_DIR, 'png-sample-transparent-bg-black.jpg');
        fs.writeFileSync(outputPath, response.buffer);
    });

    it('should convert a BMP image to JPG', async function () {
        const imagePath = path.join(imageDir, 'bmp-sample.bmp');
        const imageBuffer = fs.readFileSync(imagePath);

        const response = await convertImage(imageBuffer, 'bmp-sample.bmp');
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.headers['content-type'], 'image/jpeg');

        assert(response.buffer.length > 0, 'Response buffer should not be empty');

        // Save the converted image
        const outputPath = path.join(OUT_DIR, 'bmp-sample.jpg');
        fs.writeFileSync(outputPath, response.buffer);
    });

    it('should respect the jpegQuality parameter', async function () {
        const imagePath = path.join(imageDir, 'png-sample-transparent.png');
        const imageBuffer = fs.readFileSync(imagePath);

        // Convert with low quality
        const lowQualityResponse = await convertImage(imageBuffer, 'png-sample-transparent.png', 10);
        const lowQualityBuffer = lowQualityResponse.buffer;

        // Convert with high quality
        const highQualityResponse = await convertImage(imageBuffer, 'png-sample-transparent.png', 100);
        const highQualityBuffer = highQualityResponse.buffer;

        assert(
            lowQualityBuffer.length < highQualityBuffer.length,
            'Low quality image should be smaller than high quality image'
        );

        // Save both quality versions
        const lowQualityPath = path.join(OUT_DIR, 'png-sample-transparent-qual10.jpg');
        const highQualityPath = path.join(OUT_DIR, 'png-sample-transparent-qual100.jpg');
        fs.writeFileSync(lowQualityPath, lowQualityBuffer);
        fs.writeFileSync(highQualityPath, highQualityBuffer);
    });

    it('should return a 500 error for an invalid image', async function () {
        const invalidImageBuffer = Buffer.from('this is not an image');
        const response = await convertImage(invalidImageBuffer, 'invalid.txt');
        assert.strictEqual(response.statusCode, 500);

        const json = JSON.parse(response.buffer.toString());
        assert(
            json.error.includes('Could not convert image to JPG'),
            'Error message should indicate conversion failure'
        );
    });
});
