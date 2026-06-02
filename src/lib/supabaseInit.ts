import { supabase } from './supabase'

let isInitialized = false
let initPromise: Promise<void> | null = null

/**
 * Restores the Supabase session from localStorage before app render.
 *
 * Post-Azure-migration: Supabase is only present when the legacy VITE_SUPABASE_*
 * env vars are configured. If not, this is a no-op — Entra ID auth is handled
 * by AuthContext + MSAL, which has its own session restoration.
 */
export async function ensureSupabaseInitialized(): Promise<void> {
  if (isInitialized) return
  if (initPromise) return initPromise

  // If the Supabase env vars aren't configured, skip — the client is a
  // throwing-on-access stub and calling .auth.getSession() would explode.
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    isInitialized = true
    return
  }

  initPromise = (async () => {
    try {
      await supabase.auth.getSession()
      isInitialized = true
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to initialize Supabase session:', error)
      }
      isInitialized = true
    }
  })()

  return initPromise
}
