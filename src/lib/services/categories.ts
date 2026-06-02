import type { Database } from '@/types/database'
import { apiResult, type ServiceResult } from '@/lib/api'

type Category = Database['public']['Tables']['categories']['Row']

export class CategoriesService {
  static async getCategories(): Promise<ServiceResult<Category[]>> {
    const result = await apiResult<{ categories: Category[] }>('/categories')
    return { data: result.data?.categories ?? null, error: result.error }
  }

  static async getCategory(id: string): Promise<ServiceResult<Category>> {
    // No dedicated single-category endpoint yet — derive from the list (rarely changes, cached).
    const list = await CategoriesService.getCategories()
    if (list.error) return { data: null, error: list.error }
    const found = list.data?.find((c) => c.id === id) ?? null
    return found
      ? { data: found, error: null }
      : { data: null, error: { message: 'Category not found', code: '404' } }
  }
}
