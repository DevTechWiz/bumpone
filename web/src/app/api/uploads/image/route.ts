import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { uploadImageToR2 } from '@/lib/r2';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(request: NextRequest) {
  try {
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

    // Process image with Sharp:
    // Resize to 500x500 (fit: cover), strip EXIF metadata, convert to WebP with 85% quality
    const processedBuffer = await sharp(inputBuffer)
      .resize(500, 500, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: 85 })
      .toBuffer();

    const originalName = file.name.replace(/\.[^/.]+$/, '');
    const cleanFilename = `${originalName}.webp`;

    const imageUrl = await uploadImageToR2(processedBuffer, cleanFilename, 'image/webp');

    return NextResponse.json({
      url: imageUrl,
      width: 500,
      height: 500,
      aspectRatio: 1.0,
      format: 'webp',
    });
  } catch (err: any) {
    console.error('Error processing image upload:', err);
    return NextResponse.json({ error: 'Failed to process and upload image' }, { status: 500 });
  }
}
