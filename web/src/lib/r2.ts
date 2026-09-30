import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

function getR2Client(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey || accessKeyId === 'your_r2_access_key_id') {
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export async function uploadImageToR2(
  buffer: Buffer,
  filename: string,
  contentType: string = 'image/webp'
): Promise<string> {
  const r2 = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME || 'bumped-assets';
  const publicBaseUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://assets.bumpone.lol';

  const key = `profiles/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

  if (!r2) {
    // Dev fallback: convert buffer to base64 data URI if R2 is not configured
    const base64 = buffer.toString('base64');
    return `data:${contentType};base64,${base64}`;
  }

  await r2.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return `${publicBaseUrl.replace(/\/$/, '')}/${key}`;
}
