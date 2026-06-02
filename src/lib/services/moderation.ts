// ModerationService — talks to the Express API (post-Azure migration).
// reportContent is available to any authenticated user; everything else is
// admin-guarded by requireAdmin middleware on the server.

import { apiResult, type ServiceResult } from '@/lib/api'

export type ReportReason = 'spam' | 'inappropriate' | 'broken_link' | 'other'
export type ReportStatus = 'pending' | 'resolved' | 'dismissed'

export interface Report {
  id: string
  target_type: 'project' | 'comment'
  target_id: string
  reason: ReportReason
  details: string | null
  status: ReportStatus
  created_at: string
  resolved_at: string | null
  reporter: {
    id: string
    username: string | null
    full_name: string | null
    email: string
  }
  resolved_by_user: {
    id: string
    username: string | null
    full_name: string | null
  } | null
  target: {
    id: string
    name?: string
    tagline?: string
    status?: string
    content?: string
    project_id?: string
    is_deleted?: boolean
  } | null
}

export interface AdminComment {
  id: string
  content: string
  is_deleted: boolean | null
  created_at: string
  project_id: string
  users: {
    id: string
    username: string | null
    full_name: string | null
    email: string
  }
  project: {
    id: string
    name: string
  }
}

export interface AdminUser {
  id: string
  email: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  created_at: string
  suspended_at: string | null
  project_count: number
  comment_count: number
}

export class ModerationService {
  /** Submit a content report (any authenticated user) */
  static async reportContent(
    targetType: 'project' | 'comment',
    targetId: string,
    reason: ReportReason,
    details?: string,
  ): Promise<ServiceResult<{ id: string }>> {
    return apiResult<{ id: string }>('/reports', {
      method: 'POST',
      body: JSON.stringify({ targetType, targetId, reason, details }),
    })
  }

  static async getReports(filterStatus?: ReportStatus): Promise<ServiceResult<Report[]>> {
    const qs = filterStatus ? `?status=${filterStatus}` : ''
    const result = await apiResult<{ data: Report[] }>(`/admin/reports${qs}`)
    return { data: result.data?.data ?? null, error: result.error }
  }

  static async resolveReport(
    reportId: string,
    resolution: 'resolved' | 'dismissed',
  ): Promise<ServiceResult<{ id: string }>> {
    const result = await apiResult<{ data: { id: string } }>(`/admin/reports/${reportId}/resolve`, {
      method: 'PUT',
      body: JSON.stringify({ resolution }),
    })
    return { data: result.data?.data ?? null, error: result.error }
  }

  static async getComments(searchQuery?: string): Promise<ServiceResult<AdminComment[]>> {
    const qs = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''
    const result = await apiResult<{ data: AdminComment[] }>(`/admin/comments${qs}`)
    return { data: result.data?.data ?? null, error: result.error }
  }

  static async deleteComment(commentId: string): Promise<ServiceResult<{ id: string }>> {
    const result = await apiResult<{ data: { id: string } }>(`/admin/comments/${commentId}`, {
      method: 'DELETE',
    })
    return { data: result.data?.data ?? null, error: result.error }
  }

  static async getUsers(searchQuery?: string): Promise<ServiceResult<AdminUser[]>> {
    const qs = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''
    const result = await apiResult<{ data: AdminUser[] }>(`/admin/users${qs}`)
    return { data: result.data?.data ?? null, error: result.error }
  }

  static async suspendUser(userId: string): Promise<ServiceResult<{ id: string }>> {
    const result = await apiResult<{ data: { id: string } }>(`/admin/users/${userId}/suspend`, {
      method: 'PUT',
    })
    return { data: result.data?.data ?? null, error: result.error }
  }

  static async unsuspendUser(userId: string): Promise<ServiceResult<{ id: string }>> {
    const result = await apiResult<{ data: { id: string } }>(`/admin/users/${userId}/unsuspend`, {
      method: 'PUT',
    })
    return { data: result.data?.data ?? null, error: result.error }
  }
}
