// Shared Cloudflare R2 (S3-compatible) client. Routes that need to upload or
// delete blobs import the helpers here rather than instantiating their own
// S3 client.
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY!;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY!;
export const R2_BUCKET = process.env.R2_BUCKET!;

export const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
});

export async function uploadToR2(buffer: Buffer, filename: string, mimetype: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: filename, Body: buffer, ContentType: mimetype }));
}

export async function deleteFromR2(filename: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: filename }));
}

/** Fetch an object's bytes from R2 (for bundling images into a .s4plan backup). */
export async function fetchFromR2(filename: string): Promise<Buffer> {
  const obj = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: filename }));
  const bytes = await obj.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export { GetObjectCommand };
