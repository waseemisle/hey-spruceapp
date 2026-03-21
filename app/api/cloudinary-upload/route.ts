import { NextRequest, NextResponse } from 'next/server';

/** MIME can be empty on some mobile browsers; extension still indicates an image for Cloudinary. */
function isImageUpload(file: File): boolean {
  const t = file.type || '';
  if (t.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|tif|tiff|heic|heif|avif)$/i.test(file.name);
}

export async function POST(request: NextRequest) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    return NextResponse.json({ error: 'Cloudinary configuration missing' }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const uploadData = new FormData();
  uploadData.append('file', file);
  uploadData.append('upload_preset', uploadPreset);

  const resourceEndpoint = isImageUpload(file) ? 'image' : 'raw';

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceEndpoint}/upload`,
    { method: 'POST', body: uploadData }
  );

  if (!response.ok) {
    let message = 'Upload failed';
    try {
      const err = await response.json();
      message = err.error?.message || message;
    } catch {
      /* non-JSON error body */
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const data = await response.json();
  return NextResponse.json({ url: data.secure_url });
}
