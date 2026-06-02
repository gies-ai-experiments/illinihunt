// Collections service — temporary stub during Azure migration.
// The Express API endpoints (POST/PUT/DELETE /api/collections, etc.) are
// stubbed as 501 TODO; this client side returns sensible empty/error shapes
// so dependent pages compile and don't crash.

import type { Database } from '@/types/database'
import { apiResult, type ServiceResult } from '@/lib/api'

type CollectionRow = Database['public']['Tables']['collections']['Row']
type CollectionInsert = Database['public']['Tables']['collections']['Insert']
type CollectionUpdate = Database['public']['Tables']['collections']['Update']

const NOT_IMPL = { message: 'Collections: not implemented yet', code: '501' as const }

export class CollectionService {
  static async createCollection(
    _collection: Omit<CollectionInsert, 'user_id'>,
  ): Promise<ServiceResult<CollectionRow>> {
    return { data: null, error: NOT_IMPL }
  }

  static async getUserCollections(_userId?: string): Promise<ServiceResult<CollectionRow[]>> {
    return { data: [], error: null }
  }

  static async getPublicCollections(
    _limit?: number,
    _offset?: number,
  ): Promise<ServiceResult<CollectionRow[]>> {
    const result = await apiResult<{ collections: CollectionRow[] }>('/collections')
    return { data: result.data?.collections ?? [], error: result.error }
  }

  static async getCollection(
    _id: string,
    _includeProjects?: boolean,
  ): Promise<ServiceResult<CollectionRow>> {
    return { data: null, error: NOT_IMPL }
  }

  static async updateCollection(
    _id: string,
    _updates: CollectionUpdate,
  ): Promise<ServiceResult<CollectionRow>> {
    return { data: null, error: NOT_IMPL }
  }

  static async deleteCollection(_id: string): Promise<ServiceResult<{ ok: true }>> {
    return { data: null, error: NOT_IMPL }
  }

  static async addProjectToCollection(
    _collectionId: string,
    _projectId: string,
  ): Promise<ServiceResult<{ ok: true }>> {
    return { data: null, error: NOT_IMPL }
  }

  static async removeProjectFromCollection(
    _collectionId: string,
    _projectId: string,
  ): Promise<ServiceResult<{ ok: true }>> {
    return { data: null, error: NOT_IMPL }
  }

  static async getCollectionProjects(_collectionId: string): Promise<ServiceResult<unknown[]>> {
    return { data: [], error: null }
  }

  static async getCollectionsWithProject(_projectId: string): Promise<ServiceResult<unknown[]>> {
    return { data: [], error: null }
  }
}
