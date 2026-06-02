import type { Request, Response, NextFunction } from 'express'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'

const tenantId = process.env.AZURE_TENANT_ID
const audience = process.env.AZURE_AUDIENCE
const clientId = process.env.AZURE_CLIENT_ID

if (!tenantId || !clientId) {
  console.warn('AZURE_TENANT_ID / AZURE_CLIENT_ID not set — auth will reject all requests')
}

const jwks = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000,
  rateLimit: true,
})

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  if (!header.kid) {
    callback(new Error('Missing kid in JWT header'))
    return
  }
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      callback(err ?? new Error('Signing key not found'))
      return
    }
    callback(null, key.getPublicKey())
  })
}

export interface AuthenticatedUser {
  oid: string // Entra object ID (stable per user)
  email: string
  name?: string
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser
  }
}

function verify(token: string): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        audience: audience ?? clientId,
        issuer: [
          `https://login.microsoftonline.com/${tenantId}/v2.0`,
          `https://sts.windows.net/${tenantId}/`,
        ],
        algorithms: ['RS256'],
      },
      (err, decoded) => {
        if (err) return reject(err)
        if (!decoded || typeof decoded === 'string') return reject(new Error('Malformed token'))
        resolve(decoded as JwtPayload)
      },
    )
  })
}

// Validates and attaches req.user when an Authorization header is present.
// Does NOT reject anonymous requests — use requireAuth for that.
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return next()
  const token = header.slice('Bearer '.length).trim()
  try {
    const claims = await verify(token)
    const oid = (claims.oid ?? claims.sub) as string | undefined
    const email = (claims.email ?? claims.preferred_username ?? claims.upn) as string | undefined
    if (!oid || !email) return next()
    req.user = {
      oid,
      email: email.toLowerCase(),
      name: (claims.name as string | undefined) ?? undefined,
    }
    next()
  } catch (err) {
    // Invalid token — leave req.user undefined; downstream requireAuth will 401.
    next()
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' })
  next()
}
