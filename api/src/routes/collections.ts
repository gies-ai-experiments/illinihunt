import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// GET /api/collections — public collections
router.get('/', async (_req, res) => {
  const collections = await prisma.collections.findMany({
    where: { is_public: true },
    orderBy: { created_at: 'desc' },
    include: { users: { select: { id: true, username: true, full_name: true } } },
  })
  res.json({ collections })
})

// GET /api/collections/mine
router.get('/mine', requireAuth, async (_req, res) => {
  res.status(501).json({ error: 'TODO: implement (resolve user from entra_oid)' })
})

router.post('/', requireAuth, async (_req, res) => {
  res.status(501).json({ error: 'TODO: implement collection create' })
})
router.put('/:id', requireAuth, async (_req, res) => {
  res.status(501).json({ error: 'TODO: implement collection update (owner-only)' })
})
router.delete('/:id', requireAuth, async (_req, res) => {
  res.status(501).json({ error: 'TODO: implement collection delete (owner-only)' })
})
router.post('/:id/projects', requireAuth, async (_req, res) => {
  res.status(501).json({ error: 'TODO: implement add project to collection' })
})
router.delete('/:id/projects/:projectId', requireAuth, async (_req, res) => {
  res.status(501).json({ error: 'TODO: implement remove project from collection' })
})

export default router
