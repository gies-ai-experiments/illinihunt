import 'dotenv/config'
import * as Sentry from '@sentry/node'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  })
}

import express from 'express'
// Patches Express 4 so rejected promises in async route handlers are forwarded
// to errorHandler instead of becoming an unhandledRejection (which crashes the
// Node process under Node 22). Must be imported before routers handle requests.
import 'express-async-errors'
import cors from 'cors'
import rateLimit from 'express-rate-limit'

import { attachUser } from './middleware/auth.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'

import projectsRouter from './routes/projects.js'
import votesRouter from './routes/votes.js'
import commentsRouter from './routes/comments.js'
import collectionsRouter from './routes/collections.js'
import bookmarksRouter from './routes/bookmarks.js'
import categoriesRouter from './routes/categories.js'
import statsRouter from './routes/stats.js'
import usersRouter from './routes/users.js'
import adminRouter from './routes/admin.js'
import uploadRouter from './routes/upload.js'
import authRouter from './routes/auth.js'
import reportsRouter from './routes/reports.js'

const app = express()
const port = Number(process.env.PORT ?? 3000)

const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: false,
  }),
)
app.use(express.json({ limit: '1mb' }))
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }),
)
app.use(attachUser)

app.get('/healthz', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

app.use('/api/auth', authRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/votes', votesRouter)
app.use('/api/comments', commentsRouter)
app.use('/api/collections', collectionsRouter)
app.use('/api/bookmarks', bookmarksRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/stats', statsRouter)
app.use('/api/users', usersRouter)
app.use('/api/admin', adminRouter)
app.use('/api/upload', uploadRouter)
app.use('/api/reports', reportsRouter)

app.use(notFoundHandler)
app.use(errorHandler)

app.listen(port, () => {
  console.log(`[api] listening on :${port}`)
})
