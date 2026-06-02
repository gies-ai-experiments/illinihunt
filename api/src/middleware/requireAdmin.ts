import type { Request, Response, NextFunction } from 'express'

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
)

export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false
  return adminEmails.has(email.toLowerCase())
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' })
  if (!isAdminEmail(req.user.email)) {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}
