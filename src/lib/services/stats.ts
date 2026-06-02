import { apiResult, type ServiceResult } from '@/lib/api'

interface PlatformStats {
  projectsCount: number
  usersCount: number
  categoriesCount: number
}

export class StatsService {
  static async getPlatformStats(): Promise<ServiceResult<PlatformStats>> {
    // Compose from /api/stats + /api/categories. /api/stats already returns
    // counts for users/projects/votes/comments.
    const [stats, cats] = await Promise.all([
      apiResult<{ users: number; projects: number; votes: number; comments: number }>('/stats'),
      apiResult<{ categories: unknown[] }>('/categories'),
    ])
    if (stats.error) return { data: null, error: stats.error }
    return {
      data: {
        projectsCount: stats.data?.projects ?? 0,
        usersCount: stats.data?.users ?? 0,
        categoriesCount: cats.data?.categories.length ?? 0,
      },
      error: null,
    }
  }

  static async getTrendingProjects(limit = 10): Promise<ServiceResult<unknown[]>> {
    // Backend trending endpoint is still TODO. Fall back to popular for now.
    const result = await apiResult<{ projects: unknown[] }>(
      `/projects?sort=popular&limit=${limit}`,
    )
    return { data: result.data?.projects ?? null, error: result.error }
  }

  static async getFeaturedProjects(limit = 3): Promise<ServiceResult<unknown[]>> {
    const result = await apiResult<{ projects: unknown[] }>(
      `/projects?sort=popular&limit=${limit}`,
    )
    return { data: result.data?.projects ?? null, error: result.error }
  }

  static async getRecentActivity(limit = 5): Promise<ServiceResult<unknown[]>> {
    const result = await apiResult<{ projects: unknown[] }>(
      `/projects?sort=recent&limit=${limit}`,
    )
    return { data: result.data?.projects ?? null, error: result.error }
  }
}
