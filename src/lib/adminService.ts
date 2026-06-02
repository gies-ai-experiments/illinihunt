// AdminService — talks to the Express API (POST-Azure migration).
// All endpoints are guarded by requireAdmin middleware on the server side.

import { apiResult } from '@/lib/api'

export type ProjectStatus = 'active' | 'featured' | 'archived' | 'draft'

export interface AdminProject {
  id: string
  name: string
  tagline: string
  description: string
  image_url: string | null
  website_url: string | null
  github_url: string | null
  upvotes_count: number
  comments_count: number
  status: string
  created_at: string
  updated_at: string
  users: {
    id: string
    username: string | null
    full_name: string | null
    avatar_url: string | null
    email: string
  } | null
  categories: {
    id: string
    name: string
    color: string
    icon: string | null
  } | null
}

export interface PlatformStats {
  totalProjects: number
  activeProjects: number
  featuredProjects: number
  archivedProjects: number
  totalUsers: number
  totalUpvotes: number
  totalComments: number
}

export class AdminService {
  static async getAllProjects(options?: {
    status?: ProjectStatus
    search?: string
    limit?: number
    offset?: number
  }): Promise<{ data: AdminProject[] | null; error: { message: string } | null }> {
    const qs = new URLSearchParams()
    if (options?.status) qs.set('status', options.status)
    if (options?.search) qs.set('search', options.search)
    if (options?.limit) qs.set('limit', String(options.limit))
    if (options?.offset) qs.set('offset', String(options.offset))
    const result = await apiResult<{ data: AdminProject[] }>(`/admin/projects?${qs.toString()}`)
    return { data: result.data?.data ?? null, error: result.error }
  }

  static async updateProjectStatus(
    projectId: string,
    status: ProjectStatus,
  ): Promise<{ data: AdminProject | null; error: { message: string } | null }> {
    const result = await apiResult<{ data: AdminProject }>(`/admin/projects/${projectId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })
    return { data: result.data?.data ?? null, error: result.error }
  }

  static async getStats(): Promise<{
    data: PlatformStats | null
    error: { message: string } | null
  }> {
    const result = await apiResult<{ data: PlatformStats }>('/admin/stats')
    return { data: result.data?.data ?? null, error: result.error }
  }

  static async deleteProject(projectId: string): Promise<{ error: { message: string } | null }> {
    const result = await apiResult<{ ok: true }>(`/admin/projects/${projectId}`, {
      method: 'DELETE',
    })
    return { error: result.error }
  }
}
