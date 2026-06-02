import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

// GET /api/votes/batch?projectIds=id1,id2,...
// The polling endpoint that replaces Supabase realtime.
// Returns { [projectId]: { count: number, hasVoted: boolean } }
// hasVoted reflects the authenticated user; anonymous => false.
router.get('/batch', async (req, res) => {
  const idsParam = (req.query.projectIds as string) || ''
  const ids = idsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200) // cap to avoid abuse

  if (ids.length === 0) {
    return res.json({})
  }

  // Counts come from the denormalized column (updated by trigger).
  const projects = await prisma.projects.findMany({
    where: { id: { in: ids } },
    select: { id: true, upvotes_count: true },
  })

  const userVotes = req.user
    ? await prisma.votes.findMany({
        where: { project_id: { in: ids }, user_id: await resolveUserId(req.user.oid) },
        select: { project_id: true },
      })
    : []
  const votedSet = new Set(userVotes.map((v) => v.project_id))

  const result: Record<string, { count: number; hasVoted: boolean }> = {}
  for (const p of projects) {
    result[p.id] = { count: p.upvotes_count ?? 0, hasVoted: votedSet.has(p.id) }
  }
  res.json(result)
})

async function resolveUserId(entraOid: string): Promise<string> {
  const user = await prisma.users.findFirst({
    where: { entra_oid: entraOid },
    select: { id: true },
  })
  return user?.id ?? '00000000-0000-0000-0000-000000000000'
}

export default router
