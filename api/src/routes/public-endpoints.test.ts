import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Guard against re-leaking PII from unauthenticated endpoints.
 *
 * GET /api/users/:id shipped with `email: true` in its Prisma select. It takes
 * no auth, and user ids are handed out by GET /api/projects, so every
 * @illinois.edu address on the site was readable by an anonymous caller.
 *
 * The instance is fixed; this test covers the class. It reads every route
 * module, works out which handlers run without an auth guard, and fails if any
 * of them so much as mentions `email`. That is deliberately stricter than
 * "don't select it" — an unauthenticated handler has no business touching the
 * column, and a blunt rule is one nobody can accidentally reason their way past.
 */

const ROUTES_DIR = dirname(fileURLToPath(import.meta.url))

/** Strip comments so prose about email doesn't trip the check. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

interface Handler {
  file: string
  signature: string
  body: string
  routerLevelAuth: boolean
}

function handlersIn(file: string): Handler[] {
  const src = stripComments(readFileSync(join(ROUTES_DIR, file), 'utf8'))

  // `router.use(requireAuth, ...)` gates every handler in the module.
  const routerLevelAuth = /^router\.use\([^)]*require(Auth|Admin)/m.test(src)

  const starts: number[] = []
  const re = /^router\.(get|post|put|patch|delete)\(/gm
  for (let m = re.exec(src); m; m = re.exec(src)) starts.push(m.index)

  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1]! : src.length
    const block = src.slice(start, end)
    return {
      file,
      signature: block.slice(0, block.indexOf('\n')).trim(),
      body: block,
      routerLevelAuth,
    }
  })
}

const allHandlers = readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .flatMap(handlersIn)

const unauthenticated = allHandlers.filter(
  (h) => !h.routerLevelAuth && !/require(Auth|Admin)/.test(h.signature),
)

describe('unauthenticated route handlers', () => {
  it('finds handlers to check (guards against a vacuously passing sweep)', () => {
    expect(allHandlers.length).toBeGreaterThan(20)
    expect(unauthenticated.length).toBeGreaterThan(5)
  })

  it('classifies the known-public and known-guarded handlers correctly', () => {
    const publicSigs = unauthenticated.map((h) => `${h.file} ${h.signature}`)

    // Known public: the read endpoints documented in public/openapi.json.
    expect(publicSigs.some((s) => s.startsWith('categories.ts'))).toBe(true)
    expect(publicSigs.some((s) => s.includes("users.ts router.get('/:id'"))).toBe(true)

    // Known guarded: admin.ts is gated at the router level, not per-handler,
    // so a naive per-signature check would wrongly call it public.
    expect(publicSigs.some((s) => s.startsWith('admin.ts'))).toBe(false)
    // And per-handler `requireAuth` must register as guarded.
    expect(publicSigs.some((s) => s.startsWith('bookmarks.ts'))).toBe(false)
  })

  it.each(
    unauthenticated.map((h) => [`${h.file} — ${h.signature}`, h] as const),
  )('%s does not touch the email column', (_label, handler) => {
    const hits = handler.body.match(/\bemail\b/g) ?? []
    expect(
      hits,
      `Unauthenticated handler in ${handler.file} references \`email\`. ` +
        `Anonymous callers must never be able to read user email addresses; ` +
        `user ids are discoverable from GET /api/projects.`,
    ).toEqual([])
  })
})
