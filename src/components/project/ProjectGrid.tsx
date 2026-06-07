import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRealtimeVotesContext } from '@/contexts/RealtimeVotesContext'
import { useCategories } from '@/hooks/useCategories'
import { useAuth } from '@/hooks/useAuth'
import { ProjectsService } from '@/lib/database'
import { DEFAULT_CATEGORY_COLOR } from '@/lib/constants'
import { ProjectCard } from './ProjectCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Filter, Sparkles, Frown, Rocket, Flame } from 'lucide-react'
import { rankByTrending } from '@/lib/trending'
import { CategoryIcon } from '@/lib/categoryIcons'
import type { UserInfo, CategoryInfo } from '@/types/project'
import type { Database } from '@/types/database'

type Project = Database['public']['Tables']['projects']['Row'] & {
  users: UserInfo | null
  categories: CategoryInfo | null
  has_voted?: boolean
  is_bookmarked?: boolean
}

type ProjectGridProps = {
  selectedCategory?: string
}

const PROJECTS_QUERY_TIMEOUT_MS = 12000
const USER_INTERACTIONS_TIMEOUT_MS = 5000

/**
 * ProjectGrid component - Main grid displaying all projects with filtering and sorting
 * Performance optimizations:
 * - Memoized enriched projects to prevent unnecessary recalculations
 * - Debounced search input (300ms) to reduce API calls
 * - Cached category list to avoid re-fetching
 */
