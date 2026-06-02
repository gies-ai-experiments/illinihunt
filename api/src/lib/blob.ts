import { BlobServiceClient, BlockBlobClient } from '@azure/storage-blob'
import { randomUUID } from 'crypto'

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
const containerName = process.env.AZURE_STORAGE_CONTAINER ?? 'project-images'
const publicBaseUrl = process.env.AZURE_STORAGE_PUBLIC_BASE_URL ?? ''

if (!connectionString) {
  console.warn('AZURE_STORAGE_CONNECTION_STRING is not set — upload routes will fail')
}

const serviceClient = connectionString
  ? BlobServiceClient.fromConnectionString(connectionString)
  : null

const containerClient = serviceClient?.getContainerClient(containerName)

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export class UploadValidationError extends Error {}

export async function uploadProjectImage(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
): Promise<{ url: string; path: string }> {
  if (!containerClient) {
    throw new Error('Blob storage is not configured')
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new UploadValidationError(`Unsupported image type: ${mimeType}`)
  }
  if (buffer.length > MAX_BYTES) {
    throw new UploadValidationError(`Image exceeds 5 MB limit (${buffer.length} bytes)`)
  }

  const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp'
  const path = `projects/${randomUUID()}.${ext}`
  const blockBlob: BlockBlobClient = containerClient.getBlockBlobClient(path)

  await blockBlob.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: mimeType, blobCacheControl: 'public, max-age=31536000, immutable' },
  })

  return {
    url: publicBaseUrl ? `${publicBaseUrl}/${path}` : blockBlob.url,
    path,
  }
}
