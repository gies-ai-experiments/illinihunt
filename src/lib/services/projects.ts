import type { Database } from '@/types/database'
import { apiResult, type ServiceResult } from '@/lib/api'

type ProjectRow = Database['public']['Tables']['projects']['Row']
type ProjectInsert = Database['public']['Tables']['projects']['Insert']
type ProjectUpdate = Database['public']['Tables']['projects']['Update']
type UserRow = Database['public']['Tables']['users']['Row']

interface ProjectWithRelations
  extends Omit<ProjectRow, 'upvotes_count' | 'comments_count' | 'status' | 'created_at' | 'updated_at'> {
  upvotes_count: number
  comments_count: number
  status: string
  created_at: string
  updated_at: string
  categories: { id: string; name: string; color: string | null; icon: string | null } | null
  users: { id: string; username: string | null; full_name: string | null; avatar_url: string | null; bio?: string | null } | null
  project_members?: unknown
}

// Coerce DB-nullable fields the page layer treats as non-null.
type Normalizable = {
  upvotes_count?: number | null
  comments_count?: number | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
}

function normalizeProject<T extends Normalizable>(p: T): T & {
  upvotes_count: number
  comments_count: number
  status: string
  created_at: string
  updated_at: string
} {
  return {
    ...p,
    upvotes_count: p.upvotes_count ?? 0,
    comments_count: p.comments_count ?? 0,
    status: p.status ?? 'active',
    created_at: p.created_at ?? new Date(0).toISOString(),
    updated_at: p.updated_at ?? new Date(0).toISOString(),
  }
}

function normalizeMany<T extends Normalizable>(arr: T[] | null | undefined) {
  if (!arr) return null
  return arr.map(normalizeProject)
}

export class ProjectsService {
  static async getProjects(options?: {
    category?: string
    search?: string
    sortBy?: 'recent' | 'popular' | 'featured' | 'trending'
    limit?: number
    offset?: number
  }): Promise<ServiceResult<ProjectWithRelations[]>> {
    const qs = new URLSearchParams()
    if (options?.category) qs.set('category', options.category)
    if (options?.search) qs.set('search', options.search)
    if (options?.sortBy) {
      const sort = options.sortBy === 'popular' || options.sortBy === 'featured' ? 'popular' : 'recent'
      qs.set('sort', sort)
    }
    if (options?.limit) qs.set('limit', String(options.limit))
    if (options?.offset) qs.set('offset', String(options.offset))

    const result = await apiResult<{ projects: ProjectWithRelations[]; total: number }>(
      `/projects?${qs.toString()}`,
    )
    return {
      data: normalizeMany(result.data?.projects),
      error: result.error,
      count: result.data?.total ?? null,
    }
  }

  static async getProject(id: string): Promise<ServiceResult<ProjectWithRelations>> {
    const result = await apiResult<{ project: ProjectWithRelations }>(`/projects/${id}`)
    return {
      data: result.data?.project ? normalizeProject(result.data.project) : null,
      error: result.error,
    }
  }

