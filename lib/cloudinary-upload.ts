import { compressFileForUpload } from '@/lib/client-image-compress';

function parseUploadResponse(response: Response, text: string): { error?: string; url?: string } {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as { error?: string; url?: string };
  } catch {
    return {};
  }
}

export async function uploadToCloudinary(file: File): Promise<string> {
  const prepared = await compressFileForUpload(file);
  const formData = new FormData();
  formData.append('file', prepared);

  const response = await fetch('/api/cloudinary-upload', {
    method: 'POST',
    body: formData,
  });

  const text = await response.text();
  const data = parseUploadResponse(response, text);

  if (!response.ok) {
    if (response.status === 413) {
      throw new Error(
        'Photo is too large to upload. Try one smaller image or fewer images at once.'
      );
    }
    throw new Error(data.error || 'Failed to upload image');
  }

  if (!data.url) {
    throw new Error('Failed to upload image');
  }

  return data.url;
}

export async function uploadMultipleToCloudinary(files: FileList): Promise<string[]> {
  return Promise.all(Array.from(files, (file) => uploadToCloudinary(file)));
}
