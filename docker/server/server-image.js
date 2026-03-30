const { spawn } = require('node:child_process');

/**
 * Converts an image buffer to a JPEG buffer using ImageMagick.
 * @param {Buffer} imageBuffer - The image file buffer.
 * @param {Object} options - Options for image generation.
 * @param {number} [options.jpegQuality=75] - JPEG quality (1-100).
 * @param {string} [options.transparentColor='#FFFFFF'] - Background color for transparent images.
 * @returns {Promise<Buffer>} The JPEG image buffer.
 */
async function convertImageToJpg(imageBuffer, options = {}) {
    const { jpegQuality = 75, transparentColor = '#FFFFFF' } = options;
    if (!Number.isInteger(jpegQuality) || jpegQuality < 1 || jpegQuality > 100) {
        throw new Error('JPEG quality must be an integer between 1 and 100');
    }

    return await new Promise((resolve, reject) => {
        const args = [
            '-', // read from stdin
            '-background',
            transparentColor,
            '-flatten',
            '-quality',
            String(jpegQuality),
            'jpg:-' // write to stdout
        ];
        const magick = spawn('magick', args);
        let stdoutBuffers = [];
        let stderrBuffers = [];

        magick.stdout.on('data', data => stdoutBuffers.push(data));
        magick.stderr.on('data', data => stderrBuffers.push(data));
        magick.on('error', err => reject(new Error(`Failed to start ImageMagick: ${err.message}`)));
        magick.on('close', code => {
            if (code !== 0) {
                const stderr = Buffer.concat(stderrBuffers).toString();
                return reject(new Error(`Could not convert image to JPG: ${stderr}`));
            }
            resolve(Buffer.concat(stdoutBuffers));
        });
        magick.stdin.write(imageBuffer);
        magick.stdin.end();
    });
}

module.exports = {
    convertImageToJpg
};