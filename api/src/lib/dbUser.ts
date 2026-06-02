// Helpers for resolving the authenticated Entra user to a public.users row.
// All mutation routes need this — Express handlers ultimately read/write the
// DB by public.users.id, not by Entra oid.

import type { Request, Response } from 'express'
import { prisma } from './prisma.js'

export async function resolveDbUser(req: Request) {
  if (!req.user) return null
  return prisma.users.findFirst({ where: { entra_oid: req.user.oid } })
}

// Returns the user row or sends a 4xx response and returns null.
// Callers should `return` immediately when null is returned.
export async function requireDbUser(req: Request, res: Response) {
  const user = await resolveDbUser(req)
  if (!user) {
    res.status(401).json({ error: 'User not synced. Call POST /api/auth/sync first.' })
    return null
  }
  if (user.suspended_at) {
    res.status(403).json({ error: 'Account suspended' })
    return null
  }
  return user
}
