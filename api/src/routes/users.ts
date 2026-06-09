import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireDbUser } from '../lib/dbUser.js'
import { isAdminEmail } from '../middleware/requireAdmin.js'

const router = Router()

// users.id is a Postgres UUID column. A non-UUID :id (e.g. an unmatched
// /api/users/me falling through to /:id) makes Prisma throw P2023, so reject
// early with 404 instead of pushing a malformed value into the query.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/users/search?q=... — used by the invitation flow
router.get('/search', requireAuth, async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (q.length < 2) return res.json({ users: [] })

  const users = await prisma.users.findMany({
    where: {
      AND: [
        { suspended_at: null },
        {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
            { full_name: { contains: q, mode: 'insensitive' } },
          ],
        },
      ],
    },
    select: { id: true, email: true, username: true, full_name: true, avatar_url: true },
    take: 10,
    orderBy: [{ username: 'asc' }, { email: 'asc' }],
  })
  res.json({ users })
})

// GET /api/users/me/is-admin — replaces the old is_admin() RPC
router.get('/me/is-admin', requireAuth, async (req, res) => {
  res.json({ isAdmin: isAdminEmail(req.user?.email) })
})

// GET /api/users/me/interactions?projectIds=id1,id2,...
// One round-trip: which of these projects has the current user voted on / bookmarked.
router.get('/me/interactions', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const ids = String(req.query.projectIds ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 500)
  if (ids.length === 0) return res.json({ voted: [], bookmarked: [] })

  const [votes, bookmarks] = await Promise.all([
    prisma.votes.findMany({
      where: { user_id: user.id, project_id: { in: ids } },
      select: { project_id: true },
    }),
    prisma.bookmarks.findMany({
      where: { user_id: user.id, project_id: { in: ids } },
      select: { project_id: true },
    }),
  ])
  res.json({
    voted: votes.map((v) => v.project_id),
    bookmarked: bookmarks.map((b) => b.project_id),
  })
})

// GET /api/users/me/invitations — pending invites where current user is invitee
router.get('/me/invitations', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const invitations = await prisma.project_invitations.findMany({
    where: { invitee_id: user.id, status: 'pending' },
    orderBy: { created_at: 'desc' },
    include: {
      projects: {
        select: { id: true, name: true, tagline: true, image_url: true },
      },
      users_project_invitations_inviter_idTousers: {
        select: { id: true, username: true, full_name: true, avatar_url: true, email: true },
      },
    },
  })
  // Match the legacy shape (users = inviter)
  const data = invitations.map((i) => ({
    id: i.id,
    project_id: i.project_id,
    inviter_id: i.inviter_id,
    invitee_id: i.invitee_id,
    status: i.status,
    created_at: i.created_at,
    projects: i.projects,
    users: i.users_project_invitations_inviter_idTousers,
  }))
  res.json({ invitations: data })
})

// PUT /api/users/me — update own profile
router.put('/me', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const body = req.body as Record<string, unknown>
  const data: Prisma.usersUpdateInput = {}
  const allowedYears = new Set(['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Staff', 'Faculty'])

  if (typeof body.username === 'string') data.username = body.username.trim()
  if (typeof body.full_name === 'string') data.full_name = body.full_name.trim()
  if (typeof body.avatar_url === 'string') data.avatar_url = body.avatar_url
  if (typeof body.bio === 'string') data.bio = body.bio
  if (typeof body.github_url === 'string') data.github_url = body.github_url
  if (typeof body.linkedin_url === 'string') data.linkedin_url = body.linkedin_url
  if (typeof body.website_url === 'string') data.website_url = body.website_url
  if (typeof body.department === 'string') data.department = body.department
  if (typeof body.year_of_study === 'string') {
    if (!allowedYears.has(body.year_of_study)) {
      return res.status(400).json({ error: 'Invalid year_of_study' })
    }
    data.year_of_study = body.year_of_study
  }
  data.updated_at = new Date()

  try {
    const updated = await prisma.users.update({ where: { id: user.id }, data })
    res.json({ user: updated })
  } catch (err) {
    // Unique constraint violation (username taken)
    if ((err as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'Username already taken' })
    }
    throw err
  }
})

// GET /api/users/:id/projects — owned + member-on projects
router.get('/:id/projects', async (req, res) => {
  const userId = req.params.id!
  if (!UUID_RE.test(userId)) return res.status(404).json({ error: 'User not found' })

  const [owned, memberships] = await Promise.all([
    prisma.projects.findMany({
      where: { user_id: userId, status: 'active' },
      orderBy: { created_at: 'desc' },
      include: {
        categories: { select: { id: true, name: true, color: true, icon: true } },
      },
    }),
    prisma.project_members.findMany({
      where: { user_id: userId, NOT: { role: 'owner' } },
      include: {
        projects: {
          include: {
            categories: { select: { id: true, name: true, color: true, icon: true } },
          },
        },
      },
    }),
  ])

  // Member-of projects, only those still active
  const memberProjects = memberships
    .map((m) => m.projects)
    .filter((p) => p.status === 'active')

  // De-dup (in case someone is both owner and member somehow)
  const seen = new Set(owned.map((p) => p.id))
  const merged = [...owned, ...memberProjects.filter((p) => !seen.has(p.id))]

  res.json({ projects: merged })
})

// GET /api/users/:id — public profile (placed last because /search and /me would match)
router.get('/:id', async (req, res) => {
  if (!UUID_RE.test(req.params.id!)) return res.status(404).json({ error: 'User not found' })
  const user = await prisma.users.findUnique({
    where: { id: req.params.id! },
    select: {
      id: true,
      username: true,
      full_name: true,
      avatar_url: true,
      bio: true,
      github_url: true,
      linkedin_url: true,
      website_url: true,
      year_of_study: true,
      department: true,
      is_verified: true,
      created_at: true,
      email: true,
    },
  })
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user })
})

export default router
