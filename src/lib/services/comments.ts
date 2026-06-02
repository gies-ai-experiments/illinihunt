import { apiResult, type ServiceResult } from '@/lib/api'

interface Comment {
  id: string
  content: string
  user_id: string
  project_id: string
  parent_id: string | null
  thread_depth: number | null
  likes_count: number | null
  is_deleted: boolean | null
  created_at: string | null
  updated_at: string | null
  users: { id: string; username: string | null; full_name: string | null; avatar_url: string | null } | null
}

export class CommentsService {
  static async getProjectComments(projectId: string): Promise<ServiceResult<Comment[]>> {
    const result = await apiResult<{ comments: Comment[] }>(`/projects/${projectId}/comments`)
    return { data: result.data?.comments ?? null, error: result.error }
  }

  static async createComment(data: {
    content: string
    project_id: string
    parent_id?: string | null
  }): Promise<ServiceResult<Comment>> {
    const result = await apiResult<{ comment: Comment }>(`/projects/${data.project_id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content: data.content, parent_id: data.parent_id ?? null }),
    })
    return { data: result.data?.comment ?? null, error: result.error }
  }

  static async updateComment(commentId: string, content: string): Promise<ServiceResult<Comment>> {
    const result = await apiResult<{ comment: Comment }>(`/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    })
    return { data: result.data?.comment ?? null, error: result.error }
  }

  static async deleteComment(commentId: string): Promise<ServiceResult<{ ok: true }>> {
    return apiResult<{ ok: true }>(`/comments/${commentId}`, { method: 'DELETE' })
  }

  static async likeComment(commentId: string): Promise<ServiceResult<{ ok: true }>> {
    return apiResult<{ ok: true }>(`/comments/${commentId}/like`, { method: 'POST' })
  }

  static async unlikeComment(commentId: string): Promise<ServiceResult<{ ok: true }>> {
    return apiResult<{ ok: true }>(`/comments/${commentId}/like`, { method: 'DELETE' })
  }

  static async hasUserLikedComment(_commentId: string): Promise<boolean> {
    // No dedicated endpoint yet; consumers should track likes via the parent
    // comment's likes_count plus optimistic UI updates.
    return false
  }
}
