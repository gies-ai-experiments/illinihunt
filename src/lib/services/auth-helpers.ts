// Legacy auth helpers — kept for source compatibility.
// Auth enforcement now lives in the Express API (JWKS validation).
// Services no longer need to fetch a Supabase user before calling the API.

export function isTableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === 'PGRST202' || error.code === '406' || (error.message?.includes('406') ?? false)
}

// Deprecated. Throws — anything still calling this needs to be updated to call
// the API directly (which enforces auth via Bearer token).
export async function requireAuth(_action: string): Promise<never> {
  throw new Error(
    'requireAuth() is no longer used — services now call the Express API which enforces auth.',
  )
}
