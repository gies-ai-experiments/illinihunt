import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { apiResult } from '@/lib/api'
import { ILLINOIS_DOMAIN } from '@/lib/constants'

/**
 * Hook to check if current user has admin privileges.
 *
 * Admin status is determined by the API (single source of truth) via
 * GET /api/users/me/is-admin, which checks the ADMIN_EMAILS allowlist on
 * the server. Replaces the old Supabase is_admin() RPC.
 */
export function useAdminAuth() {
  const { user, loading: authLoading } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminLoading, setAdminLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function checkAdminStatus() {
      if (!user?.email) {
        if (!cancelled) {
          setIsAdmin(false)
          setAdminLoading(false)
        }
        return
      }

      const { data, error } = await apiResult<{ isAdmin: boolean }>('/users/me/is-admin')
      if (cancelled) return
      if (error) {
        if (import.meta.env.DEV) console.warn('Admin check failed:', error.message)
        setIsAdmin(false)
      } else {
        setIsAdmin(Boolean(data?.isAdmin))
      }
      setAdminLoading(false)
    }

    if (!authLoading) {
      setAdminLoading(true)
      checkAdminStatus()
    }
    return () => {
      cancelled = true
    }
  }, [user?.email, authLoading])

  // All @illinois.edu users can flag content (moderator-lite capability)
  const canFlag = user?.email?.toLowerCase().endsWith(`@${ILLINOIS_DOMAIN}`) ?? false

  return {
    isAdmin,
    canFlag,
    loading: authLoading || adminLoading,
    user,
  }
}