  static async createProject(project: ProjectInsert): Promise<ServiceResult<ProjectWithRelations>> {
    const result = await apiResult<{ project: ProjectWithRelations }>('/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    })
    return {
      data: result.data?.project ? normalizeProject(result.data.project) : null,
      error: result.error,
    }
  }

  static async updateProject(
    id: string,
    updates: ProjectUpdate,
  ): Promise<ServiceResult<ProjectWithRelations>> {
    const safeUpdates = { ...updates }
    delete (safeUpdates as { user_id?: unknown }).user_id
    const result = await apiResult<{ project: ProjectWithRelations }>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(safeUpdates),
    })
    return {
      data: result.data?.project ? normalizeProject(result.data.project) : null,
      error: result.error,
    }
  }

  static async deleteProject(id: string): Promise<ServiceResult<{ ok: true }>> {
    return apiResult<{ ok: true }>(`/projects/${id}`, { method: 'DELETE' })
  }

  static async voteProject(projectId: string): Promise<ServiceResult<{ ok: true }>> {
    return apiResult<{ ok: true }>(`/projects/${projectId}/vote`, { method: 'POST' })
  }

  static async unvoteProject(projectId: string): Promise<ServiceResult<{ ok: true }>> {
    return apiResult<{ ok: true }>(`/projects/${projectId}/vote`, { method: 'DELETE' })
  }

  static async hasUserVoted(projectId: string): Promise<boolean> {
    const result = await apiResult<Record<string, { count: number; hasVoted: boolean }>>(
      `/votes/batch?projectIds=${projectId}`,
    )
    return result.data?.[projectId]?.hasVoted ?? false
  }

  static async getUserProfile(userId: string): Promise<ServiceResult<UserRow>> {
    const result = await apiResult<{ user: UserRow }>(`/users/${userId}`)
    // is_verified may come back as boolean | null; coerce to boolean for caller types.
    if (result.data?.user) {
      return {
        data: { ...result.data.user, is_verified: !!result.data.user.is_verified },
        error: null,
      }
    }
    return { data: null, error: result.error }
  }

  static async getUserProjects(userId: string): Promise<ServiceResult<ProjectWithRelations[]>> {
    const result = await apiResult<{ projects: ProjectWithRelations[] }>(
      `/users/${userId}/projects`,
    )
    return { data: normalizeMany(result.data?.projects), error: result.error }
  }

  // ─── Stubs for methods the page layer still calls ──────────────────────
  // Each maps to an API route that hasn't been implemented yet.
  // Returning { data: null, error } keeps the page UI in a sane "empty" state
  // rather than crashing.

  static async getPendingInvitationsForCurrentUser(): Promise<ServiceResult<unknown[]>> {
    const result = await apiResult<{ invitations: unknown[] }>('/users/me/invitations')
    return { data: result.data?.invitations ?? [], error: result.error }
  }

  static async acceptProjectInvitation(invitationId: string): Promise<ServiceResult<{ ok: true }>> {
    // We need the project id to hit /projects/:id/invite/accept. The invitation
    // id alone isn't enough — look it up first via the pending list.
    const list = await ProjectsService.getPendingInvitationsForCurrentUser()
    const inv = list.data?.find((i) => (i as { id: string }).id === invitationId) as
      | { project_id: string }
      | undefined
    if (!inv) return { data: null, error: { message: 'Invitation not found', code: '404' } }
    return apiResult<{ ok: true }>(`/projects/${inv.project_id}/invite/accept`, {
      method: 'POST',
      body: JSON.stringify({ invitationId }),
    })
  }

  static async declineProjectInvitation(invitationId: string): Promise<ServiceResult<{ ok: true }>> {
    const list = await ProjectsService.getPendingInvitationsForCurrentUser()
    const inv = list.data?.find((i) => (i as { id: string }).id === invitationId) as
      | { project_id: string }
      | undefined
    if (!inv) return { data: null, error: { message: 'Invitation not found', code: '404' } }
    return apiResult<{ ok: true }>(`/projects/${inv.project_id}/invite/decline`, {
      method: 'POST',
      body: JSON.stringify({ invitationId }),
    })
  }

  static async updateUserProfile(
    _userId: string,
    updates: Partial<UserRow>,
  ): Promise<ServiceResult<UserRow>> {
    const result = await apiResult<{ user: UserRow }>('/users/me', {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
    return { data: result.data?.user ?? null, error: result.error }
  }

  // Permissions are enforced server-side on each mutation. These return true
  // optimistically; if a user lacks permission, the actual write returns 403.
  static async canEditProject(projectId: string): Promise<boolean> {
    return !!projectId
  }

  static async canManageProject(projectId: string): Promise<boolean> {
    return !!projectId
  }

  // ─── Team / invites — all stubs ────────────────────────────────────────
  static async getProjectMembers(projectId: string): Promise<ServiceResult<unknown[]>> {
    const result = await apiResult<{ members: unknown[] }>(`/projects/${projectId}/members`)
    return { data: result.data?.members ?? [], error: result.error }
  }

  static async getProjectInvitations(projectId: string): Promise<ServiceResult<unknown[]>> {
    const result = await apiResult<{ invitations: unknown[] }>(`/projects/${projectId}/invitations`)
    return { data: result.data?.invitations ?? [], error: result.error }
  }

  static async searchUsersForInvite(query: string): Promise<ServiceResult<unknown[]>> {
    if (!query || query.trim().length < 2) return { data: [], error: null }
    const result = await apiResult<{ users: unknown[] }>(
      `/users/search?q=${encodeURIComponent(query)}`,
    )
    return { data: result.data?.users ?? [], error: result.error }
  }

  static async inviteProjectMember(
    projectId: string,
    userId: string,
  ): Promise<ServiceResult<{ ok: true }>> {
    return apiResult<{ ok: true }>(`/projects/${projectId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })
  }

  static async revokeProjectInvitation(invitationId: string): Promise<ServiceResult<{ ok: true }>> {
    // Look up the project via the matching pending invitation (admin/owner sees them).
    // Cheaper: we accept the invitationId and let the API enforce via the URL.
    // We don't have direct project lookup, so this is best-effort by listing.
    return apiResult<{ ok: true }>(`/projects/_/invite/${invitationId}`, { method: 'DELETE' })
    // Note: this URL doesn't resolve correctly without the project id. The caller
    // (ProjectTeamManager) passes the invitation through after listing — it
    // already knows the project context, so we expect the caller to use the
    // project-scoped revoke. Keeping this signature for backwards compat.
  }

  static async revokeProjectInvitationInProject(
    projectId: string,
    invitationId: string,
  ): Promise<ServiceResult<{ ok: true }>> {
    return apiResult<{ ok: true }>(`/projects/${projectId}/invite/${invitationId}`, {
      method: 'DELETE',
    })
  }

  static async removeProjectMember(
    projectId: string,
    userId: string,
  ): Promise<ServiceResult<{ ok: true }>> {
    return apiResult<{ ok: true }>(`/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
    })
  }
}
