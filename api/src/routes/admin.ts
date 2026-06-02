import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = Router()
router.use(requireAuth, requireAdmin)

// GET /api/admin/projects — list all projects across statuses
router.get('/projects', async (req, res) => {
  const status = req.query.status as string | undefined
  const search = req.query.search as string | undefined
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const where: Prisma.projectsWhereInput = {}
  if (status) where.status = status
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { tagline: { contains: search, mode: 'insensitive' } },
    ]
  }

  const projects = await prisma.projects.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: limit,
    skip: offset,
    include: {
      users: { select: { id: true, username: true, full_name: true, avatar_url: true, email: true } },
      categories: { select: { id: true, name: true, color: true, icon: true } },
    },
  })
  res.json({ data: projects })
})

// GET /api/admin/users — list all users
router.get('/users', async (req, res) => {
  const search = req.query.search as string | undefined
  const where: Prisma.usersWhereInput = {}
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { username: { contains: search, mode: 'insensitive' } },
      { full_name: { contains: search, mode: 'insensitive' } },
    ]
  }
  const users = await prisma.users.findMany({
    where,
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      email: true,
      username: true,
      full_name: true,
      avatar_url: true,
      created_at: true,
      suspended_at: true,
      _count: { select: { projects: true, comments: true } },
    },
  })
  // Flatten _count into project_count / comment_count for client compatibility.
  const data = users.map((u) => ({
    id: u.id,
    email: u.email,
    username: u.username,
    full_name: u.full_name,
    avatar_url: u.avatar_url,
    created_at: u.created_at,
    suspended_at: u.suspended_at,
    project_count: u._count.projects,
    comment_count: u._count.comments,
  }))
  res.json({ data })
})

// GET /api/admin/comments — list comments across all projects
router.get('/comments', async (req, res) => {
  const search = req.query.search as string | undefined
  const where: Prisma.commentsWhereInput = {}
  if (search) where.content = { contains: search, mode: 'insensitive' }

  const comments = await prisma.comments.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: 200,
    include: {
      users: { select: { id: true, username: true, full_name: true, email: true } },
      projects: { select: { id: true, name: true } },
    },
  })
  const data = comments.map((c) => ({
    id: c.id,
    content: c.content,
    is_deleted: c.is_deleted,
    created_at: c.created_at,
    project_id: c.project_id,
    users: c.users,
    project: c.projects,
  }))
  res.json({ data })
})

// GET /api/admin/reports — list content reports
router.get('/reports', async (req, res) => {
  const filterStatus = req.query.status as string | undefined
  const where: Prisma.reportsWhereInput = {}
  if (filterStatus) where.status = filterStatus

  const reports = await prisma.reports.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: {
      users_reports_reporter_idTousers: {
        select: { id: true, username: true, full_name: true, email: true },
      },
      users_reports_resolved_byTousers: {
        select: { id: true, username: true, full_name: true },
      },
    },
  })

  // Resolve the target (project or comment) per row. Done in JS to keep the
  // query simple; admin volume is low so this is fine.
  const data = await Promise.all(
    reports.map(async (r) => {
      let target: unknown = null
      if (r.target_type === 'project') {
        target = await prisma.projects.findUnique({
          where: { id: r.target_id },
          select: { id: true, name: true, tagline: true, status: true },
        })
      } else if (r.target_type === 'comment') {
        const c = await prisma.comments.findUnique({
          where: { id: r.target_id },
          select: { id: true, content: true, project_id: true, is_deleted: true },
        })
        target = c
      }
      return {
        id: r.id,
        target_type: r.target_type,
        target_id: r.target_id,
        reason: r.reason,
        details: r.details,
        status: r.status,
        created_at: r.created_at,
        resolved_at: r.resolved_at,
        reporter: r.users_reports_reporter_idTousers,
        resolved_by_user: r.users_reports_resolved_byTousers,
        target,
      }
    }),
  )
  res.json({ data })
})

// GET /api/admin/stats — platform totals
router.get('/stats', async (_req, res) => {
  const [
    totalProjects,
    activeProjects,
    featuredProjects,
    archivedProjects,
    totalUsers,
    totalUpvotes,
    totalComments,
  ] = await Promise.all([
    prisma.projects.count(),
    prisma.projects.count({ where: { status: 'active' } }),
    prisma.projects.count({ where: { status: 'featured' } }),
    prisma.projects.count({ where: { status: 'archived' } }),
    prisma.users.count(),
    prisma.votes.count(),
    prisma.comments.count({ where: { is_deleted: false } }),
  ])
  res.json({
    data: {
      totalProjects,
      activeProjects,
      featuredProjects,
      archivedProjects,
      totalUsers,
      totalUpvotes,
      totalComments,
    },
  })
})

// PUT /api/admin/projects/:id/status — feature / archive / activate
router.put('/projects/:id/status', async (req, res) => {
  const status = String((req.body as { status?: string }).status ?? '')
  const allowed = new Set(['active', 'featured', 'archived', 'draft'])
  if (!allowed.has(status)) return res.status(400).json({ error: 'Invalid status' })

  const updated = await prisma.projects.update({
    where: { id: req.params.id! },
    data: { status },
    include: {
      users: { select: { id: true, username: true, full_name: true, avatar_url: true, email: true } },
      categories: { select: { id: true, name: true, color: true, icon: true } },
    },
  })
  res.json({ data: updated })
})

// DELETE /api/admin/projects/:id
router.delete('/projects/:id', async (req, res) => {
  await prisma.projects.delete({ where: { id: req.params.id! } })
  res.json({ ok: true })
})

// DELETE /api/admin/comments/:id — soft delete
router.delete('/comments/:id', async (req, res) => {
  await prisma.comments.update({
    where: { id: req.params.id! },
    data: { is_deleted: true, updated_at: new Date() },
  })
  res.json({ data: { id: req.params.id } })
})

// PUT /api/admin/users/:id/suspend
router.put('/users/:id/suspend', async (req, res) => {
  await prisma.users.update({
    where: { id: req.params.id! },
    data: { suspended_at: new Date() },
  })
  res.json({ data: { id: req.params.id } })
})

// PUT /api/admin/users/:id/unsuspend
router.put('/users/:id/unsuspend', async (req, res) => {
  await prisma.users.update({
    where: { id: req.params.id! },
    data: { suspended_at: null },
  })
  res.json({ data: { id: req.params.id } })
})

// PUT /api/admin/reports/:id/resolve
router.put('/reports/:id/resolve', async (req, res) => {
  const resolution = String((req.body as { resolution?: string }).resolution ?? '')
  const allowed = new Set(['resolved', 'dismissed'])
  if (!allowed.has(resolution)) return res.status(400).json({ error: 'Invalid resolution' })

  await prisma.reports.update({
    where: { id: req.params.id! },
    data: { status: resolution, resolved_at: new Date() },
  })
  res.json({ data: { id: req.params.id } })
})

export default router
