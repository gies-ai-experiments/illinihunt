import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CollectionService } from '@/lib/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Eye, FolderOpen, Search, Users } from 'lucide-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { formatDistance } from 'date-fns'
import type { Database } from '@/types/database'

type PublicCollection = Database['public']['Views']['public_collections_with_stats']['Row']

export function DiscoverCollectionsPage() {
  const [collections, setCollections] = useState<PublicCollection[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadCollections = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await CollectionService.getPublicCollections(100, 0)
        if (fetchError) {
          throw fetchError
        }
        setCollections((data as unknown as PublicCollection[]) || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load public collections')
      } finally {
        setLoading(false)
      }
    }

    loadCollections()
  }, [])

  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) {
      return collections
    }
    const query = searchQuery.toLowerCase()
    return collections.filter((collection) => {
      const name = collection.name?.toLowerCase() || ''
      const description = collection.description?.toLowerCase() || ''
      const owner = collection.owner_name?.toLowerCase() || collection.owner_username?.toLowerCase() || ''
      return name.includes(query) || description.includes(query) || owner.includes(query)
    })
  }, [collections, searchQuery])

  return (
    <div className="min-h-screen bg-midnight text-foreground dark">
      <div className="container mx-auto px-4 pt-24 pb-8">
        <Button asChild variant="ghost" className="mb-6 pl-0">
          <Link to="/collections">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Collections
          </Link>
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Discover Public Collections</h1>
          <p className="text-muted-foreground">
            Explore curated project lists shared by the IlliniHunt community.
          </p>
        </div>

        <div className="glass-card border border-white/10 rounded-xl p-4 mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-10"
              placeholder="Search by collection name, description, or creator"
            />
          </div>
        </div>

        {loading ? (
          <LoadingSpinner message="Loading public collections..." />
        ) : error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            {error}
          </div>
        ) : filteredCollections.length === 0 ? (
          <div className="text-center py-12 bg-muted/10 rounded-lg border-2 border-dashed border-border/50">
            <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-foreground mb-2">No collections found</h2>
            <p className="text-muted-foreground">
              Try a different search query or create and share your own collection.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCollections.map((collection) => (
              <div key={collection.id || `${collection.name}-${collection.created_at}`} className="glass-card border border-white/10 rounded-lg p-6">
                <div className="flex items-start justify-between mb-3">
                  <h2 className="text-xl font-semibold text-foreground">{collection.name || 'Untitled Collection'}</h2>
                  <span className="rounded-full bg-uiuc-orange/15 text-uiuc-orange text-xs px-2 py-1 font-medium">
                    {collection.projects_count || 0} projects
                  </span>
                </div>

                {collection.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-3">{collection.description}</p>
                )}

                <div className="space-y-2 text-sm text-muted-foreground mb-5">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>{collection.owner_name || collection.owner_username || 'Unknown creator'}</span>
                  </div>
                  <div>
                    {collection.created_at
                      ? `Created ${formatDistance(new Date(collection.created_at), new Date(), { addSuffix: true })}`
                      : 'Creation date unavailable'}
                  </div>
                </div>

                {collection.id ? (
                  <Button asChild className="w-full">
                    <Link to={`/collections/${collection.id}`}>
                      <Eye className="w-4 h-4 mr-2" />
                      View Collection
                    </Link>
                  </Button>
                ) : (
                  <Button className="w-full" disabled>
                    View Collection
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default DiscoverCollectionsPage
