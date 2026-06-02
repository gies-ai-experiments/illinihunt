import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireDbUser } from '../lib/dbUser.js'
import { isAdminEmail } from '../middleware/requireAdmin.js'

const router = Router()

// GET /api/projects — list with optional filters
router.get('/', async (req, res) => {
  const category = req.query.category as string | undefined
  const search = req.query.search as string | undefined
  const sort = (req.query.sort as string) || 'recent'
  const limit = Math.min(Number(req.query.limit) || 24, 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const where: Prisma.projectsWhereInput = { status: 'active' }
  if (category) where.category_id = category
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { tagline: { contains: search, mode: 'insensitive' } },
    ]
  }

  const orderBy: Prisma.projectsOrderByWithRelationInput =
    sort === 'popular'
      ? { upvotes_count: 'desc' }
      : { created_at: 'desc' }

  const [projects, total] = await Promise.all([
    prisma.projects.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      include: {
        categories: { select: { id: true, name: true, icon: true, color: true } },
        users: { select: { id: true, username: true, full_name: true, avatar_url: true } },
      },
    }),
    prisma.projects.count({ where }),
  ])

  res.json({ projects, total, limit, offset })
})

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  const project = await prisma.projects.findUnique({
    where: { id: req.params.id },
    include: {
      categories: true,
      users: { select: { id: true, username: true, full_name: true, avatar_url: true, bio: true } },
      project_members: {
        include: {
          users_project_members_user_idTousers: {
            select: { id: true, username: true, full_name: true, avatar_url: true },
          },
        },
      },
    },
  })
  if (!project) return res.status(404).json({ error: 'Project not found' })
  res.json({ project })
})

// POST /api/projects — create
router.post('/', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const body = req.body as Record<string, unknown>
  // Whitelist editable fields; never accept user_id, vote counts, status from client.
  const data: Prisma.projectsCreateInput = {
    name: String(body.name ?? '').trim(),
    tagline: String(body.tagline ?? '').trim(),
    description: String(body.description ?? '').trim(),
    image_url: body.image_url ? String(body.image_url) : null,
    website_url: body.website_url ? String(body.website_url) : null,
    github_url: body.github_url ? String(body.github_url) : null,
    users: { connect: { id: user.id } },
    ...(body.category_id ? { categories: { connect: { id: String(body.category_id) } } } : {}),
  }

  if (!data.name || !data.tagline || !data.description) {
    return res.status(400).json({ error: 'name, tagline, and description are required' })
  }

  const project = await prisma.projects.create({
    data,
    include: {
      categories: { select: { id: true, name: true, icon: true, color: true } },
      users: { select: { id: true, username: true, full_name: true, avatar_url: true } },
    },
  })
  res.status(201).json({ project })
})

// PUT /api/projects/:id — owner or admin only
router.put('/:id', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const project = await prisma.projects.findUnique({ where: { id: req.params.id } })
  if (!project) return res.status(404).json({ error: 'Project not found' })
  if (project.user_id !== user.id && !isAdminEmail(req.user?.email)) {
    return res.status(403).json({ error: 'You can only edit your own projects' })
  }

  const body = req.body as Record<string, unknown>
  const data: Prisma.projectsUpdateInput = {}
  if (typeof body.name === 'string') data.name = body.name.trim()
  if (typeof body.tagline === 'string') data.tagline = body.tagline.trim()
  if (typeof body.description === 'string') data.description = body.description.trim()
  if (body.image_url !== undefined) data.image_url = body.image_url ? String(body.image_url) : null
  if (body.website_url !== undefined) data.website_url = body.website_url ? String(body.website_url) : null
  if (body.github_url !== undefined) data.github_url = body.github_url ? String(body.github_url) : null
  if (body.category_id) data.categories = { connect: { id: String(body.category_id) } }

  const updated = await prisma.projects.update({ where: { id: req.params.id }, data })
  res.json({ project: updated })
})

// DELETE /api/projects/:id — owner or admin
router.delete('/:id', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const project = await prisma.projects.findUnique({ where: { id: req.params.id } })
  if (!project) return res.status(404).json({ error: 'Project not found' })
  if (project.user_id !== user.id && !isAdminEmail(req.user?.email)) {
    return res.status(403).json({ error: 'You can only delete your own projects' })
  }

  await prisma.projects.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

// POST /api/projects/:id/vote — upvote (idempotent: returns 200 if already voted)
router.post('/:id/vote', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  try {
    await prisma.votes.create({
      data: { project_id: req.params.id!, user_id: user.id },
    })
  } catch (err) {
    // Unique violation = already voted — treat as success for idempotency.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.json({ ok: true, alreadyVoted: true })
    }
    throw err
  }
  res.json({ ok: true })
})

// DELETE /api/projects/:id/vote — remove vote
router.delete('/:id/vote', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  await prisma.votes.deleteMany({
    where: { project_id: req.params.id, user_id: user.id },
  })
  res.json({ ok: true })
})

// GET /api/projects/:id/members
router.get('/:id/members', async (req, res) => {
  const members = await prisma.project_members.findMany({
    where: { project_id: req.params.id },
    include: {
      users_project_members_user_idTousers: {
        select: { id: true, username: true, full_name: true, avatar_url: true },
      },
    },
  })
  res.json({ members })
})

// Project comments — mounted here so URL matches design doc: /api/projects/:id/comments
router.get('/:id/comments', async (req, res) => {
  const comments = await prisma.comments.findMany({
    where: { project_id: req.params.id, is_deleted: false },
    orderBy: { created_at: 'asc' },
    include: {
      users: { select: { id: true, username: true, full_name: true, avatar_url: true } },
    },
  })
  res.json({ comments })
})

