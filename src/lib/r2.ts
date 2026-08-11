import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let r2Client: S3Client | null = null;

export function getR2BucketName() {
  const name = process.env.R2_BUCKET_NAME?.trim();
  if (!name) throw new Error('R2_BUCKET_NAME is not configured.');
  return name;
}

export function getR2PublicBaseUrl() {
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('NEXT_PUBLIC_R2_PUBLIC_URL is not configured.');
  return base;
}

/** Build a permanent public object URL for an R2 key. */
export function r2PublicUrl(fileKey: string | null | undefined): string | null {
  if (!fileKey || typeof fileKey !== 'string' || !fileKey.trim()) return null;
  const key = fileKey.trim().replace(/^\/+/, '');
  try {
    return `${getR2PublicBaseUrl()}/${key}`;
  } catch {
    const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '').replace(/\/+$/, '');
    if (!base) return null;
    return `${base}/${key}`;
  }
}

export function getR2Client(): S3Client {
  if (r2Client) return r2Client;

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.'
    );
  }

  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });

  return r2Client;
}

export async function createPresignedPutUrl(opts: {
  fileKey: string;
  contentType: string;
  expiresInSeconds?: number;
}) {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getR2BucketName(),
    Key: opts.fileKey,
    ContentType: opts.contentType || 'application/octet-stream'
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: opts.expiresInSeconds ?? 60 * 15
  });

  return {
    uploadUrl,
    fileKey: opts.fileKey,
    publicUrl: r2PublicUrl(opts.fileKey)!
  };
}

export async function putR2Object(opts: {
  fileKey: string;
  body: Buffer | Uint8Array | Blob;
  contentType: string;
}) {
  const client = getR2Client();
  let body: Buffer | Uint8Array = opts.body as Buffer | Uint8Array;
  if (typeof Blob !== 'undefined' && opts.body instanceof Blob) {
    body = new Uint8Array(await opts.body.arrayBuffer());
  }

  await client.send(
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: opts.fileKey,
      Body: body,
      ContentType: opts.contentType || 'application/octet-stream'
    })
  );

  return {
    fileKey: opts.fileKey,
    publicUrl: r2PublicUrl(opts.fileKey)!
  };
}

export async function deleteR2Object(fileKey: string) {
  if (!fileKey?.trim()) return;
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getR2BucketName(),
      Key: fileKey.trim()
    })
  );
}
