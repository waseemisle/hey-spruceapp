// Direct-to-Cloudinary unsigned upload (same cloud_name + upload_preset as web).

const CLOUD = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'duo4kzgx4';
const PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'WebAppUpload';

export async function uploadToCloudinary(fileUri: string, filename = `upload_${Date.now()}`): Promise<string> {
  const form = new FormData();
  // RN FormData accepts { uri, name, type } — differs from browser File
  form.append('file', { uri: fileUri, name: filename, type: 'image/jpeg' } as any);
  form.append('upload_preset', PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cloudinary ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.secure_url as string;
}
