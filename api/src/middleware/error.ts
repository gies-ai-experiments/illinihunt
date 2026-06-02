import type { Request, Response, NextFunction } from 'express'
import * as Sentry from '@sentry/node'
import { UploadValidationError } from '../lib/blob.js'

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: 'Not found', path: req.path })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof UploadValidationError) {
    return res.status(400).json({ error: err.message })
  }

  Sentry.captureException(err, { extra: { path: req.path, method: req.method } })
  console.error('[error]', req.method, req.path, err)

  const status = (err as { status?: number }).status ?? 500
  const message =
    process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message
  res.status(status).json({ error: message })
}