export function ProjectGrid({ selectedCategory: externalCategory }: ProjectGridProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const { categories } = useCategories()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>(externalCategory || 'all')
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'trending'>('recent')

  // Real-time vote updates
  const { getVoteData } = useRealtimeVotesContext()

  const withTimeout = useCallback(<T,>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      })
    ])
  }, [])

  // Memoize loadProjects to prevent unnecessary recreations
  const loadProjects = useCallback(async () => {
    const requestId = ++requestIdRef.current
    try {
      setLoading(true)
      setError(null)

      const { data, error } = await withTimeout(ProjectsService.getProjects({
        search: searchQuery || undefined,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        sortBy,
        limit: 20
      }), PROJECTS_QUERY_TIMEOUT_MS, 'Timed out while loading projects')

      if (error) throw error
      const projectData = (data as unknown as Project[]) || []
      if (requestId !== requestIdRef.current) return

      // Batch-fetch user interaction status to avoid N+1 network calls from each card.
      if (user?.id && projectData.length > 0) {
        const projectIds = projectData.map(project => project.id)
        try {
          const { voted, bookmarked } = await withTimeout(
            ProjectsService.getUserInteractions(projectIds),
            USER_INTERACTIONS_TIMEOUT_MS,
            'Timed out while loading user interaction status'
          )

          if (requestId !== requestIdRef.current) return

          setProjects(
            projectData.map(project => ({
              ...project,
              has_voted: voted.has(project.id),
              is_bookmarked: bookmarked.has(project.id)
            }))
          )
        } catch (_interactionError) {
          // If user interaction lookups fail or time out, render projects anyway.
          setProjects(projectData)
        }
      } else {
        setProjects(projectData)
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [searchQuery, selectedCategory, sortBy, user?.id, withTimeout])

  useEffect(() => {
    // Debounce all filters including search
    const timer = setTimeout(() => {
      loadProjects()
    }, searchQuery ? 300 : 0) // Only debounce search, immediate for filters
    return () => clearTimeout(timer)
  }, [loadProjects, searchQuery])

  useEffect(() => {
    setSelectedCategory(externalCategory || 'all')
  }, [externalCategory])

  // Enrich projects with real-time vote data, then apply trending sort if needed
  // Memoized to prevent unnecessary recalculations on every render
  const enrichedProjects = useMemo(() => {
    const enriched = projects.map(project => {
      const realtimeVoteData = getVoteData(project.id)
      return {
        ...project,
        upvotes_count: realtimeVoteData?.count ?? project.upvotes_count
      }
    })
    if (sortBy === 'trending') {
      return rankByTrending(enriched, 'week')
    }
    return enriched
  }, [projects, getVoteData, sortBy])

  // Memoize category lookup for active filters display
  // Prevents repeated array.find() calls on every render
  const selectedCategoryName = useMemo(() => {
    if (selectedCategory === 'all') return null
    return categories.find(c => c.id === selectedCategory)?.name || 'Category'
  }, [categories, selectedCategory])


  if (error) {
    return (
      <div className="text-center py-12">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg inline-block">
          <p className="font-semibold">Error Loading Projects</p>
          <p className="text-sm">{error}</p>
          <Button 
            onClick={loadProjects}
            className="mt-2"
            size="sm"
          >
            Try Again
          </Button>
        </div>
      </div>
    )
  }


  // Loading skeleton for project cards
  const ProjectCardSkeleton = () => (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="animate-pulse">
        <div className="h-48 bg-gray-100" />
        <div className="p-6">
          <div className="h-6 bg-gray-100 rounded w-3/4 mb-4" />
          <div className="h-4 bg-gray-100 rounded w-1/2 mb-4" />
          <div className="flex items-center mt-4 space-x-2">
            <div className="h-8 w-8 rounded-full bg-gray-100" />
            <div className="h-4 bg-gray-100 rounded w-24" />
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-r from-uiuc-blue to-uiuc-orange rounded-xl p-8 md:p-12">
        {/* Subtle overlay for better text contrast */}
        <div className="absolute inset-0 bg-black/10 rounded-xl"></div>
        <div className="relative z-10 max-w-3xl">
          <h1 className="text-3xl md:text-4xl font-bold mb-4 text-white drop-shadow-lg">Discover Amazing Projects</h1>
          <p className="text-lg text-white/95 mb-6 leading-relaxed drop-shadow-md">
            Explore innovative projects from the Illinois community. Vote for your favorites, discover new ideas, and connect with brilliant minds.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              variant="secondary" 
              className="bg-white text-uiuc-blue hover:bg-gray-50 font-medium shadow-lg hover:shadow-xl transition-all"
              onClick={() => document.getElementById('search-projects')?.focus()}
            >
              <Search className="mr-2 h-4 w-4" />
              Browse Projects
            </Button>
            <Button 
              variant="outline" 
              className="bg-white/10 backdrop-blur-sm border-white/30 text-white hover:bg-white/20 hover:border-white/40 shadow-lg font-medium"
              onClick={() => {
                if (user) {
                  navigate('/submit')
                } else {
                  // If not authenticated, redirect to home with a sign-in prompt
                  navigate('/', {
                    state: {
                      authRedirect: '/submit',
                      message: 'Please sign in to submit a project'
                    }
                  })
                }
              }}
            >
              <Rocket className="mr-2 h-4 w-4" />
              Submit Project
            </Button>
          </div>
        </div>
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="flex-1 w-full">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="search-projects"
                placeholder="Search by name, description, or technology..."
                className="pl-10 h-11 text-base"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex-1 md:w-48">
              <Select
                value={selectedCategory}
                onValueChange={(value) => setSelectedCategory(value)}
              >
                <SelectTrigger className="h-11">
                  <Filter className="h-4 w-4 mr-2 text-gray-500" />
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: category.color || DEFAULT_CATEGORY_COLOR }}
                        >
                          <CategoryIcon 
                            iconName={category.icon} 
                            className="w-2.5 h-2.5 text-white" 
                            fallback=""
                          />
                        </div>
                        {category.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-40">
              <Select
                value={sortBy}
                onValueChange={(value: 'recent' | 'popular' | 'trending') => setSortBy(value)}
              >
                <SelectTrigger className="h-11">
                  {sortBy === 'trending' && <Flame className="h-4 w-4 mr-1 text-orange-500 flex-shrink-0" />}
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trending">Trending</SelectItem>
                  <SelectItem value="recent">Most Recent</SelectItem>
                  <SelectItem value="popular">Most Popular</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Active Filters */}
        {(searchQuery || selectedCategory !== 'all') && (
          <div className="mt-4 flex flex-wrap gap-2">
            {searchQuery && (
              <div className="bg-blue-50 text-blue-700 text-sm px-3 py-1.5 rounded-full flex items-center">
                Search: {searchQuery}
                <button 
                  onClick={() => setSearchQuery('')}
                  className="ml-2 text-blue-500 hover:text-blue-700"
                >
                  ×
                </button>
              </div>
            )}
            {selectedCategory !== 'all' && (
              <div className="bg-orange-50 text-orange-700 text-sm px-3 py-1.5 rounded-full flex items-center">
                {selectedCategoryName}
                <button 
                  onClick={() => setSelectedCategory('all')}
                  className="ml-2 text-orange-500 hover:text-orange-700"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-xl font-semibold text-foreground">
            {searchQuery ? `Search results for "${searchQuery}"` : 
             selectedCategory !== 'all' ? `${selectedCategoryName || ''} Projects` :
             'All Projects'}
          </h3>
          {!loading && (
            <p className="text-sm text-muted-foreground mt-1">
              {enrichedProjects.length} {enrichedProjects.length === 1 ? 'project' : 'projects'} found
            </p>
          )}
        </div>
        {(searchQuery || selectedCategory !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchQuery('')
              setSelectedCategory('all')
            }}
            className="text-uiuc-blue hover:text-uiuc-orange hover:bg-uiuc-blue/5"
          >
            Clear all filters
          </Button>
        )}
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        // Error State
        <div className="bg-red-50 border border-red-100 rounded-xl p-6 text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
            <Frown className="h-6 w-6 text-red-600" />
          </div>
          <h3 className="text-lg font-medium text-red-800 mb-1">Something went wrong</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <Button 
            variant="outline" 
            onClick={loadProjects}
            className="border-red-200 text-red-700 hover:bg-red-50"
          >
            Try Again
          </Button>
        </div>
      ) : enrichedProjects.length === 0 ? (
        // Empty State
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-500 mb-4">
            <Sparkles className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No projects found</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            {searchQuery || selectedCategory !== 'all' 
              ? 'No projects match your current filters. Try adjusting your search or filters.'
              : 'Be the first to share your project with the community!'}
          </p>
          <Button 
            className="bg-uiuc-blue hover:bg-uiuc-blue/90"
            onClick={() => {
              if (user) {
                navigate('/submit')
              } else {
                navigate('/', {
                  state: {
                    authRedirect: '/submit',
                    message: 'Please sign in to submit a project'
                  }
                })
              }
            }}
          >
            Submit Project
          </Button>
        </div>
      ) : (
        // Projects Grid
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {enrichedProjects.map((project, index) => (
            <div
              key={project.id}
              className="animate-in fade-in zoom-in-95 transition-transform duration-300 hover:-translate-y-1"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <ProjectCard project={project} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
