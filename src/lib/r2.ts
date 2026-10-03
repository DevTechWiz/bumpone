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
  const bucketName = process.env.R2_BUCKET_NAME || 'bumpone-assets';
  const publicBaseUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://assets.bumpone.lol';
  const key = `profiles/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

  // 1. Primary: Native Cloudflare R2 bucket binding via OpenNext
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const cf = await getCloudflareContext({ async: true });
    const r2Bucket = (cf?.env as any)?.bumpone_assets;
    if (r2Bucket && typeof r2Bucket.put === 'function') {
      await r2Bucket.put(key, buffer, {
        httpMetadata: {
          contentType,
          cacheControl: 'public, max-age=31536000, immutable',
        },
      });
      return `${publicBaseUrl.replace(/\/$/, '')}/${key}`;
    }
  } catch (cfErr) {
    // OpenNext context not available (e.g. running in standard Node.js or local dev)
  }

  // 2. Secondary: AWS S3 Client compatibility if R2 API keys are provided
  const r2 = getR2Client();
  if (r2) {
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

  // 3. Fallback: Base64 data URI if no external object storage is bound
  const base64 = buffer.toString('base64');
  return `data:${contentType};base64,${base64}`;
}
