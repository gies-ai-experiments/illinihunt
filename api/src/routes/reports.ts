import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireDbUser } from '../lib/dbUser.js'

const router = Router()

const ALLOWED_REASONS = new Set(['spam', 'inappropriate', 'broken_link', 'other'])
const ALLOWED_TYPES = new Set(['project', 'comment'])

// POST /api/reports — any authenticated user can submit
router.post('/', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const body = req.body as Record<string, unknown>
  const targetType = String(body.targetType ?? body.target_type ?? '')
  const targetId = String(body.targetId ?? body.target_id ?? '')
  const reason = String(body.reason ?? '')
  const details = body.details ? String(body.details).slice(0, 1000) : null

  if (!ALLOWED_TYPES.has(targetType)) {
    return res.status(400).json({ error: 'Invalid targetType (project|comment)' })
  }
  if (!ALLOWED_REASONS.has(reason)) {
    return res.status(400).json({ error: 'Invalid reason' })
  }
  if (!targetId) return res.status(400).json({ error: 'targetId required' })

  const report = await prisma.reports.create({
    data: {
      target_type: targetType,
      target_id: targetId,
      reason,
      details,
      reporter_id: user.id,
      status: 'pending',
    },
    select: { id: true },
  })
  res.status(201).json({ id: report.id })
})

export default router
