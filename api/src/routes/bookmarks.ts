import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireDbUser } from '../lib/dbUser.js'

const router = Router()

// GET /api/bookmarks — current user's bookmarks with project details
router.get('/', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const bookmarks = await prisma.bookmarks.findMany({
    where: { user_id: user.id },
    orderBy: { created_at: 'desc' },
    include: {
      projects: {
        include: {
          categories: { select: { id: true, name: true, icon: true, color: true } },
          users: { select: { id: true, username: true, full_name: true, avatar_url: true } },
        },
      },
    },
  })
  res.json({ bookmarks })
})

// POST /api/bookmarks { projectId }
router.post('/', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const projectId = String((req.body as { projectId?: string }).projectId ?? '')
  if (!projectId) return res.status(400).json({ error: 'projectId required' })

  try {
    const bookmark = await prisma.bookmarks.create({
      data: { user_id: user.id, project_id: projectId },
    })
    res.status(201).json({ bookmark })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.json({ ok: true, alreadyBookmarked: true })
    }
    throw err
  }
})

// DELETE /api/bookmarks/:projectId
router.delete('/:projectId', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  await prisma.bookmarks.deleteMany({
    where: { user_id: user.id, project_id: req.params.projectId },
  })
  res.json({ ok: true })
})

export default router
