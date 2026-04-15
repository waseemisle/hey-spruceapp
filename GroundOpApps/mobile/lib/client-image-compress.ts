// Mirror of web client-image-compress.ts — targets <3.5 MB to match the server-side pipeline.
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

const TARGET_BYTES = 3.5 * 1024 * 1024;

export async function compressImage(uri: string): Promise<string> {
  let out = uri;
  let quality = 0.85;
  let width = 1600;
  for (let i = 0; i < 5; i++) {
    const result = await ImageManipulator.manipulateAsync(
      out,
      [{ resize: { width } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
    );
    out = result.uri;
    try {
      const info: any = await (FileSystem as any).getInfoAsync(out, { size: true });
      if (info.exists && info.size && info.size < TARGET_BYTES) return out;
    } catch { return out; }
    quality = Math.max(0.3, quality - 0.15);
    width = Math.max(800, width - 200);
  }
  return out;
}

export async function fileToBase64(uri: string): Promise<string> {
  return await (FileSystem as any).readAsStringAsync(uri, { encoding: 'base64' });
}
