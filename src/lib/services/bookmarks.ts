import { apiResult, type ServiceResult } from '@/lib/api'

interface Bookmark {
  id: string
  user_id: string
  project_id: string
  created_at: string | null
  projects?: unknown
}

export class BookmarkService {
  static async addBookmark(projectId: string): Promise<ServiceResult<Bookmark>> {
    const result = await apiResult<{ bookmark: Bookmark }>('/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    })
    return { data: result.data?.bookmark ?? null, error: result.error }
  }

  static async removeBookmark(projectId: string): Promise<ServiceResult<{ ok: true }>> {
    return apiResult<{ ok: true }>(`/bookmarks/${projectId}`, { method: 'DELETE' })
  }

  static async isBookmarked(projectId: string): Promise<boolean> {
    // Fetch the user's bookmarks list and check membership.
    // For pages that need many of these checks, prefer getUserBookmarks once.
    const result = await apiResult<{ bookmarks: Bookmark[] }>('/bookmarks')
    if (result.error || !result.data) return false
    return result.data.bookmarks.some((b) => b.project_id === projectId)
  }

  static async getUserBookmarks(_userId?: string): Promise<ServiceResult<Bookmark[]>> {
    // The API only returns the authenticated user's bookmarks; ignore userId arg.
    const result = await apiResult<{ bookmarks: Bookmark[] }>('/bookmarks')
    return { data: result.data?.bookmarks ?? null, error: result.error }
  }

  static async getUserBookmarksCount(_userId?: string): Promise<ServiceResult<null>> {
    const result = await apiResult<{ bookmarks: Bookmark[] }>('/bookmarks')
    return {
      data: null,
      error: result.error,
      count: result.data?.bookmarks.length ?? null,
    }
  }
}
