import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

// GET /api/categories — no auth required (public taxonomy)
router.get('/', async (_req, res) => {
  const categories = await prisma.categories.findMany({
    where: { is_active: true },
    orderBy: { name: 'asc' },
  })
  res.json({ categories })
})

export default router
