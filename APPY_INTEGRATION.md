# APPY → GroundOps Maintenance Request Integration

## Endpoint

```
POST https://groundopscos.vercel.app/api/maint-requests
```

## Authentication

```
Authorization: Bearer <API_TOKEN>
```

Create/manage tokens at: https://groundopscos.vercel.app/admin-portal/resources

## Request Body (JSON)

```json
{
  "venue": "Delilah (West Hollywood)",
  "requestor": "Dylan Wilde",
  "date": "04/16/2026",
  "title": "Broken AC unit in main hall",
  "description": "AC stopped blowing cold air around 2pm. Temperature rising.",
  "priority": "high",
  "image": "<base64-encoded JPEG>"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| venue | string | Yes | Location name (matched to system locations) |
| requestor | string | Yes | Person reporting the issue |
| date | string | Yes | Date of request (MM/DD/YYYY or ISO) |
| title | string | Yes | Short summary |
| description | string | Yes | Full description |
| priority | string | Yes | `low`, `medium`, or `high` |
| image | string | No | Base64 JPEG (raw or with `data:image/jpeg;base64,` prefix), OR a URL |

## Image Requirements

**Maximum payload size: 4 MB** (Vercel platform limit)

To stay under this, the caller MUST resize images before base64-encoding:

| Setting | Value |
|---|---|
| Max dimension | **2048px** (long edge) |
| Format | JPEG |
| Quality | 70–80% |
| Result | ~200 KB – 1.5 MB base64 |

A 2048×1536 photo at 80% JPEG quality is ~400 KB raw → ~550 KB base64. Well under the limit.

### Why?

A raw 4000×3000 phone photo is 3–5 MB → 4–7 MB as base64 JSON. That exceeds the 4 MB limit.
After resizing to 2048px / 80% quality, the same photo drops to ~400 KB. The server then
compresses further and uploads to Cloudinary — zero quality loss in the final stored image.

## Response

```json
{
  "success": true,
  "id": "fx6Owa9e9xsvbUucifvV",
  "maintRequestNumber": "MR-00000216",
  "workOrderNumber": "WO-4594238",
  "workOrderId": "VI2SXCVaRhamGRgwlM7g",
  "message": "Maintenance request created successfully"
}
```

## Example — Python (with image resize)

```python
import requests
import base64
from PIL import Image
from io import BytesIO

API_URL = "https://groundopscos.vercel.app/api/maint-requests"
TOKEN = "your-api-token-here"

def submit_maintenance_request(venue, requestor, date, title, description, priority, image_path=None):
    payload = {
        "venue": venue,
        "requestor": requestor,
        "date": date,
        "title": title,
        "description": description,
        "priority": priority,
    }

    if image_path:
        # Resize + compress before encoding
        img = Image.open(image_path).convert("RGB")
        img.thumbnail((2048, 2048))
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=80)
        payload["image"] = base64.b64encode(buf.getvalue()).decode()

    resp = requests.post(API_URL, json=payload, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
    })
    return resp.json()

# Usage
result = submit_maintenance_request(
    venue="Delilah (West Hollywood)",
    requestor="Dylan Wilde",
    date="04/16/2026",
    title="Broken AC",
    description="AC not working in main hall",
    priority="high",
    image_path="/path/to/photo.jpg",
)
print(result)
```

## Example — cURL

```bash
# Without image
curl -X POST https://groundopscos.vercel.app/api/maint-requests \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"venue":"Test","requestor":"John","date":"04/16/2026","title":"Test","description":"Testing","priority":"medium"}'

# With image (must be < 4MB base64)
curl -X POST https://groundopscos.vercel.app/api/maint-requests \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @request.json
```

## Example — JavaScript/Node.js

```javascript
const fs = require('fs');
const sharp = require('sharp');

async function submitRequest(imagePath) {
  let imageBase64 = null;

  if (imagePath) {
    const compressed = await sharp(imagePath)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    imageBase64 = compressed.toString('base64');
  }

  const resp = await fetch('https://groundopscos.vercel.app/api/maint-requests', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      venue: 'Test Location',
      requestor: 'John Doe',
      date: new Date().toLocaleDateString(),
      title: 'Test Request',
      description: 'Testing maintenance request',
      priority: 'medium',
      image: imageBase64,
    }),
  });

  return resp.json();
}
```

## Error Codes

| HTTP | Meaning | Fix |
|---|---|---|
| 200 | Success | — |
| 400 | Missing fields | Include all required fields |
| 401 | Invalid/missing token | Check `Authorization: Bearer <token>` header |
| 413 | Payload too large | Resize image to 2048px max, JPEG 80% quality |
| 500 | Server error | Check Cloudinary/Firestore connectivity |
