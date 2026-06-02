import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// POST /api/auth/sync
// Called by the frontend on every successful MSAL login.
// Strategy (matches design doc "preserve" decision):
//   1. Find user by entra_oid -> update last-seen / profile
//   2. Else find user by email -> set entra_oid (links existing Supabase user)
//   3. Else create new user
// Returns the public.users record.
router.post('/sync', requireAuth, async (req, res) => {
  const { oid, email, name } = req.user!

  // Step 1: try entra_oid match
  let user = await prisma.users.findFirst({ where: { entra_oid: oid } })

  if (!user) {
    // Step 2: try email match (existing Supabase user — link them)
    const existingByEmail = await prisma.users.findUnique({ where: { email } })
    if (existingByEmail) {
      user = await prisma.users.update({
        where: { id: existingByEmail.id },
        data: { entra_oid: oid },
      })
    }
  }

  if (!user) {
    // Step 3: brand-new user
    // Note: we let the DB generate the UUID, but legacy rows used auth.users(id)
    // which is now a stale FK we already dropped. Fresh users get fresh UUIDs.
    user = await prisma.users.create({
      data: {
        entra_oid: oid,
        email,
        full_name: name ?? null,
      },
    })
  }

  res.json({ user })
})

export default router
