import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { z } from 'zod'
import {
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  EventType,
  InteractionRequiredAuthError,
} from '@azure/msal-browser'
import { MsalProvider } from '@azure/msal-react'

import { ILLINOIS_DOMAIN } from '@/lib/constants'
import type { Database } from '@/types/database'
import { msalConfig, apiScopes } from '@/lib/msal-config'
import { configureApi, apiJson, ApiError } from '@/lib/api'

type UserProfile = Database['public']['Tables']['users']['Row']

// Minimal user shape exposed to consumers. id = public.users.id (NOT Entra oid).
// Email is always lowercased.
export interface AuthUser {
  id: string
  email: string
  name?: string
}

// Lightweight "session" stand-in (MSAL manages real tokens internally).
export interface AuthSession {
  account: AccountInfo
}

interface AuthState {
  user: AuthUser | null
  profile: UserProfile | null
  session: AuthSession | null
  loading: boolean
  error: string | null
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  retryAuth: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

// Singleton MSAL instance — created once, shared everywhere.
const msalInstance = new PublicClientApplication(msalConfig)

// Initialize MSAL (required since msal-browser v3). Idempotent.
// We also process any pending redirect response here — this is what completes
// the login flow when the user returns from the Microsoft sign-in page.
const msalInitPromise = msalInstance
  .initialize()
  .then(() => {
    console.log('[msal] initialize complete, processing redirect...')
    return msalInstance.handleRedirectPromise()
  })
  .then((result) => {
    if (result?.account) {
      console.log('[msal] redirect produced account:', result.account.username)
      msalInstance.setActiveAccount(result.account)
    } else {
      const accounts = msalInstance.getAllAccounts()
      console.log('[msal] no redirect result; cached accounts:', accounts.length)
      if (accounts.length > 0 && !msalInstance.getActiveAccount()) {
        msalInstance.setActiveAccount(accounts[0]!)
      }
    }
    const active = msalInstance.getActiveAccount()
    console.log('[msal] active account after init:', active?.username ?? '(none)')
  })
  .catch((err) => {
    console.error('[msal] init/redirect handling failed', err)
  })

const PROFILE_CACHE_KEY = 'illinihunt-profile'
const PROFILE_CACHE_TTL = 5 * 60 * 1000

const CachedProfileSchema = z.object({
  profile: z.object({ id: z.string(), email: z.string() }).passthrough(),
  timestamp: z.number(),
})

function isValidIllinoisEmail(email: string | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${ILLINOIS_DOMAIN}`)
}

function getCachedProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null
  const cached = window.localStorage.getItem(PROFILE_CACHE_KEY)
  if (!cached) return null
  try {
    const parsed = CachedProfileSchema.safeParse(JSON.parse(cached))
    if (
      parsed.success &&
      Date.now() - parsed.data.timestamp < PROFILE_CACHE_TTL &&
      isValidIllinoisEmail(parsed.data.profile.email)
    ) {
      return parsed.data.profile as UserProfile
    }
  } catch (e) {
    if (import.meta.env.DEV) console.error('Failed to parse cached profile', e)
  }
  return null
}

function setCachedProfile(profile: UserProfile) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    PROFILE_CACHE_KEY,
    JSON.stringify({ profile, timestamp: Date.now() }),
  )
}

function clearCachedProfile() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(PROFILE_CACHE_KEY)
}

function accountToUser(account: AccountInfo, profileId?: string): AuthUser | null {
  const email = (account.username ?? '').toLowerCase()
  if (!email) return null
  return {
    id: profileId ?? account.localAccountId, // pre-sync we use Entra oid as a placeholder
    email,
    name: account.name ?? undefined,
  }
}

function AuthProviderInner({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
    Omit<AuthState, 'signInWithGoogle' | 'signInWithEmail' | 'signOut' | 'refreshProfile' | 'retryAuth'>
  >({
    user: null,
    profile: null,
    session: null,
    loading: true,
    error: null,
  })

  const mountedRef = useRef(true)

  // After MSAL surfaces an active account, sync with the Express API to get
  // (or create) the public.users row. Updates state with both user + profile.
  const syncProfile = useCallback(async (account: AccountInfo, force = false) => {
    const email = (account.username ?? '').toLowerCase()
    if (!isValidIllinoisEmail(email)) {
      // Tenant restriction in Entra should prevent this, but guard anyway.
      await msalInstance.logoutPopup({ account })
      if (mountedRef.current) {
        setState({
          user: null,
          profile: null,
          session: null,
          loading: false,
          error: `Only @${ILLINOIS_DOMAIN} email addresses are allowed`,
        })
      }
      return
    }

    try {
      const cached = !force ? getCachedProfile() : null
      if (cached && cached.email.toLowerCase() === email) {
        setState((prev) => ({
          ...prev,
          user: accountToUser(account, cached.id),
          profile: cached,
          session: { account },
          loading: false,
          error: null,
        }))
        // Continue to revalidate against the server (suspension check + drift).
      }

      console.log('[auth] calling POST /api/auth/sync for', email)
      const { user: serverProfile } = await apiJson<{ user: UserProfile }>('/auth/sync', {
        method: 'POST',
      })
      console.log('[auth] sync returned profile id=', serverProfile.id, 'email=', serverProfile.email)

      if (!mountedRef.current) return

      if (serverProfile.suspended_at) {
        clearCachedProfile()
        await msalInstance.logoutPopup({ account })
        setState({
          user: null,
          profile: null,
          session: null,
          loading: false,
          error: 'Your account has been suspended. Contact an administrator.',
        })
        return
      }

      setCachedProfile(serverProfile)
      setState({
        user: accountToUser(account, serverProfile.id),
        profile: serverProfile,
        session: { account },
        loading: false,
        error: null,
      })
    } catch (err) {
      if (!mountedRef.current) return
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Sync failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
    }
  }, [])

  // Restore on mount: if MSAL has a cached account, treat that as logged-in.
  useEffect(() => {
    mountedRef.current = true

    const restore = async () => {
      await msalInitPromise
      configureApi(msalInstance, msalInstance.getActiveAccount())
      const active = msalInstance.getActiveAccount()
      console.log('[auth] restore() active account:', active?.username ?? '(none)')
      if (active) {
        setState((prev) => ({ ...prev, session: { account: active }, loading: true }))
        await syncProfile(active)
      } else {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, loading: false, user: null, session: null }))
        }
      }
    }

    restore()

    // React to MSAL events (other tabs, silent renewals, login/logout).
    const callbackId = msalInstance.addEventCallback(async (event) => {
      if (
        event.eventType === EventType.LOGIN_SUCCESS &&
        event.payload &&
        'account' in event.payload &&
        event.payload.account
      ) {
        const account = (event.payload as AuthenticationResult).account
        msalInstance.setActiveAccount(account)
        configureApi(msalInstance, account)
        setState((prev) => ({ ...prev, session: { account }, loading: true }))
        await syncProfile(account)
      }
      if (event.eventType === EventType.LOGOUT_SUCCESS) {
        configureApi(msalInstance, null)
        clearCachedProfile()
        if (mountedRef.current) {
          setState({ user: null, profile: null, session: null, loading: false, error: null })
        }
      }
    })

    return () => {
      mountedRef.current = false
      if (callbackId) msalInstance.removeEventCallback(callbackId)
    }
  }, [syncProfile])

  const signInWithGoogle = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null }))
    try {
      await msalInitPromise
      // Redirect flow: the browser navigates to login.microsoftonline.com and
      // returns to this origin. The LOGIN_SUCCESS event + syncProfile fire on
      // the next page load via handleRedirectPromise → addEventCallback.
      await msalInstance.loginRedirect({ scopes: apiScopes, prompt: 'select_account' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
      throw err
    }
  }, [])

  // No email-OTP equivalent under Entra ID for our setup. Route to the same
  // tenant-restricted popup login; user picks their @illinois.edu account.
  const signInWithEmail = signInWithGoogle

  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }))
    try {
      clearCachedProfile()
      const active = msalInstance.getActiveAccount()
      if (active) await msalInstance.logoutRedirect({ account: active })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-out failed'
      setState((prev) => ({ ...prev, loading: false, error: message }))
      throw err
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    const account = msalInstance.getActiveAccount()
    if (account) await syncProfile(account, true)
  }, [syncProfile])

  const retryAuth = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const account = msalInstance.getActiveAccount()
      if (account) {
        try {
          await msalInstance.acquireTokenSilent({ scopes: apiScopes, account })
        } catch (err) {
          if (err instanceof InteractionRequiredAuthError) {
            // Fall back to a full sign-in redirect on consent-required / expired.
            await msalInstance.acquireTokenRedirect({ scopes: apiScopes, account })
            return
          }
          throw err
        }
        await syncProfile(account, true)
      } else {
        setState((prev) => ({ ...prev, loading: false }))
      }
    } catch (err) {
      if (!mountedRef.current) return
      const message = err instanceof Error ? err.message : 'Retry failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
    }
  }, [syncProfile])

  return (
    <AuthContext.Provider
      value={{ ...state, signInWithGoogle, signInWithEmail, signOut, refreshProfile, retryAuth }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <MsalProvider instance={msalInstance}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </MsalProvider>
  )
}

export { AuthContext }
