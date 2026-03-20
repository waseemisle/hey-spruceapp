import { NextRequest, NextResponse } from 'next/server';

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

  const isImage = file.type.startsWith('image/');
  const resourceEndpoint = isImage ? 'image' : 'raw';

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceEndpoint}/upload`,
    { method: 'POST', body: uploadData }
  );

  if (!response.ok) {
    const err = await response.json();
    return NextResponse.json({ error: err.error?.message || 'Upload failed' }, { status: 500 });
  }

  const data = await response.json();
  return NextResponse.json({ url: data.secure_url });
}
