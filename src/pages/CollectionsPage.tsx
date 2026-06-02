import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { CollectionService, BookmarkService } from '@/lib/database'
import { showToast } from '@/components/ui/toast'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Plus,
  FolderOpen,
  Bookmark,
  Eye,
  Edit3,
  Trash2,
  Calendar,
  Lock,
  Globe,
  Grid3X3
} from 'lucide-react'
import { formatDistance } from 'date-fns'

type Collection = {
  id: string
  name: string
  description: string | null
  is_public: boolean | null
  projects_count: number | null
  created_at: string | null
  updated_at: string | null
  users?: {
    id: string
    username: string | null
    full_name: string | null
    avatar_url: string | null
  }
}

export function CollectionsPage() {
  const { user } = useAuth()
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalCollections: 0,
    totalBookmarks: 0,
    publicCollections: 0,
    privateCollections: 0
  })

  useEffect(() => {
    const loadCollections = async () => {
      if (!user?.id) return

      setLoading(true)
      try {
        // Load user's collections
        const { data: collectionsData, error: collectionsError } = await CollectionService.getUserCollections()

        // Load bookmark count
        const { count: bookmarksCount } = await BookmarkService.getUserBookmarksCount()

        if (!collectionsError && collectionsData) {
          setCollections(collectionsData)

          // Calculate stats
          const publicCount = collectionsData.filter(c => c.is_public).length
          const privateCount = collectionsData.length - publicCount

          setStats({
            totalCollections: collectionsData.length,
            totalBookmarks: bookmarksCount || 0,
            publicCollections: publicCount,
            privateCollections: privateCount
          })
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Failed to load collections:', error)
        }
        showToast.error('Failed to load collections')
      } finally {
        setLoading(false)
      }
    }

    loadCollections()
  }, [user?.id])

  const handleDeleteCollection = async (collectionId: string) => {
    if (!confirm('Are you sure you want to delete this collection? This action cannot be undone.')) {
      return
    }

    try {
      await CollectionService.deleteCollection(collectionId)
      setCollections(prev => prev.filter(c => c.id !== collectionId))
      // Update stats
      setStats(prev => ({
        ...prev,
        totalCollections: prev.totalCollections - 1
      }))
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to delete collection:', error)
      }
      showToast.error('Failed to delete collection')
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-midnight text-foreground dark flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Access Denied</h1>
          <p className="text-muted-foreground mb-6">You need to be logged in to access your collections.</p>
          <Button asChild>
            <Link to="/">Go to Home</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-midnight text-foreground dark">
      <div className="container mx-auto px-4 pt-24 pb-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                My Collections
              </h1>
              <p className="text-muted-foreground">
                Organize and save your favorite projects into custom collections
              </p>
            </div>

            <div className="flex items-center gap-4">
              <Button asChild variant="outline">
                <Link to="/collections/discover">
                  <Globe className="w-4 h-4 mr-2" />
                  Discover Collections
                </Link>
              </Button>
              <Button asChild>
                <Link to="/collections/new">
                  <Plus className="w-4 h-4 mr-2" />
                  New Collection
                </Link>
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Collections</CardTitle>
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalCollections}</div>
                <p className="text-xs text-muted-foreground">
                  Collections created
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bookmarked Projects</CardTitle>
                <Bookmark className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalBookmarks}</div>
                <p className="text-xs text-muted-foreground">
                  Projects bookmarked
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Public Collections</CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.publicCollections}</div>
                <p className="text-xs text-muted-foreground">
                  Shared with community
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Private Collections</CardTitle>
                <Lock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.privateCollections}</div>
                <p className="text-xs text-muted-foreground">
                  For your eyes only
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Quick Actions</h3>
                  <p className="text-muted-foreground text-sm">Common collection management tasks</p>
                </div>
                <div className="flex items-center gap-3">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/bookmarks">
                      <Bookmark className="w-4 h-4 mr-2" />
                      View All Bookmarks
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/collections/discover">
                      <Eye className="w-4 h-4 mr-2" />
                      Browse Public Collections
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Collections Section */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground">Your Collections</h2>
          </div>

          {loading ? (
            <LoadingSpinner message="Loading your collections..." />
          ) : collections.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {collections.map((collection) => (
                <Card key={collection.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-foreground truncate">
                            {collection.name}
                          </h3>
                          {collection.is_public ? (
                            <Globe className="w-4 h-4 text-green-600 flex-shrink-0" />
                          ) : (
                            <Lock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          )}
                        </div>

                        {collection.description && (
                          <p className="text-foreground/80 text-sm line-clamp-2 mb-3">
                            {collection.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 mb-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Grid3X3 className="w-4 h-4" />
                        <span>{collection.projects_count} projects</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDistance(new Date(collection.updated_at ?? 0), new Date(), { addSuffix: true })}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button asChild variant="outline" size="sm" className="flex-1">
                        <Link to={`/collections/${collection.id}`}>
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Link>
                      </Button>

                      <Button asChild variant="outline" size="sm">
                        <Link to={`/collections/${collection.id}/edit`}>
                          <Edit3 className="w-4 h-4" />
                        </Link>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteCollection(collection.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-muted/10 rounded-lg border-2 border-dashed border-border/50">
              <div className="max-w-md mx-auto">
                <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No collections yet
                </h3>
                <p className="text-muted-foreground mb-6">
                  Start organizing your favorite projects by creating your first collection.
                </p>
                <div className="flex items-center gap-3 justify-center">
                  <Button asChild>
                    <Link to="/collections/new">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Collection
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/bookmarks">
                      <Bookmark className="w-4 h-4 mr-2" />
                      View Bookmarks
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}