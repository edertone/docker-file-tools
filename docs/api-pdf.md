# File Tools Microservice

## PDF API endpoints documentation

## Index

- [/pdf-is-valid (Check if a file is a valid PDF)](#pdf-is-valid)
- [/pdf-count-pages (Count the number of pages on a PDF)](#pdf-count-pages)
- [/pdf-get-page-as-jpg (Extract a page from a PDF as a JPG image)](#pdf-get-page-as-jpg)
- [/html-to-pdf-binary (Convert html code to a binary PDF file)](#html-to-pdf-binary)
- [/html-to-pdf-base64 (Convert html code to a base 64 encoded PDF file)](#html-to-pdf-base64)

### /pdf-is-valid

Verify that a provided file is a valid PDF document

**Method:** `POST`

**Content-Type:** `multipart/form-data`

**Parameters:**

- `pdf` (file): The PDF file data

**Response:**

```json
{
    "valid": true
}
```

**Example (Node.js):**

```javascript
const formData = new FormData();
formData.append('pdf', pdfBuffer);

const response = await fetch('http://localhost:5001/pdf-is-valid', {
    method: 'POST',
    body: formData
});
const result = await response.json();
console.log('Is valid PDF:', result.valid);
```

---

### /pdf-count-pages

Count the number of pages on a provided PDF file

**Method:** `POST`

**Content-Type:** `multipart/form-data`

**Parameters:**

- `pdf` (file): The PDF file data

**Response:**

```json
{
    "pages": 5
}
```

**Example using cURL**:

```sh
curl -X POST -F "pdf=@document.pdf" http://localhost:5001/pdf-count-pages
```

---

### /pdf-get-page-as-jpg

Convert a specific PDF page to a JPEG image with custom quality and resolution.

**Method:** `POST`

**Content-Type:** `multipart/form-data` or `application/json`

**Parameters:**

- `pdf` (required - file or base64 string): The PDF file data
- `page` (required - integer): Page number (0 = first page)
- `width` (optional - integer): Desired width in pixels (1-10000)
- `height` (optional - integer): Desired height in pixels (1-10000)
- `jpegQuality` (optional - integer): JPEG quality (1-100, default: 75)

At least one of `width` or `height` must be provided. If only one is given, the other is calculated to preserve aspect ratio.

**Response:**

- JPEG image as binary data (`Content-Type: image/jpeg`)

**Example (Node.js):**

```javascript
const formData = new FormData();
formData.append('pdf', pdfBuffer);
formData.append('page', '0');
formData.append('width', '800');
formData.append('jpegQuality', '95');

const response = await fetch('http://localhost:5001/pdf-get-page-as-jpg', {
    method: 'POST',
    body: formData
});
const imageBuffer = await response.arrayBuffer();
// Save or process the JPEG image
```

---

### /html-to-pdf-binary

Convert HTML content to a pixel-perfect PDF using the Chromium engine.
Returns the PDF as a binary file.

**Method:** `POST`

**Content-Type:** `multipart/form-data` or `application/json`

**Parameters:**

- `html` (required - string or file): The HTML content to convert.

**Response:**

- PDF document as binary data (`Content-Type: application/pdf`)

**Example:**

```javascript
const response = await fetch('http://localhost:5001/html-to-pdf-binary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html: '<h1>Hello World</h1>' })
});
const pdfBuffer = await response.arrayBuffer();
// ... save or process pdfBuffer
```

---

### /html-to-pdf-base64

Convert HTML content to a pixel-perfect PDF using the Chromium engine.
Returns the PDF as a base64 string.

**Method:** `POST`

**Content-Type:** `multipart/form-data` or `application/json`

**Parameters:**

- `html` (required - string or file): The HTML content to convert.

**Response:**

```json
"JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2c..."
```

**Example:**

```javascript
const response = await fetch('http://localhost:5001/html-to-pdf-base64', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html: '<h1>Hello World</h1>' })
});
// ... save or process base 64 string
```
