import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { CollectionService } from '@/lib/database'
import { ProjectCard } from '@/components/project/ProjectCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  ArrowLeft,
  Edit3,
  Trash2,
  Plus,
  Globe,
  Lock,
  Calendar,
  Grid3X3
} from 'lucide-react'
import { formatDistance } from 'date-fns'

type CollectionWithProjects = {
  id: string
  name: string
  description: string | null
  is_public: boolean
  projects_count: number
  created_at: string
  updated_at: string
  user_id: string
  users: {
    id: string
    username: string | null
    full_name: string | null
    avatar_url: string | null
  }
  projects: Array<{
    id: string
    added_at: string
    projects: {
      id: string
      name: string
      tagline: string
      description: string
      image_url: string | null
      website_url: string | null
      github_url: string | null
      upvotes_count: number
      comments_count: number
      created_at: string
      users: {
        id: string
        username: string | null
        full_name: string | null
        avatar_url: string | null
      } | null
      categories: {
        id: string
        name: string
        color: string
        icon: string | null
      } | null
    }
  }>
}

export function CollectionViewPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [collection, setCollection] = useState<CollectionWithProjects | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadCollection = async () => {
      if (!id) return

      setLoading(true)
      setError(null)

      try {
        const { data, error: collectionError } = await CollectionService.getCollection(id, true)

        if (collectionError) {
          setError('Collection not found or access denied')
          return
        }

        if (!data) {
          setError('Collection not found')
          return
        }

        // Check if user can access this collection
        if (!data.is_public && data.user_id !== user?.id) {
          setError('This collection is private')
          return
        }

        setCollection(data as unknown as typeof collection)
      } catch (err) {
        setError('Failed to load collection')
        // Error already handled by setting error state
      } finally {
        setLoading(false)
      }
    }

    loadCollection()
  }, [id, user?.id])

  const handleDeleteCollection = async () => {
    if (!collection || !user || collection.user_id !== user.id) return

    if (!confirm('Are you sure you want to delete this collection? This action cannot be undone.')) {
      return
    }

    try {
      await CollectionService.deleteCollection(collection.id)
      navigate('/collections')
    } catch (error) {
      setError('Failed to delete collection. Please try again.')
    }
  }

  const handleRemoveProject = async (projectId: string) => {
    if (!collection || !user || collection.user_id !== user.id) return

    try {
      await CollectionService.removeProjectFromCollection(collection.id, projectId)
      setCollection(prev => prev ? {
        ...prev,
        projects: prev.projects.filter(p => p.projects.id !== projectId),
        projects_count: prev.projects_count - 1
      } : null)
    } catch (error) {
      setError('Failed to remove project from collection. Please try again.')
    }
  }

  const isOwner = user && collection && collection.user_id === user.id

  if (loading) {
    return <LoadingSpinner message="Loading collection..." className="min-h-screen bg-midnight" />
  }

  if (error || !collection) {
    return (
      <div className="min-h-screen bg-midnight text-foreground dark flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">
            {error || 'Collection Not Found'}
          </h1>
          <p className="text-muted-foreground mb-6">
            The collection you're looking for doesn't exist or you don't have permission to view it.
          </p>
          <div className="flex items-center gap-3 justify-center">
            <Button asChild variant="outline">
              <Link to="/collections">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Collections
              </Link>
            </Button>
            <Button asChild>
              <Link to="/">Go to Home</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-midnight text-foreground dark">
      <div className="container mx-auto px-4 pt-24 pb-8">
        {/* Back Button */}
        <div className="mb-6">
          <Button asChild variant="ghost" className="pl-0">
            <Link to="/collections">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Collections
            </Link>
          </Button>
        </div>

        {/* Collection Header */}
        <div className="mb-8">
          <Card>
            <CardContent className="p-8">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <h1 className="text-3xl font-bold text-foreground">
                      {collection.name}
                    </h1>
                    {collection.is_public ? (
                      <div className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-sm">
                        <Globe className="w-4 h-4" />
                        <span>Public</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-1 rounded-full text-sm">
                        <Lock className="w-4 h-4" />
                        <span>Private</span>
                      </div>
                    )}
                  </div>

                  {collection.description && (
                    <p className="text-foreground/90 text-lg mb-6 leading-relaxed">
                      {collection.description}
                    </p>
                  )}

                  {/* Collection Metadata */}
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={collection.users.avatar_url || ''} />
                        <AvatarFallback className="text-xs">
                          {collection.users.full_name ?
                            collection.users.full_name.slice(0, 2).toUpperCase() :
                            collection.users.username?.slice(0, 2).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <Link
                        to={`/user/${collection.users.id}`}
                        className="hover:text-uiuc-blue transition-colors"
                      >
                        {collection.users.full_name || collection.users.username || 'Anonymous'}
                      </Link>
                    </div>
                    <div className="flex items-center gap-1">
                      <Grid3X3 className="w-4 h-4" />
                      <span>{collection.projects_count} projects</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>Updated {formatDistance(new Date(collection.updated_at), new Date(), { addSuffix: true })}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {isOwner && (
                  <div className="flex items-center gap-3">
                    <Button asChild variant="outline">
                      <Link to={`/collections/${collection.id}/add-projects`}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Projects
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to={`/collections/${collection.id}/edit`}>
                        <Edit3 className="w-4 h-4 mr-2" />
                        Edit
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDeleteCollection}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Projects Section */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground">
              Projects ({collection.projects_count})
            </h2>
          </div>

          {collection.projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {collection.projects.map((collectionProject) => (
                <div key={collectionProject.id} className="relative">
                  <ProjectCard project={collectionProject.projects} />

                  {/* Remove button for collection owner */}
                  {isOwner && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveProject(collectionProject.projects.id)}
                      className="absolute top-2 left-2 bg-midnight/90 backdrop-blur-sm hover:bg-midnight shadow-md border border-white/10 text-red-500 hover:text-red-400 hover:bg-red-900/20 z-10"
                      title="Remove from collection"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-muted/10 rounded-lg border-2 border-dashed border-border/50">
              <div className="max-w-md mx-auto">
                <Grid3X3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No projects in this collection
                </h3>
                <p className="text-muted-foreground mb-6">
                  {isOwner
                    ? "Start building your collection by adding some projects."
                    : "This collection doesn't have any projects yet."
                  }
                </p>
                {isOwner && (
                  <Button asChild>
                    <Link to={`/collections/${collection.id}/add-projects`}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Projects
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}