import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useRealtimeVotesContext } from '@/contexts/RealtimeVotesContext'
import { useAuth } from '@/hooks/useAuth'
import { StatsService, ProjectsService } from '@/lib/database'
import { rankByTrending, periodLabel, MIN_TRENDING_POOL_SIZE, type TrendingPeriod } from '@/lib/trending'
import { ProjectCard } from '@/components/project/ProjectCard'
import { Button } from '@/components/ui/button'
import { Flame, TrendingUp, Clock, Calendar, Infinity, ArrowRight } from 'lucide-react'
import { RankBadge } from '@/components/shared/RankBadge'
import { formatDistance } from 'date-fns'

type TrendingProject = {
  id: string
  name: string
  tagline: string
  description: string
  image_url: string | null
  website_url: string | null
  github_url: string | null
  category_id: string | null
  user_id: string
  upvotes_count: number
  comments_count: number
  status: string | null
  created_at: string | null
  updated_at: string | null
  users: {
    id: string
    username: string | null
    full_name: string | null
    avatar_url: string | null
  } | null
  categories: {
    id: string
    name: string
    color: string | null
    icon: string | null
  } | null
  has_voted?: boolean
  is_bookmarked?: boolean
}

const PERIOD_OPTIONS: { value: TrendingPeriod; label: string; icon: React.ReactNode }[] = [
  { value: 'today', label: 'Today', icon: <Clock className="w-4 h-4" /> },
  { value: 'week', label: 'This Week', icon: <TrendingUp className="w-4 h-4" /> },
  { value: 'month', label: 'This Month', icon: <Calendar className="w-4 h-4" /> },
  { value: 'all', label: 'All Time', icon: <Infinity className="w-4 h-4" /> },
]

