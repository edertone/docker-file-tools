# File Tools Microservice

## Cache API endpoints documentation

The cache is implemented using a high-performance hybrid system: **SQLite** is used for metadata and TTL (Time-To-Live) management, while the actual data is stored as **flat files** on the disk.

**Key Features:**

- **Namespaces:** Data is logically separated into namespaces (e.g., `product-images`, `temp-pdf`). Each namespace gets its own subfolder on the disk, ensuring high performance even with large numbers of files.
- **Low Memory Usage:** Files are streamed directly to/from the disk preventing RAM spikes.
- **Persistence:** The data is stored inside `/app/file-tools-cache`. To persist the cache between container restarts, ensure this directory is mounted as a volume.

## Index

- [/cache-set (Save a value to the cache)](#cache-set)
- [/cache-get (Obtain a value from the cache)](#cache-get)
- [/cache-delete-key (Delete a value from the cache)](#cache-delete-key)
- [/cache-clear-namespace (Empty a specific namespace)](#cache-clear-namespace)
- [/cache-prune (Manually clean expired values)](#cache-prune)
- [/cache-delete-all (Erase all data globally)](#cache-delete-all)

---

### /cache-set

Stores a value in the cache within a specific namespace. The input is streamed directly to a subfolder on the disk defined by the namespace.

**Method:** `POST`

**Content-Type:** `multipart/form-data` (Recommended for files) or `application/json`

**Parameters:**

- **`namespace`** (string, **required**): The logical group for this item.
  - _Allowed characters:_ Alphanumeric, underscores (`_`), and hyphens (`-`) only.
- **`key`** (string, **required**): The unique identifier for the entry _within_ that namespace.
- `value` (file/string, **required**): The data to store.
- `expire` (integer, optional): The expiration time in seconds. If omitted, the item does not expire automatically.

**Response:**

```json
{
    "success": true
}
```

**Example (Node.js - Storing a File):**

```javascript
const FormData = require('form-data');
const fs = require('fs');

const form = new FormData();
form.append('namespace', 'product-images');
form.append('key', 'product-123-thumb');
// You can append a file stream or a simple string
form.append('value', fs.createReadStream('./image.jpg'));
form.append('expire', '3600'); // Expire in 1 hour

const response = await fetch('http://localhost:5001/cache-set', {
    method: 'POST',
    body: form
});
const result = await response.json();
console.log('Set cache success:', result.success);
```

---

### /cache-get

Retrieves a value from the cache. The server streams the file directly from the namespace's folder to the response.

**Method:** `POST`

**Content-Type:** `application/json`

**Parameters:**

- **`namespace`** (string, **required**): The namespace where the key is stored.
- **`key`** (string, **required**): The key of the cache entry to retrieve.

**Response:**

- **Found (HTTP 200):**
  - **Body:** Returns the raw binary data as a stream (`application/octet-stream`).
  - **Headers:**
  - `X-Cache-Created-At`: An ISO 8601 timestamp indicating when the cache entry was created.
- **Not Found (HTTP 404):** Returns a JSON error message (`application/json`).

**Example (Node.js):**

```javascript
const response = await fetch('http://localhost:5001/cache-get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        namespace: 'product-images',
        key: 'product-123-thumb'
    })
});

if (response.ok) {
    const creationDate = new Date(response.headers.get('x-cache-created-at'));
    console.log(`Cache entry was created at: ${creationDate.toLocaleString()}`);

    // The body contains the raw file data
    const imageBuffer = await response.buffer();
    fs.writeFileSync('retrieved_image.jpg', imageBuffer);
} else {
    const error = await response.json();
    console.error(`Failed to get cache: ${error.message}`);
}
```

---

### /cache-delete-key

Removes a specific value from a specific namespace. This deletes the metadata record and the physical file.

**Method:** `POST`

**Content-Type:** `application/json`

**Parameters:**

- **`namespace`** (string, **required**): The namespace containing the key.
- **`key`** (string, **required**): The key to remove.

**Response:**

```json
{
    "success": true,
    "deleted": true
}
```

**Example (Node.js):**

```javascript
const response = await fetch('http://localhost:5001/cache-delete-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        namespace: 'product-images',
        key: 'product-123-thumb'
    })
});
const result = await response.json();
console.log('Was deleted:', result.deleted);
```

---

### /cache-clear-namespace

Completely removes **all** keys and files associated with a specific namespace. This is highly efficient as it removes the entire directory for that namespace at once. Other namespaces remain untouched.

**Method:** `POST`

**Content-Type:** `application/json`

**Parameters:**

- **`namespace`** (string, **required**): The namespace to wipe.

**Response:**

```json
{
    "success": true,
    "deleted": 150
}
```

_`deleted` represents the number of database records removed._

**Example (Node.js):**

```javascript
const response = await fetch('http://localhost:5001/cache-clear-namespace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ namespace: 'product-images' })
});
const result = await response.json();
console.log(`Namespace cleared. ${result.deleted} items removed.`);
```

---

### /cache-prune

Manually triggers the background cleanup process. This scans **all namespaces** for items where the TTL has expired and removes them to free up disk space.

_Note: This process also runs automatically in the background every 2 hours._

**Method:** `POST`

**Content-Type:** `application/json` (Body is optional/ignored)

**Response:**

```json
{
    "success": true,
    "deleted": 5
}
```

**Example (Node.js):**

```javascript
const response = await fetch('http://localhost:5001/cache-prune', {
    method: 'POST'
});
const result = await response.json();
console.log('Prune complete. Total items removed:', result.deleted);
```

---

### /cache-delete-all

Removes **EVERYTHING** from the cache. This wipes the database and deletes the entire storage directory structure, including all namespaces. Use with extreme caution.

**Method:** `POST`

**Content-Type:** `application/json`

**Parameters:**

None

**Response:**

```json
{
    "success": true
}
```

**Example (Node.js):**

```javascript
const response = await fetch('http://localhost:5001/cache-delete-all', {
    method: 'POST'
});
const result = await response.json();
console.log('Total cache wipe success:', result.success);
```
