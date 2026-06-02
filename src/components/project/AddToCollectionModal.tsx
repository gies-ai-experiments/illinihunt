import { useState, useEffect, useCallback } from 'react'
import { CollectionService } from '@/lib/database'
import { useAuth } from '@/hooks/useAuth'
import { useAuthPrompt } from '@/contexts/AuthPromptContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  X, 
  Plus, 
  FolderOpen, 
  Check,
  Globe,
  Lock,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { showToast } from '@/components/ui/toast'
import type { Database } from '@/types/database'

type Collection = Database['public']['Tables']['collections']['Row']

interface AddToCollectionModalProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function AddToCollectionModal({ 
  projectId, 
  isOpen, 
  onClose, 
  onSuccess 
}: AddToCollectionModalProps) {
  const { user } = useAuth()
  const { showAuthPrompt } = useAuthPrompt()
  const [collections, setCollections] = useState<Collection[]>([])
  const [collectionsWithProject, setCollectionsWithProject] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [newCollectionDescription, setNewCollectionDescription] = useState('')
  const [newCollectionPublic, setNewCollectionPublic] = useState(false)

  const loadUserCollections = useCallback(async () => {
    if (!user) return

    setLoading(true)
    try {
      const [collectionsResult, projectCollectionsResult] = await Promise.all([
        CollectionService.getUserCollections(),
        CollectionService.getCollectionsWithProject(projectId)
      ])

      if (!collectionsResult.error && collectionsResult.data) {
        setCollections(collectionsResult.data)
      }

      if (!projectCollectionsResult.error && projectCollectionsResult.data) {
        const collectionIds = new Set(
          (projectCollectionsResult.data as Collection[]).map((c) => c.id),
        )
        setCollectionsWithProject(collectionIds)
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to load collections:', error)
      }
      showToast.error('Failed to load collections')
    } finally {
      setLoading(false)
    }
  }, [user, projectId])

  useEffect(() => {
    if (isOpen && user) {
      loadUserCollections()
    }
  }, [isOpen, user, loadUserCollections])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
      }
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.body.style.overflow = 'unset'
        document.removeEventListener('keydown', handleEscape)
      }
    } else {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  const handleToggleProject = async (collectionId: string) => {
    if (!user) {
      showAuthPrompt('manage collections')
      return
    }

    setActionLoading(collectionId)
    try {
      const isInCollection = collectionsWithProject.has(collectionId)
      
      if (isInCollection) {
        await CollectionService.removeProjectFromCollection(collectionId, projectId)
        setCollectionsWithProject(prev => {
          const newSet = new Set(prev)
          newSet.delete(collectionId)
          return newSet
        })
      } else {
        await CollectionService.addProjectToCollection(collectionId, projectId)
        setCollectionsWithProject(prev => new Set(prev).add(collectionId))
      }

      onSuccess?.()
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to update collection:', error)
      }
      showToast.error('Failed to update collection')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newCollectionName.trim()) return

    setActionLoading('create')
    try {
      const { data, error } = await CollectionService.createCollection({
        name: newCollectionName.trim(),
        description: newCollectionDescription.trim() || null,
        is_public: newCollectionPublic
      })

      if (!error && data) {
        // Add project to the new collection
        await CollectionService.addProjectToCollection(data.id, projectId)
        
        // Update local state
        setCollections(prev => [data, ...prev])
        setCollectionsWithProject(prev => new Set(prev).add(data.id))
        
        // Reset form
        setNewCollectionName('')
        setNewCollectionDescription('')
        setNewCollectionPublic(false)
        setShowCreateForm(false)
        
        onSuccess?.()
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to create collection:', error)
      }
      showToast.error('Failed to create collection')
    } finally {
      setActionLoading(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Add to Collection
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-uiuc-orange mx-auto mb-4"></div>
              <p className="text-gray-600 text-sm">Loading collections...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Create New Collection Form */}
              {showCreateForm ? (
                <form onSubmit={handleCreateCollection} className="space-y-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <Input
                      placeholder="Collection name"
                      value={newCollectionName}
                      onChange={(e) => setNewCollectionName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Input
                      placeholder="Description (optional)"
                      value={newCollectionDescription}
                      onChange={(e) => setNewCollectionDescription(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isPublic"
                      checked={newCollectionPublic}
                      onChange={(e) => setNewCollectionPublic(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="isPublic" className="text-sm text-gray-700">
                      Make collection public
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      type="submit" 
                      size="sm"
                      disabled={!newCollectionName.trim() || actionLoading === 'create'}
                    >
                      {actionLoading === 'create' ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : null}
                      Create & Add
                    </Button>
                    <Button 
                      type="button"
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowCreateForm(false)}
                      disabled={actionLoading === 'create'}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setShowCreateForm(true)}
                  className="w-full justify-start"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create New Collection
                </Button>
              )}

              {/* Collections List */}
              {collections.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Your Collections
                  </h3>
                  {collections.map((collection) => {
                    const isInCollection = collectionsWithProject.has(collection.id)
                    const isLoading = actionLoading === collection.id
                    
                    return (
                      <button
                        key={collection.id}
                        onClick={() => handleToggleProject(collection.id)}
                        disabled={isLoading}
                        className={cn(
                          "w-full p-3 rounded-lg border text-left transition-all",
                          "hover:bg-gray-50 disabled:opacity-50",
                          isInCollection
                            ? "border-uiuc-orange bg-uiuc-orange/5"
                            : "border-gray-200 hover:border-gray-300"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-gray-900 text-sm">
                                {collection.name}
                              </h4>
                              {collection.is_public ? (
                                <Globe className="w-3 h-3 text-green-600" />
                              ) : (
                                <Lock className="w-3 h-3 text-gray-500" />
                              )}
                            </div>
                            {collection.description && (
                              <p className="text-xs text-foreground/80 line-clamp-1">
                                {collection.description}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              {collection.projects_count} projects
                            </p>
                          </div>
                          <div className="flex-shrink-0 ml-3">
                            {isLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                            ) : isInCollection ? (
                              <Check className="w-4 h-4 text-uiuc-orange" />
                            ) : (
                              <Plus className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : !showCreateForm && (
                <div className="text-center py-8">
                  <FolderOpen className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 mb-4">
                    You don't have any collections yet.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateForm(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Collection
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-6 border-t border-gray-200">
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}