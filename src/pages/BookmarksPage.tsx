import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, ExternalLink, Search, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { BookmarkService } from '@/lib/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getErrorMessage, showToast } from '@/components/ui/toast'
import { formatDistance } from 'date-fns'
import { DEFAULT_CATEGORY_COLOR } from '@/lib/constants'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import type { Database } from '@/types/database'

type BookmarkRow = Database['public']['Views']['user_bookmarks_with_projects']['Row']

export function BookmarksPage() {
  const { user } = useAuth()
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [removingProjectId, setRemovingProjectId] = useState<string | null>(null)

  useEffect(() => {
    const loadBookmarks = async () => {
      if (!user) return

      setLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await BookmarkService.getUserBookmarks(user.id)
        if (fetchError) {
          throw fetchError
        }
        setBookmarks((data as unknown as BookmarkRow[]) || [])
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }

    loadBookmarks()
  }, [user])

  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) {
      return bookmarks
    }
    const query = searchQuery.toLowerCase()
    return bookmarks.filter((bookmark) => {
      const name = bookmark.project_name?.toLowerCase() || ''
      const tagline = bookmark.tagline?.toLowerCase() || ''
      const author = bookmark.project_author?.toLowerCase() || ''
      const category = bookmark.category_name?.toLowerCase() || ''
      return name.includes(query) || tagline.includes(query) || author.includes(query) || category.includes(query)
    })
  }, [bookmarks, searchQuery])

  const handleRemove = async (projectId: string | null) => {
    if (!projectId) return

    setRemovingProjectId(projectId)
    try {
      const { error: removeError } = await BookmarkService.removeBookmark(projectId)
      if (removeError) {
        throw removeError
      }

      setBookmarks((previous) => previous.filter((bookmark) => bookmark.project_id !== projectId))
      showToast.success('Bookmark removed')
    } catch (err) {
      showToast.error('Failed to remove bookmark', { description: getErrorMessage(err) })
    } finally {
      setRemovingProjectId(null)
    }
  }

  return (
    <div className="min-h-screen bg-midnight text-foreground dark">
      <div className="container mx-auto px-4 pt-24 pb-8">
        <Button asChild variant="ghost" className="mb-6 pl-0">
          <Link to="/collections">Back to Collections</Link>
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Bookmarked Projects</h1>
          <p className="text-muted-foreground">
            Keep track of projects you want to revisit.
          </p>
        </div>

        <div className="glass-card border border-white/10 rounded-xl p-4 mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-10"
              placeholder="Search bookmarks by project name, author, or category"
            />
          </div>
        </div>

        {loading ? (
          <LoadingSpinner message="Loading bookmarks..." />
        ) : error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</div>
        ) : filteredBookmarks.length === 0 ? (
          <div className="text-center py-12 bg-muted/10 rounded-lg border-2 border-dashed border-border/50">
            <Bookmark className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-foreground mb-2">No bookmarks yet</h2>
            <p className="text-muted-foreground mb-4">
              Save interesting projects and they will appear here.
            </p>
            <Button asChild>
              <Link to="/">Explore Projects</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredBookmarks.map((bookmark) => (
              <div key={bookmark.id || `${bookmark.project_id}-${bookmark.bookmarked_at}`} className="glass-card border border-white/10 rounded-lg p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      {bookmark.project_name || 'Untitled project'}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      by {bookmark.project_author || 'Unknown author'}
                    </p>
                  </div>
                  {bookmark.category_name && (
                    <span
                      className="rounded-full px-2 py-1 text-xs font-medium text-white"
                      style={{ backgroundColor: bookmark.category_color || DEFAULT_CATEGORY_COLOR }}
                    >
                      {bookmark.category_name}
                    </span>
                  )}
                </div>

                {bookmark.tagline && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{bookmark.tagline}</p>
                )}

                <div className="text-xs text-muted-foreground mb-4">
                  {bookmark.bookmarked_at
                    ? `Bookmarked ${formatDistance(new Date(bookmark.bookmarked_at), new Date(), { addSuffix: true })}`
                    : 'Bookmark date unavailable'}
                </div>

                <div className="flex items-center gap-2">
                  {bookmark.project_id ? (
                    <Button asChild className="flex-1">
                      <Link to={`/project/${bookmark.project_id}`}>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View Project
                      </Link>
                    </Button>
                  ) : (
                    <Button className="flex-1" disabled>
                      View Project
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    className="text-red-400 border-red-500/40 hover:bg-red-500/10"
                    disabled={!bookmark.project_id || removingProjectId === bookmark.project_id}
                    onClick={() => handleRemove(bookmark.project_id)}
                    title="Remove bookmark"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default BookmarksPage
