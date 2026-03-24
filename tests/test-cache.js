const assert = require('assert');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT_DIR = path.join(__dirname, '..', 'tests-out', 'test-cache');

function ensureOutDir() {
    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }
}

async function makeRequest(path, data, isMultipart = false) {
    const fetch = (await import('node-fetch')).default;

    let body;
    const headers = {};

    if (isMultipart) {
        const form = new FormData();
        for (const key in data) {
            if (key === 'value' && typeof data[key] === 'object' && data[key].buffer) {
                form.append(key, data[key].buffer, data[key].options);
            } else {
                form.append(key, data[key]);
            }
        }
        body = form;
        Object.assign(headers, form.getHeaders());
    } else {
        body = JSON.stringify(data);
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`http://localhost:5001${path}`, {
        method: 'POST',
        headers,
        body
    });

    const contentType = response.headers.get('content-type');
    let responseBody;

    if (contentType && contentType.includes('application/json')) {
        responseBody = await response.json();
    } else {
        responseBody = Buffer.from(await response.arrayBuffer());
    }

    return {
        statusCode: response.status,
        body: responseBody,
        contentType,
        headers: response.headers
    };
}

describe('Cache API', function () {
    this.timeout(10000);

    const testNamespace = 'test-ns-main';
    const testKey = 'test-key';
    const testValue = 'Hello, World!';

    before(async function () {
        ensureOutDir();
        // Clear everything to start fresh
        await makeRequest('/cache-delete-all', {});
    });

    it('should set and get a simple text value (Inline DB Storage)', async function () {
        // Set value
        const setResult = await makeRequest(
            '/cache-set',
            { namespace: testNamespace, key: testKey, value: testValue },
            true
        );
        assert.strictEqual(setResult.statusCode, 200, 'Expected HTTP 200 for set');
        assert.deepStrictEqual(setResult.body, { success: true }, 'Expected success message for set');

        // Get value
        const getResult = await makeRequest('/cache-get', { namespace: testNamespace, key: testKey });
        assert.strictEqual(getResult.statusCode, 200, 'Expected HTTP 200 for get');
        assert.strictEqual(getResult.body.toString(), testValue, 'Expected to get the set value back');

        // Verify creation date header
        const creationHeader = getResult.headers.get('x-cache-created-at');
        assert(creationHeader, 'Expected x-cache-created-at header to be present');
        const creationDate = new Date(creationHeader);
        assert(!isNaN(creationDate.getTime()), 'Expected a valid date in the header');
        assert(Date.now() - creationDate.getTime() < 5000, 'Expected creation date to be recent');
    });

    it('should handle Hybrid Storage correctly (Small vs Large)', async function () {
        const smallSize = 50 * 1024; // 50KB (Below 100KB threshold -> DB)
        const largeSize = 150 * 1024; // 150KB (Above 100KB threshold -> Disk)

        const smallBuffer = crypto.randomBytes(smallSize);
        const largeBuffer = crypto.randomBytes(largeSize);

        // 1. Test Small File (DB Path)
        await makeRequest(
            '/cache-set',
            {
                namespace: testNamespace,
                key: 'small-file',
                value: { buffer: smallBuffer, options: { filename: 'small.bin' } }
            },
            true
        );

        const getSmall = await makeRequest('/cache-get', { namespace: testNamespace, key: 'small-file' });
        assert.strictEqual(getSmall.statusCode, 200, 'Should retrieve small file');
        assert.strictEqual(Buffer.compare(getSmall.body, smallBuffer), 0, 'Small buffer should match exactly');

        // 2. Test Large File (Disk Path)
        await makeRequest(
            '/cache-set',
            {
                namespace: testNamespace,
                key: 'large-file',
                value: { buffer: largeBuffer, options: { filename: 'large.bin' } }
            },
            true
        );

        const getLarge = await makeRequest('/cache-get', { namespace: testNamespace, key: 'large-file' });
        assert.strictEqual(getLarge.statusCode, 200, 'Should retrieve large file');
        assert.strictEqual(Buffer.compare(getLarge.body, largeBuffer), 0, 'Large buffer should match exactly');
    });

    it('should fail with invalid namespace characters', async function () {
        const setResult = await makeRequest('/cache-set', { namespace: '../hack', key: 'hack', value: 'val' }, true);
        assert.strictEqual(setResult.statusCode, 400, 'Expected HTTP 400 for invalid namespace');
        assert(setResult.body.error.includes('Invalid namespace'), 'Expected invalid namespace error');
    });

    it('should clear an existing key from cache', async function () {
        // Set value first
        await makeRequest('/cache-set', { namespace: testNamespace, key: testKey, value: testValue }, true);

        // Confirm key exists
        let getResult = await makeRequest('/cache-get', { namespace: testNamespace, key: testKey });
        assert.strictEqual(getResult.body.toString(), testValue, 'Expected value to be set before clear');

        // Clear the key
        const clearResult = await makeRequest('/cache-delete-key', { namespace: testNamespace, key: testKey });
        assert.strictEqual(clearResult.statusCode, 200, 'Expected HTTP 200 for clear');
        assert.deepStrictEqual(
            clearResult.body,
            { success: true, deleted: true },
            'Expected deleted: true for existing key'
        );

        // Confirm key is gone
        getResult = await makeRequest('/cache-get', { namespace: testNamespace, key: testKey });
        assert.strictEqual(getResult.statusCode, 404, 'Expected HTTP 404 after clear');
    });

    it('should return deleted: false for non-existent key', async function () {
        const clearResult = await makeRequest('/cache-delete-key', {
            namespace: testNamespace,
            key: 'non-existent-key-2'
        });
        assert.strictEqual(clearResult.statusCode, 200, 'Expected HTTP 200 for clear non-existent');
        assert.deepStrictEqual(
            clearResult.body,
            { success: true, deleted: false },
            'Expected deleted: false for non-existent key'
        );
    });

    it('should return error if key is missing for clear', async function () {
        const clearResult = await makeRequest('/cache-delete-key', { namespace: testNamespace });
        assert.strictEqual(clearResult.statusCode, 400, 'Expected HTTP 400 for missing key');
        assert(
            clearResult.body.error && clearResult.body.error.includes('Missing'),
            'Expected error message for missing key'
        );
    });

    it('should return error if namespace is missing for clear', async function () {
        const clearResult = await makeRequest('/cache-delete-key', { key: 'some-key' });
        assert.strictEqual(clearResult.statusCode, 400, 'Expected HTTP 400 for missing namespace');
        assert(
            clearResult.body.error && clearResult.body.error.includes('Missing'),
            'Expected error message for missing namespace'
        );
    });

    it('should return 404 for a non-existent key', async function () {
        const getResult = await makeRequest('/cache-get', { namespace: testNamespace, key: 'non-existent-key' });
        assert.strictEqual(getResult.statusCode, 404, 'Expected HTTP 404');
        assert(getResult.body.error, 'Expected error message in body');
    });

    it('should expire a key after the specified duration', async function () {
        const expiringKey = 'expiring-key';
        const expiringValue = 'This will disappear';
        const expireSeconds = 2;

        // Set value with expiration
        await makeRequest(
            '/cache-set',
            {
                namespace: testNamespace,
                key: expiringKey,
                value: expiringValue,
                expire: expireSeconds
            },
            true
        );

        // Wait for the key to expire
        await new Promise(resolve => setTimeout(resolve, expireSeconds * 1000 + 500));

        // Try to get the expired value
        const getResult = await makeRequest('/cache-get', { namespace: testNamespace, key: expiringKey });
        assert.strictEqual(getResult.statusCode, 404, 'Expected HTTP 404 for expired key');
    });

    it('should clear an entire namespace without affecting others', async function () {
        const nsToDelete = 'ns-delete-me';
        const nsToKeep = 'ns-keep-me';

        // 1. Set keys in both namespaces
        await makeRequest('/cache-set', { namespace: nsToDelete, key: 'k1', value: 'v1' }, true);
        await makeRequest('/cache-set', { namespace: nsToKeep, key: 'k2', value: 'v2' }, true);

        // 2. Clear only one namespace
        const clearNsResult = await makeRequest('/cache-clear-namespace', { namespace: nsToDelete });
        assert.strictEqual(clearNsResult.statusCode, 200);
        assert.deepStrictEqual(clearNsResult.body, { success: true, deleted: 1 });

        // 3. Verify keys in deleted namespace are gone
        const getDeleted = await makeRequest('/cache-get', { namespace: nsToDelete, key: 'k1' });
        assert.strictEqual(getDeleted.statusCode, 404, 'Key in cleared namespace should be gone');

        // 4. Verify keys in kept namespace are still there
        const getKept = await makeRequest('/cache-get', { namespace: nsToKeep, key: 'k2' });
        assert.strictEqual(getKept.statusCode, 200, 'Key in other namespace should remain');
    });

    it('should clear all keys from cache (global clear)', async function () {
        // Set multiple keys in different namespaces
        await makeRequest('/cache-set', { namespace: 'ns1', key: 'key1', value: 'value1' }, true);
        await makeRequest('/cache-set', { namespace: 'ns2', key: 'key2', value: 'value2' }, true);

        // Clear all keys
        const clearAllResult = await makeRequest('/cache-delete-all', {});
        assert.strictEqual(clearAllResult.statusCode, 200, 'Expected HTTP 200 for clear all');
        assert.deepStrictEqual(clearAllResult.body, { success: true }, 'Expected success message for clear all');

        // Confirm all keys are gone
        let get1 = await makeRequest('/cache-get', { namespace: 'ns1', key: 'key1' });
        let get2 = await makeRequest('/cache-get', { namespace: 'ns2', key: 'key2' });
        assert.strictEqual(get1.statusCode, 404, 'Expected key1 to be cleared');
        assert.strictEqual(get2.statusCode, 404, 'Expected key2 to be cleared');
    });

    it('should save and retrieve a PDF file from cache', async function () {
        const cacheKey = 'key1';
        const pdfPath = 'tests/resources/pdf-samples/sample30.pdf';

        // Create a stream for the PDF file
        const originalPdfBuffer = fs.readFileSync(pdfPath);

        const setResult = await makeRequest(
            '/cache-set',
            {
                namespace: testNamespace,
                key: cacheKey,
                value: {
                    buffer: originalPdfBuffer,
                    options: { filename: 'sample30.pdf', contentType: 'application/pdf' }
                }
            },
            true
        );

        assert.strictEqual(setResult.statusCode, 200, 'Expected HTTP 200 for set');

        // Retrieve the PDF file from cache
        const getResult = await makeRequest('/cache-get', { namespace: testNamespace, key: cacheKey });
        assert.strictEqual(getResult.statusCode, 200, 'Expected HTTP 200 for get');

        fs.writeFileSync(path.join(OUT_DIR, 'sample30.pdf'), getResult.body);

        // Compare the retrieved buffer with the original file
        assert.ok(getResult.body instanceof Buffer, 'Expected the retrieved value to be a Buffer');
        assert.strictEqual(
            Buffer.compare(originalPdfBuffer, getResult.body),
            0,
            'The retrieved PDF file does not match the original'
        );

        // Clear the key
        const clearResult = await makeRequest('/cache-delete-key', { namespace: testNamespace, key: cacheKey });
        assert.strictEqual(clearResult.statusCode, 200, 'Expected HTTP 200 for clear');
        assert.deepStrictEqual(
            clearResult.body,
            { success: true, deleted: true },
            'Expected deleted: true for existing key'
        );

        // Confirm key is gone
        const getResult2 = await makeRequest('/cache-get', { namespace: testNamespace, key: cacheKey });
        assert.strictEqual(getResult2.statusCode, 404, 'Expected HTTP 404 after clear');
    });

    it('should prune expired keys correctly', async function () {
        const keyExpired = 'to-be-pruned';
        const keyValid = 'to-be-kept';
        const expireSeconds = 1;

        // 1. Set a key that will expire in 1 second
        await makeRequest(
            '/cache-set',
            {
                namespace: testNamespace,
                key: keyExpired,
                value: 'I will die',
                expire: expireSeconds
            },
            true
        );

        // 2. Set a key that will expire in 10 seconds (should survive)
        await makeRequest(
            '/cache-set',
            {
                namespace: testNamespace,
                key: keyValid,
                value: 'I will survive',
                expire: 10
            },
            true
        );

        // 3. Wait 1.5 seconds for the first key to expire
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 4. Call the prune endpoint
        const pruneResult = await makeRequest('/cache-prune', {});

        assert.strictEqual(pruneResult.statusCode, 200, 'Expected HTTP 200 for prune');
        // We expect at least 1 deleted. (Could be more if other tests left expired garbage, but usually 1)
        assert.ok(pruneResult.body.deleted >= 1, 'Expected at least 1 item to be pruned');

        // 5. Verify the expired key is gone (404)
        const getExpired = await makeRequest('/cache-get', { namespace: testNamespace, key: keyExpired });
        assert.strictEqual(getExpired.statusCode, 404, 'Expired key should be not found');

        // 6. Verify the valid key is still there (200)
        const getValid = await makeRequest('/cache-get', { namespace: testNamespace, key: keyValid });
        assert.strictEqual(getValid.statusCode, 200, 'Valid key should still exist');
        assert.strictEqual(getValid.body.toString(), 'I will survive');
    });
});
