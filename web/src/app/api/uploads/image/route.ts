import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { uploadImageToR2 } from '@/lib/r2';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { allowRequest } from '@/lib/rateLimit';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication is required' }, { status: 401 });
    if (!allowRequest(`upload:${user.id}`, 10, 60 * 60_000)) return NextResponse.json({ error: 'Upload limit reached' }, { status: 429, headers: { 'Retry-After': '3600' } });
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
    const image = sharp(inputBuffer, { limitInputPixels: 2560 * 2560 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width < 400 || metadata.height < 400 || metadata.width > 2560 || metadata.height > 2560) {
      return NextResponse.json({ error: 'Image dimensions must be between 400px and 2560px.' }, { status: 400 });
    }
    const processedBuffer = await image
      .resize(500, 500, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: 85 })
      .toBuffer();

    const safeId = crypto.randomUUID();
    const cleanFilename = `${safeId}.webp`;

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
