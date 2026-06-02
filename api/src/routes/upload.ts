import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { uploadProjectImage, UploadValidationError } from '../lib/blob.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// POST /api/upload/image — multipart with 'image' field
router.post('/image', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: image)' })
    const { url, path } = await uploadProjectImage(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
    )
    res.json({ url, path })
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return res.status(400).json({ error: err.message })
    }
    next(err)
  }
})

export default router
