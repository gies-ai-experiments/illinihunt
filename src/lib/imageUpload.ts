import { apiFetch, ApiError } from './api'

export interface ImageUploadResult {
  url: string | null
  error: string | null
}

const UPLOAD_TIMEOUT_MS = 30000
const COMPRESSION_TIMEOUT_MS = 5000

// Server-side limit (Express /api/upload/image enforces 5 MB).
const BUCKET_MAX_BYTES = 5 * 1024 * 1024
export const RAW_INPUT_MAX_BYTES = 25 * 1024 * 1024

/**
 * Upload an image to Azure Blob Storage via the Express API.
 * The userId arg is kept for source compatibility but ignored — the API
 * derives the user from the Entra Bearer token.
 */
export async function uploadProjectImage(file: File, _userId: string): Promise<ImageUploadResult> {
  try {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return { url: null, error: 'Please upload a valid image file (JPG, PNG, WebP, or GIF)' }
    }
    if (file.size > BUCKET_MAX_BYTES) {
      return {
        url: null,
        error:
          'Image is too large to upload after compression. Please use a smaller image (under 5 MB after compression).',
      }
    }

    const form = new FormData()
    form.append('image', file, file.name)

    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
    try {
      const res = await apiFetch('/upload/image', {
        method: 'POST',
        body: form,
        signal: controller.signal,
      })
      const json = (await res.json()) as { url: string; path: string }
      return { url: json.url, error: null }
    } finally {
      clearTimeout(timeoutHandle)
    }
  } catch (err) {
    if (import.meta.env.DEV) console.error('Image upload error:', err)
    if (err instanceof ApiError) return { url: null, error: `Upload failed: ${err.message}` }
    if ((err as { name?: string }).name === 'AbortError') {
      return { url: null, error: 'Upload timed out. Please check your connection and try again.' }
    }
    return {
      url: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred while uploading the image',
    }
  }
}

/**
 * Compress image file before upload (optional optimization)
 */
export function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<File> {
  return new Promise((resolve) => {
    // Add timeout to prevent hanging (ample time for canvas operations)
    const timeout = setTimeout(() => {
      resolve(file) // Return original file as fallback
    }, COMPRESSION_TIMEOUT_MS)

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    if (!ctx) {
      clearTimeout(timeout)
      resolve(file)
      return
    }
    
    const img = new Image()
    let objectUrl: string | null = null

    const cleanup = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }

    img.onload = () => {
      try {
        // Calculate new dimensions — only downscale, never upscale
        const ratio = Math.min(1, maxWidth / img.width, maxWidth / img.height)
        canvas.width = img.width * ratio
        canvas.height = img.height * ratio

        // Draw onto canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        // Re-encode as WebP. WebP supports transparency (preserves logos)
        // and applies the quality argument to all sources, unlike PNG where
        // the quality arg is ignored and the output stays uncompressed.
        // GIFs are passed through unchanged so animation isn't lost.
        if (file.type === 'image/gif') {
          clearTimeout(timeout)
          cleanup()
          resolve(file)
          return
        }

        const outputType = 'image/webp'
        const outputName = file.name.replace(/\.[^.]+$/, '') + '.webp'

        canvas.toBlob(
          (blob) => {
            clearTimeout(timeout)
            cleanup()
            if (blob && blob.size < file.size) {
              resolve(new File([blob], outputName, {
                type: outputType,
                lastModified: Date.now()
              }))
            } else {
              // WebP encode unavailable or made the file larger — keep original
              resolve(file)
            }
          },
          outputType,
          quality
        )
      } catch (err) {
        clearTimeout(timeout)
        cleanup()
        resolve(file)
      }
    }

    img.onerror = () => {
      clearTimeout(timeout)
      cleanup()
      resolve(file)
    }

    try {
      objectUrl = URL.createObjectURL(file)
      img.src = objectUrl
    } catch (err) {
      clearTimeout(timeout)
      cleanup()
      resolve(file)
    }
  })
}