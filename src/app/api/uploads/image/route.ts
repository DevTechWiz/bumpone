import { NextRequest, NextResponse } from 'next/server';
import { uploadImageToR2 } from '@/lib/r2';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { allowRequest } from '@/lib/rateLimit';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function getSharpInstance() {
  try {
    const mod = await import('sharp');
    return (mod as any).default || mod;
  } catch {
    return null;
  }
}

function detectImageFormat(buffer: Buffer): { valid: boolean; format: 'webp' | 'jpeg' | 'png' | 'unknown' } {
  if (buffer.length < 12) return { valid: false, format: 'unknown' };
  // WebP: RIFF....WEBP
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { valid: true, format: 'webp' };
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, format: 'jpeg' };
  }
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { valid: true, format: 'png' };
  }
  return { valid: false, format: 'unknown' };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication is required' }, { status: 401 });
    if (!allowRequest(`upload:${user.id}`, 10, 60 * 60_000)) {
      return NextResponse.json({ error: 'Upload limit reached' }, { status: 429, headers: { 'Retry-After': '3600' } });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'Image exceeds 5MB size limit' }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file format. Only JPG, PNG, and WebP are allowed (GIFs and SVGs prohibited).' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Validate magic bytes to protect against disguised executables
    const detected = detectImageFormat(inputBuffer);
    if (!detected.valid) {
      return NextResponse.json({ error: 'Invalid image data. File header is corrupted or unrecognized.' }, { status: 400 });
    }

    let processedBuffer = inputBuffer;
    let format = detected.format;

    // Check if Sharp is available (e.g. running on Vercel or local Node.js)
    const sharp = await getSharpInstance();
    if (sharp) {
      try {
        const image = sharp(inputBuffer, { limitInputPixels: 2560 * 2560 });
        const metadata = await image.metadata();
        if (!metadata.width || !metadata.height || metadata.width < 64 || metadata.height < 64 || metadata.width > 4096 || metadata.height > 4096) {
          return NextResponse.json({ error: 'Image dimensions must be between 64px and 4096px.' }, { status: 400 });
        }
        processedBuffer = await image
          .resize(500, 500, {
            fit: 'cover',
            position: 'center',
          })
          .webp({ quality: 85 })
          .toBuffer();
        format = 'webp';
      } catch (sharpErr) {
        console.warn('Sharp processing failed, falling back to direct upload of validated buffer:', sharpErr);
      }
    }

    const safeId = crypto.randomUUID();
    const cleanFilename = `${safeId}.${format}`;
    const contentType = format === 'webp' ? 'image/webp' : format === 'png' ? 'image/png' : 'image/jpeg';

    const imageUrl = await uploadImageToR2(processedBuffer, cleanFilename, contentType);

    return NextResponse.json({
      url: imageUrl,
      width: 500,
      height: 500,
      aspectRatio: 1.0,
      format,
    });
  } catch (err: any) {
    console.error('Error processing image upload:', err);
    return NextResponse.json({ error: 'Failed to process and upload image' }, { status: 500 });
  }
}
