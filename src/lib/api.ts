// Thin fetch wrapper that attaches an Entra ID Bearer token to API requests.
// Replaces direct Supabase SDK calls throughout src/lib/services/*.

import type { IPublicClientApplication, AccountInfo } from '@azure/msal-browser'
import { apiScopes } from './msal-config'

const baseUrl = import.meta.env.VITE_API_URL ?? '/api'

// MSAL instance + active account are injected by AuthContext at startup.
// We avoid importing the React context here to keep this file usable from
// non-React code paths (e.g. the realtime polling hook).
let msal: IPublicClientApplication | null = null
let account: AccountInfo | null = null

export function configureApi(instance: IPublicClientApplication, activeAccount: AccountInfo | null) {
  msal = instance
  account = activeAccount
}

async function getAccessToken(): Promise<string | null> {
  if (!msal || !account) return null
  try {
    const result = await msal.acquireTokenSilent({ scopes: apiScopes, account })
    return result.accessToken
  } catch (err) {
    // Fallback to popup on silent failure (e.g. consent required, token expired beyond refresh).
    try {
      const result = await msal.acquireTokenPopup({ scopes: apiScopes, account })
      return result.accessToken
    } catch (popupErr) {
      console.error('[api] token acquisition failed', popupErr)
      return null
    }
  }
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message)
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const url = path.startsWith('http') ? path : `${baseUrl}${path}`
  const response = await fetch(url, { ...init, headers })

  if (!response.ok && response.status !== 304) {
    let body: unknown = null
    try {
      body = await response.clone().json()
    } catch {
      body = await response.clone().text().catch(() => null)
    }
    const message =
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error: unknown }).error)
        : `API ${response.status}`
    throw new ApiError(response.status, body, message)
  }

  return response
}

// Convenience: get JSON directly with type narrowing.
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init)
  return res.json() as Promise<T>
}

// Supabase-style {data, error} return shape — used by service layer to keep
// downstream consumers' destructuring patterns unchanged during the migration.
export interface ServiceResult<T> {
  data: T | null
  error: { message: string; code?: string } | null
  count?: number | null
}

export async function apiResult<T>(path: string, init: RequestInit = {}): Promise<ServiceResult<T>> {
  try {
    const res = await apiFetch(path, init)
    const data = (await res.json()) as T
    return { data, error: null }
  } catch (err) {
    if (err instanceof ApiError) {
      return { data: null, error: { message: err.message, code: String(err.status) } }
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { data: null, error: { message } }
  }
}
