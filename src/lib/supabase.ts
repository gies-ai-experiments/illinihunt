// Legacy Supabase client — kept temporarily so the remaining un-migrated
// services (moderation, adminService, trending, imageUpload) still compile.
// Calls made through this client will fail at runtime; the right fix is to
// finish rewriting those services to use @/lib/api.
//
// We deliberately do NOT throw at module-init time anymore — that would crash
// the whole SPA on startup, which is what was happening on the Azure SWA
// deploy where these env vars are intentionally absent.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let realClient: SupabaseClient | null = null
if (supabaseUrl && supabaseAnonKey) {
  realClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      autoRefreshToken: true,
      storage: window.localStorage,
      storageKey: 'illinihunt-auth',
    },
    db: { schema: 'public' },
  })
} else if (import.meta.env.DEV) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — Supabase client is a no-op stub. Migrate remaining callers to @/lib/api.',
  )
}

// Proxy that throws lazily (on access) so the SPA loads, but any caller still
// using supabase.* gets a clear error instead of a silent no-op.
function makeStub(): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      throw new Error(
        `Supabase client is not configured (called supabase.${String(prop)}). ` +
          `This call must be migrated to the Express API via @/lib/api.`,
      )
    },
  })
}

export const supabase: SupabaseClient = realClient ?? makeStub()
