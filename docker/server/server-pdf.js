const { execFile } = require('node:child_process');
const { promises: fs } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const PDFINFO_EXECUTABLE = 'pdfinfo';
const GHOSTSCRIPT_EXECUTABLE = 'gs';
const CHROME_EXECUTABLE = 'chromium';

/**
 * Checks if a Buffer contains a valid PDF file by header and by running pdfinfo.
 * @param {Buffer} pdfBuffer - The PDF file buffer.
 * @returns {Promise<boolean>} True if the buffer is a valid PDF, false otherwise.
 */
async function isValidPdf(pdfBuffer) {
    if (!pdfBuffer || pdfBuffer.length < 5 || pdfBuffer.slice(0, 5).toString() !== '%PDF-') {
        return false;
    }
    try {
        await new Promise((resolve, reject) => {
            const child = execFile(PDFINFO_EXECUTABLE, ['-'], (error, stdout, stderr) => {
                if (error) return reject(error);
                resolve(stdout);
            });
            child.stdin.write(pdfBuffer);
            child.stdin.end();
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * Counts the number of pages in a PDF buffer using pdfinfo.
 * @param {Buffer} pdfBuffer - The PDF file buffer.
 * @returns {Promise<number>} The number of pages in the PDF.
 * @throws {Error} If the page count cannot be determined.
 */
async function countPdfPages(pdfBuffer) {
    try {
        const output = await new Promise((resolve, reject) => {
            const child = execFile(PDFINFO_EXECUTABLE, ['-'], (error, stdout, stderr) => {
                if (error) return reject(new Error(`Could not determine page count: ${stderr}`));
                resolve(stdout);
            });
            child.stdin.write(pdfBuffer);
            child.stdin.end();
        });

        const match = output.match(/^Pages:\s+(\d+)/m);
        if (!match) throw new Error('Could not determine page count');
        return parseInt(match[1], 10);
    } catch (error) {
        throw new Error(`Could not determine page count: ${error.message}`);
    }
}

/**
 * Merges multiple PDF buffers into a single PDF.
 * @param {Buffer[]} pdfBuffers - Array of PDF file buffers
 * @returns {Promise<Buffer>} The merged PDF as a Buffer.
 */
async function mergePdfFiles(pdfBuffers) {
    if (!Array.isArray(pdfBuffers) || pdfBuffers.length < 2) {
        throw new Error('At least two PDF files are required to merge');
    }

    const tempDir = os.tmpdir();
    const tempFiles = [];
    const outputPdfPath = path.join(tempDir, `${crypto.randomUUID()}_merged.pdf`);

    try {
        // Write all standard buffers to temp files
        for (let i = 0; i < pdfBuffers.length; i++) {
            const buf = pdfBuffers[i];
            if (!buf || buf.length < 5 || buf.slice(0, 5).toString() !== '%PDF-') {
                throw new Error(`Invalid PDF buffer at index ${i}`);
            }
            const tempPath = path.join(tempDir, `${crypto.randomUUID()}_${i}.pdf`);
            await fs.writeFile(tempPath, buf);
            tempFiles.push(tempPath);
        }

        const args = [
            '-dBATCH',
            '-dNOPAUSE',
            '-q',
            '-sDEVICE=pdfwrite',
            `-sOutputFile=${outputPdfPath}`,
            ...tempFiles
        ];

        await new Promise((resolve, reject) => {
            execFile(GHOSTSCRIPT_EXECUTABLE, args, (error, stdout, stderr) => {
                if (error) return reject(new Error(`PDF merge failed: ${stderr || error.message}`));
                resolve(stdout);
            });
        });

        return await fs.readFile(outputPdfPath);
    } finally {
        for (const file of tempFiles) {
            await fs.unlink(file).catch(() => {});
        }
        await fs.unlink(outputPdfPath).catch(() => {});
    }
}

/**
 * Converts a specific page of a PDF buffer to a JPEG image with custom dimensions.
 * Calculates missing width/height proportionally if only one is provided.
 * @param {Buffer} pdfBuffer - The PDF file buffer.
 * @param {number} pageIndex - Zero-based index of the page to convert.
 * @param {Object} options - Options for image generation.
 * @param {number} [options.width] - Desired width in pixels.
 * @param {number} [options.height] - Desired height in pixels.
 * @param {number} [options.jpegQuality=75] - JPEG quality (1-100).
 *
 * @returns {Promise<Buffer>} The JPEG image buffer.
 * @throws {Error} If conversion fails or parameters are invalid.
 */
async function getPdfPageAsJpg(pdfBuffer, pageIndex = 0, options = {}) {
    const { width, height, jpegQuality = 75 } = options;

    // Validate parameters
    if (width !== undefined && (!Number.isInteger(width) || width < 1 || width > 10000)) {
        throw new Error('Width must be an integer between 1 and 10000 pixels');
    }
    if (height !== undefined && (!Number.isInteger(height) || height < 1 || height > 10000)) {
        throw new Error('Height must be an integer between 1 and 10000 pixels');
    }
    if (!Number.isInteger(jpegQuality) || jpegQuality < 1 || jpegQuality > 100) {
        throw new Error('JPEG quality must be an integer between 1 and 100');
    }
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
        throw new Error('pageIndex must be a non-negative integer');
    }
    if (!width && !height) {
        throw new Error('Either width or height (or both) must be specified');
    }

    if (!pdfBuffer || pdfBuffer.length < 5 || pdfBuffer.slice(0, 5).toString() !== '%PDF-') {
        throw new Error('Invalid PDF buffer provided');
    }

    // If only one dimension is specified, calculate the other proportionally using the original PDF page size
    let finalWidth = width;
    let finalHeight = height;

    if (!width || !height) {
        const pdfinfoOutput = await new Promise((resolve, reject) => {
            const child = execFile(PDFINFO_EXECUTABLE, ['-'], (error, stdout, stderr) => {
                if (error) return reject(new Error(`pdfinfo failed: ${stderr || error.message}`));
                resolve(stdout);
            });
            child.stdin.write(pdfBuffer);
            child.stdin.end();
        });
        const sizeMatch = pdfinfoOutput.match(/Page size:\s*(\d+(?:\.\d+)?) x (\d+(?:\.\d+)?) pts/);
        if (!sizeMatch) throw new Error('Could not determine PDF page size');

        const origWidth = parseFloat(sizeMatch[1]);
        const origHeight = parseFloat(sizeMatch[2]);
        if (!width) {
            finalHeight = height;
            finalWidth = Math.round((origWidth / origHeight) * finalHeight);
        } else {
            finalWidth = width;
            finalHeight = Math.round((origHeight / origWidth) * finalWidth);
        }
    }

    // Build ghostscript arguments for image generation
    const pageNum = pageIndex + 1; // Ghostscript uses 1-based page numbers
    const args = [
        '-dNOPAUSE',
        '-sDEVICE=jpeg',
        '-dUseCIEColor',
        '-dDOINTERPOLATE',
        '-dTextAlphaBits=4',
        '-dGraphicsAlphaBits=4',
        '-sOutputFile=-',
        `-dFirstPage=${pageNum}`,
        `-dLastPage=${pageNum}`,
        `-dJPEGQ=${jpegQuality}`,
        '-q',
        `-dDEVICEWIDTHPOINTS=${finalWidth}`,
        `-dDEVICEHEIGHTPOINTS=${finalHeight}`,
        '-dPDFFitPage=true',
        '-'
    ];

    try {
        const imageBuffer = await new Promise((resolve, reject) => {
            const child = execFile(
                GHOSTSCRIPT_EXECUTABLE,
                args,
                { encoding: null, maxBuffer: 10 * 1024 * 1024 },
                (err, stdout) => {
                    if (err) return reject(new Error(`Ghostscript failed: ${err.message}`));
                    if (stdout.length < 500) return reject(new Error(`Ghostscript failed: ${stdout.toString()}`));
                    resolve(stdout);
                }
            );
            child.stdin.write(pdfBuffer);
            child.stdin.end();
        });
        return imageBuffer;
    } catch (error) {
        throw new Error(`Could not generate PDF image: ${error.message}`);
    }
}

/**
 * Converts HTML content to a PDF buffer using headless Chromium.
 * Uses temporary files for input and output to avoid command line length limits.
 * @param {string} html - The HTML content to convert.
 * @returns {Promise<Buffer>} The generated PDF as a Buffer.
 * @throws {Error} If PDF generation fails.
 */
async function convertHtmlToPdf(html) {
    const uniqueId = crypto.randomUUID();
    const tempDir = os.tmpdir();
    const inputHtmlPath = path.join(tempDir, `${uniqueId}.html`);
    const outputPdfPath = path.join(tempDir, `${uniqueId}.pdf`);

    try {
        // Write HTML to temp file
        await fs.writeFile(inputHtmlPath, html, 'utf-8');
        const args = [
            '--headless=new',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--no-pdf-header-footer',
            `--print-to-pdf=${outputPdfPath}`,
            inputHtmlPath
        ];

        await new Promise((resolve, reject) => {
            execFile(CHROME_EXECUTABLE, args, (error, stdout, stderr) => {
                if (error) return reject(new Error(`PDF generation failed: ${stderr}`));
                resolve(stdout);
            });
        });
        return await fs.readFile(outputPdfPath);
    } finally {
        await Promise.allSettled([fs.unlink(inputHtmlPath), fs.unlink(outputPdfPath)]);
    }
}

module.exports = {
    isValidPdf,
    countPdfPages,
    mergePdfFiles,
    getPdfPageAsJpg,
    convertHtmlToPdf
};