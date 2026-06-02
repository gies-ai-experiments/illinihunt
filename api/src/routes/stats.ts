import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

// GET /api/stats — site-wide stats (no auth)
router.get('/', async (_req, res) => {
  const [users, projects, votes, comments] = await Promise.all([
    prisma.users.count(),
    prisma.projects.count({ where: { status: 'active' } }),
    prisma.votes.count(),
    prisma.comments.count({ where: { is_deleted: false } }),
  ])
  res.json({ users, projects, votes, comments })
})

// GET /api/stats/trending?limit=10
// Score = upvotes * (1 / (hoursSinceCreation + 2)^1.5) — Reddit-style decay.
// We fetch a wider pool then re-rank in JS; the pool size matches the trending.ts client constants.
router.get('/trending', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50)
  const poolSize = Math.max(limit * 5, 30)

  const pool = await prisma.projects.findMany({
    where: { status: 'active' },
    orderBy: { created_at: 'desc' },
    take: poolSize,
    include: {
      categories: { select: { id: true, name: true, color: true, icon: true } },
      users: { select: { id: true, username: true, full_name: true, avatar_url: true } },
    },
  })

  const now = Date.now()
  const scored = pool.map((p) => {
    const ageMs = p.created_at ? now - p.created_at.getTime() : Number.MAX_SAFE_INTEGER
    const ageHours = ageMs / 3_600_000
    const score = (p.upvotes_count ?? 0) / Math.pow(ageHours + 2, 1.5)
    return { ...p, _trendingScore: score }
  })
  scored.sort((a, b) => b._trendingScore - a._trendingScore)

  res.json({ projects: scored.slice(0, limit) })
})

export default router
