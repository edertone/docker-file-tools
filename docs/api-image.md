# File Tools Microservice

## Image API endpoints documentation

Several general purpose methods to operate with images

## Index

- [/image-to-jpg (Convert any image to JPG)](#image-to-jpg)

---

### /image-to-jpg

Convert any image to JPEG with a specific quality and an optional background color for transparent areas in the original image

**Method:** `POST`

**Content-Type:** `multipart/form-data`

**Parameters:**

- `image` (file): The image file to convert.
- `jpegQuality` (optional - integer): The quality of the output JPEG (1-100, default: 75).
- `transparentColor` (optional - string): The hex color to use for transparent areas (e.g., '#FFFFFF', default is white).

**Response:**

- JPEG image as binary data (`Content-Type: image/jpeg`)

**Example (Node.js):**

```javascript
const formData = new FormData();
formData.append('image', imageBuffer);
formData.append('jpegQuality', '90');
formData.append('transparentColor', '#000000');

const response = await fetch('http://localhost:5001/image-to-jpg', {
    method: 'POST',
    body: formData
});
const imageBlob = await response.blob();
// ... handle image blob
```
