import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireDbUser } from '../lib/dbUser.js'
import { isAdminEmail } from '../middleware/requireAdmin.js'

const router = Router()

// Note: GET/POST /api/projects/:id/comments live on the projects router (closer to REST shape).
// This router handles the bare /api/comments/:id mutations.

// PUT /api/comments/:id — edit own comment
router.put('/:id', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const comment = await prisma.comments.findUnique({ where: { id: req.params.id } })
  if (!comment) return res.status(404).json({ error: 'Comment not found' })
  if (comment.user_id !== user.id) {
    return res.status(403).json({ error: 'You can only edit your own comments' })
  }

  const content = String((req.body as { content?: string }).content ?? '').trim()
  if (!content) return res.status(400).json({ error: 'content required' })

  const updated = await prisma.comments.update({
    where: { id: req.params.id },
    data: { content, updated_at: new Date() },
    include: {
      users: { select: { id: true, username: true, full_name: true, avatar_url: true } },
    },
  })
  res.json({ comment: updated })
})

// DELETE /api/comments/:id — soft-delete; owner or admin
router.delete('/:id', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const comment = await prisma.comments.findUnique({ where: { id: req.params.id } })
  if (!comment) return res.status(404).json({ error: 'Comment not found' })
  if (comment.user_id !== user.id && !isAdminEmail(req.user?.email)) {
    return res.status(403).json({ error: 'You can only delete your own comments' })
  }

  await prisma.comments.update({
    where: { id: req.params.id },
    data: { is_deleted: true, updated_at: new Date() },
  })
  res.json({ ok: true })
})

// POST /api/comments/:id/like
router.post('/:id/like', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  try {
    await prisma.comment_likes.create({
      data: { user_id: user.id, comment_id: req.params.id! },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.json({ ok: true, alreadyLiked: true })
    }
    throw err
  }
  res.json({ ok: true })
})

// DELETE /api/comments/:id/like
router.delete('/:id/like', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  await prisma.comment_likes.deleteMany({
    where: { user_id: user.id, comment_id: req.params.id },
  })
  res.json({ ok: true })
})

export default router