export function TrendingPage() {
  const { user } = useAuth()
  const { getVoteData } = useRealtimeVotesContext()
  const [allProjects, setAllProjects] = useState<TrendingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<TrendingPeriod>('week')

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await StatsService.getTrendingProjects(MIN_TRENDING_POOL_SIZE)
      if (error) throw error
      const projectData = (data as unknown as TrendingProject[]) || []

      if (user?.id && projectData.length > 0) {
        const projectIds = projectData.map((p) => p.id)
        const { voted, bookmarked } = await ProjectsService.getUserInteractions(projectIds)

        setAllProjects(
          projectData.map((p) => ({
            ...p,
            has_voted: voted.has(p.id),
            is_bookmarked: bookmarked.has(p.id),
          })),
        )
      } else {
        setAllProjects(projectData)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load trending projects'
      if (import.meta.env.DEV) {
        console.error('Error loading trending projects:', errorMessage)
      }
      setAllProjects([])
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // Apply trending rank + real-time vote enrichment
  const rankedProjects = useMemo(() => {
    const enriched = allProjects.map((project) => {
      const rtVotes = getVoteData(project.id)
      return {
        ...project,
        upvotes_count: rtVotes?.count ?? project.upvotes_count,
      }
    })
    return rankByTrending(enriched, period)
  }, [allProjects, period, getVoteData])

  return (
    <div className="min-h-screen bg-midnight">
      {/* Hero */}
      <section className="relative pt-24 pb-16 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-neon-orange/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-neon-blue/5 rounded-full blur-[120px]" />
        </div>

        <div className="container relative z-10 px-4 md:px-6">
          <div className="flex flex-col items-center text-center mb-12">
            <div className="inline-flex items-center rounded-full border border-neon-orange/20 bg-neon-orange/5 px-4 py-1.5 text-sm text-neon-orange mb-6 shadow-[0_0_20px_rgba(255,107,53,0.1)]">
              <Flame className="mr-2 h-4 w-4" />
              <span className="font-semibold uppercase tracking-wider text-xs">
                Trending
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              What's Hot on <span className="text-neon-orange text-glow">IlliniHunt</span>
            </h1>
            <p className="text-slate-300 text-lg max-w-2xl">
              Projects ranked by engagement velocity — votes, comments, and recency
              combined into a single trending score. Fresh projects rise fast.
            </p>
          </div>

          {/* Period Tabs */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                  period === opt.value
                    ? 'bg-neon-orange text-white shadow-lg shadow-neon-orange/30'
                    : 'glass-premium text-slate-300 hover:text-white hover:bg-white/10 border border-white/10'
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="container px-4 md:px-6 pb-24">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-semibold text-white">
            {periodLabel(period)} — {rankedProjects.length}{' '}
            {rankedProjects.length === 1 ? 'project' : 'projects'}
          </h2>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white"
          >
            <Link to="/" className="flex items-center gap-2">
              Browse All
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="glass-premium rounded-xl overflow-hidden animate-pulse"
              >
                <div className="h-48 bg-white/5" />
                <div className="p-6 space-y-3">
                  <div className="h-5 bg-white/5 rounded w-3/4" />
                  <div className="h-4 bg-white/5 rounded w-1/2" />
                  <div className="h-4 bg-white/5 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : rankedProjects.length === 0 ? (
          <div className="glass-premium rounded-2xl p-12 text-center">
            <Flame className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              No trending projects {period !== 'all' ? periodLabel(period).toLowerCase() : ''}
            </h3>
            <p className="text-slate-400 mb-6 max-w-md mx-auto">
              {period === 'today'
                ? 'No projects have been launched today yet. Check back later or try a wider time range.'
                : 'Try selecting a wider time period to see more projects.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              {period !== 'all' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPeriod('all')}
                  className="border-white/10 text-slate-300 hover:text-white"
                >
                  View All Time
                </Button>
              )}
              <Button
                asChild
                size="sm"
                className="bg-neon-orange hover:bg-neon-orange/90 text-white"
              >
                <Link to="/submit">Submit a Project</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top 3 Spotlight */}
            {rankedProjects.length >= 3 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {rankedProjects.slice(0, 3).map((project, index) => (
                  <Link
                    key={project.id}
                    to={`/project/${project.id}`}
                    className="group relative glass-premium rounded-2xl overflow-hidden hover:bg-white/10 transition-all duration-300 cursor-pointer hover:scale-[1.02]"
                  >
                    <RankBadge index={index} />

                    <div className="p-6 pt-14">
                      <div className="flex items-start justify-between mb-4">
                        {project.image_url ? (
                          <img
                            src={project.image_url}
                            alt={project.name}
                            className="w-16 h-16 rounded-xl object-cover border border-white/10 shadow-lg"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gradient-to-br from-neon-orange to-orange-600 rounded-xl flex items-center justify-center border border-white/10 shadow-lg shadow-neon-orange/20">
                            <span className="text-2xl font-bold text-white">
                              {project.name.charAt(0)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 glass-premium rounded-full px-3 py-1.5 text-sm">
                          <TrendingUp className="w-3.5 h-3.5 text-neon-orange" />
                          <span className="font-semibold text-white">
                            {project.upvotes_count ?? 0}
                          </span>
                        </div>
                      </div>

                      <h3 className="text-xl font-bold text-white mb-2 group-hover:text-neon-orange transition-colors leading-tight">
                        {project.name}
                      </h3>
                      <p className="text-slate-300 text-sm line-clamp-2 mb-4">
                        {project.tagline}
                      </p>

                      <div className="flex items-center justify-between pt-4 border-t border-white/5">
                        <span className="text-xs text-slate-400">
                          {project.users?.full_name || 'Anonymous'}
                        </span>
                        <span className="text-xs text-slate-500">
                          {project.created_at &&
                            formatDistance(
                              new Date(project.created_at),
                              new Date(),
                              { addSuffix: true },
                            )}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Remaining projects */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {rankedProjects.slice(rankedProjects.length >= 3 ? 3 : 0).map((project, index) => (
                <div
                  key={project.id}
                  className="relative animate-in fade-in zoom-in-95"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  {/* Rank number */}
                  <div className="absolute -top-2 -left-2 z-10 w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-bold text-slate-300">
                    {(rankedProjects.length >= 3 ? 3 : 0) + index + 1}
                  </div>
                  <ProjectCard project={project} />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default TrendingPage