router.post('/:id/comments', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const body = req.body as Record<string, unknown>
  const content = String(body.content ?? '').trim()
  if (!content) return res.status(400).json({ error: 'content required' })

  let thread_depth = 0
  const parentId = body.parent_id ? String(body.parent_id) : null
  if (parentId) {
    const parent = await prisma.comments.findUnique({
      where: { id: parentId },
      select: { thread_depth: true },
    })
    if (parent) thread_depth = Math.min((parent.thread_depth ?? 0) + 1, 3)
  }

  const comment = await prisma.comments.create({
    data: {
      content,
      project_id: req.params.id!,
      parent_id: parentId,
      user_id: user.id,
      thread_depth,
    },
    include: {
      users: { select: { id: true, username: true, full_name: true, avatar_url: true } },
    },
  })
  res.status(201).json({ comment })
})

// GET /api/projects/:id/invitations — pending invites for this project (owner/admin only)
router.get('/:id/invitations', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const project = await prisma.projects.findUnique({ where: { id: req.params.id! } })
  if (!project) return res.status(404).json({ error: 'Project not found' })
  if (project.user_id !== user.id && !isAdminEmail(req.user?.email)) {
    return res.status(403).json({ error: 'Only the project owner can view invitations' })
  }

  const invitations = await prisma.project_invitations.findMany({
    where: { project_id: req.params.id!, status: 'pending' },
    orderBy: { created_at: 'desc' },
    include: {
      users_project_invitations_invitee_idTousers: {
        select: { id: true, username: true, full_name: true, avatar_url: true, email: true },
      },
    },
  })
  res.json({ invitations })
})

// POST /api/projects/:id/invite — invite a user (owner only)
router.post('/:id/invite', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const inviteeId = String((req.body as { userId?: string }).userId ?? '')
  if (!inviteeId) return res.status(400).json({ error: 'userId required' })

  const project = await prisma.projects.findUnique({ where: { id: req.params.id! } })
  if (!project) return res.status(404).json({ error: 'Project not found' })
  if (project.user_id !== user.id) {
    return res.status(403).json({ error: 'Only the project owner can invite teammates' })
  }
  if (inviteeId === user.id) {
    return res.status(400).json({ error: 'Cannot invite yourself' })
  }

  // Already a member?
  const existingMember = await prisma.project_members.findUnique({
    where: { project_id_user_id: { project_id: req.params.id!, user_id: inviteeId } },
  })
  if (existingMember) return res.status(409).json({ error: 'User is already a member' })

  try {
    const invitation = await prisma.project_invitations.create({
      data: {
        project_id: req.params.id!,
        inviter_id: user.id,
        invitee_id: inviteeId,
        status: 'pending',
      },
    })
    res.status(201).json({ invitation })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'Invitation already exists' })
    }
    throw err
  }
})

// POST /api/projects/:id/invite/accept — body { invitationId }
router.post('/:id/invite/accept', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const invitationId = String((req.body as { invitationId?: string }).invitationId ?? '')
  if (!invitationId) return res.status(400).json({ error: 'invitationId required' })

  const invitation = await prisma.project_invitations.findUnique({ where: { id: invitationId } })
  if (!invitation) return res.status(404).json({ error: 'Invitation not found' })
  if (invitation.invitee_id !== user.id) {
    return res.status(403).json({ error: 'This invitation is not for you' })
  }
  if (invitation.status !== 'pending') {
    return res.status(409).json({ error: `Invitation already ${invitation.status}` })
  }

  // Transactionally: flip status + insert member row
  await prisma.$transaction([
    prisma.project_invitations.update({
      where: { id: invitationId },
      data: { status: 'accepted', responded_at: new Date() },
    }),
    prisma.project_members.create({
      data: {
        project_id: invitation.project_id,
        user_id: user.id,
        role: 'member',
        invited_by: invitation.inviter_id,
      },
    }),
  ])
  res.json({ ok: true })
})

// POST /api/projects/:id/invite/decline — body { invitationId }
router.post('/:id/invite/decline', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const invitationId = String((req.body as { invitationId?: string }).invitationId ?? '')
  if (!invitationId) return res.status(400).json({ error: 'invitationId required' })

  const invitation = await prisma.project_invitations.findUnique({ where: { id: invitationId } })
  if (!invitation) return res.status(404).json({ error: 'Invitation not found' })
  if (invitation.invitee_id !== user.id) {
    return res.status(403).json({ error: 'This invitation is not for you' })
  }

  await prisma.project_invitations.update({
    where: { id: invitationId },
    data: { status: 'declined', responded_at: new Date() },
  })
  res.json({ ok: true })
})

// DELETE /api/projects/:id/invite/:invitationId — owner revokes pending invite
router.delete('/:id/invite/:invitationId', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const project = await prisma.projects.findUnique({ where: { id: req.params.id! } })
  if (!project) return res.status(404).json({ error: 'Project not found' })
  if (project.user_id !== user.id) {
    return res.status(403).json({ error: 'Only the project owner can revoke invitations' })
  }

  await prisma.project_invitations.deleteMany({
    where: { id: req.params.invitationId!, project_id: req.params.id! },
  })
  res.json({ ok: true })
})

// DELETE /api/projects/:id/members/:userId — owner removes a member
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const project = await prisma.projects.findUnique({ where: { id: req.params.id! } })
  if (!project) return res.status(404).json({ error: 'Project not found' })
  if (project.user_id !== user.id) {
    return res.status(403).json({ error: 'Only the project owner can remove members' })
  }
  if (req.params.userId === project.user_id) {
    return res.status(400).json({ error: 'Cannot remove the project owner' })
  }

  await prisma.project_members.deleteMany({
    where: { project_id: req.params.id!, user_id: req.params.userId! },
  })
  res.json({ ok: true })
})

export default router
