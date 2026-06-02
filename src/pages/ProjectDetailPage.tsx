import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useError } from '@/contexts/ErrorContext'
import { ProjectsService } from '@/lib/database'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { VoteButton } from '@/components/project/VoteButton'
import { ArrowLeft, ExternalLink, Github, RefreshCw, Edit } from 'lucide-react'
import { CommentList } from '@/components/comment/CommentList'
import { YouTubeEmbed } from '@/components/media/YouTubeEmbed'
import { sanitizeContent, sanitizeUrl, linkifyText } from '@/lib/sanitize'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ProjectTeamManager } from '@/components/project/ProjectTeamManager'

type ProjectDetail = {
  id: string
  name: string
  tagline: string
  description: string
  image_url: string | null
  website_url: string | null
  github_url: string | null
  video_url: string | null
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
    color: string | null
    icon: string | null
  } | null
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { handleServiceError } = useError()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [imageError, setImageError] = useState(false)
  const [currentVoteCount, setCurrentVoteCount] = useState(0)
  const [canManageProject, setCanManageProject] = useState(false)

  const loadProject = useCallback(async () => {
    if (!id) return

    setLoading(true)
    setError('')

    try {
      const { data, error } = await ProjectsService.getProject(id)

      if (error) {
        setError('Failed to load project')
        handleServiceError(error, 'load project', loadProject)
        return
      }

      if (!data) {
        setError('Project not found')
        return
      }

      setProject(data)
      setCurrentVoteCount(data.upvotes_count)
      setError('')
    } catch (err) {
      setError('Failed to load project')
      handleServiceError(err, 'load project', loadProject)
    } finally {
      setLoading(false)
    }
  }, [id, handleServiceError])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  useEffect(() => {
    const loadPermissions = async () => {
      if (!project || !user) {
        setCanManageProject(false)
        return
      }

      const canManage = await ProjectsService.canManageProject(project.id)
      setCanManageProject(canManage)
    }

    loadPermissions()
  }, [project, user])

  if (!id) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return <LoadingSpinner message="Loading project..." className="min-h-screen bg-midnight" />
  }

  if (error || !project) {
    const isNetworkError = error.includes('load project')

    return (
      <div className="min-h-screen bg-midnight flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-foreground mb-4">
            {isNetworkError ? 'Failed to Load Project' : 'Project Not Found'}
          </h1>
          <p className="text-muted-foreground mb-6">
            {error || 'The requested project could not be found.'}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            {isNetworkError && (
              <Button onClick={loadProject} variant="outline" className="flex items-center gap-2 border-white/10 hover:bg-white/5 hover:text-foreground">
                <RefreshCw className="w-4 h-4" />
                Retry
              </Button>
            )}
            <Button asChild className="bg-uiuc-orange hover:bg-uiuc-orange/90">
              <Link to="/" className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Home
              </Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-midnight text-foreground dark">
      {/* Navigation */}
      <div className="container mx-auto px-4 pt-24 pb-8">
        <Button variant="ghost" asChild className="mb-6 text-muted-foreground hover:text-foreground hover:bg-white/5">
          <Link to="/">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Projects
          </Link>
        </Button>
      </div>

      {/* Project Header */}
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Project Image */}
            {project.image_url && !imageError && (
              <div className="mb-8 group relative rounded-xl overflow-hidden border border-white/10 bg-midnight-800/50">
                <img
                  src={project.image_url}
                  alt={project.name}
                  className="w-full h-64 md:h-80 object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={() => setImageError(true)}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-midnight via-transparent to-transparent opacity-60" />
              </div>
            )}

            {/* Project Info */}
            <div className="space-y-6">
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 tracking-tight">
                      {sanitizeContent(project.name)}
                    </h1>
                    <p className="text-xl text-muted-foreground leading-relaxed">
                      {sanitizeContent(project.tagline)}
                    </p>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <VoteButton
                      projectId={project.id}
                      initialVoteCount={project.upvotes_count}
                      onVoteChange={setCurrentVoteCount}
                    />
                  </div>
                </div>

                {/* Category Badge */}
                {project.categories && (
                  <Badge
                    variant="secondary"
                    className="mb-4 text-foreground"
                    style={{
                      backgroundColor: `${project.categories.color}20`,
                      borderColor: `${project.categories.color}40`
                    }}
                  >
                    {project.categories.icon && (
                      <span className="mr-1" style={{ color: project.categories.color ?? undefined }}>{project.categories.icon}</span>
                    )}
                    {sanitizeContent(project.categories.name)}
                  </Badge>
                )}
              </div>

              {/* Description */}
              <div className="prose prose-invert max-w-none">
                <h2 className="text-2xl font-semibold text-foreground mb-4">About this project</h2>
                <div
                  className="text-foreground/90 leading-relaxed whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{
                    __html: linkifyText(sanitizeContent(project.description))
                  }}
                />
              </div>

              {/* YouTube Video Embed */}
              {project.video_url && (
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold text-foreground">Project Demo</h3>
                  <YouTubeEmbed
                    url={project.video_url}
                    title={`${project.name} demo video`}
                  />
                </div>
              )}

              {/* Links */}
              {(project.website_url && sanitizeUrl(project.website_url)) || (project.github_url && sanitizeUrl(project.github_url)) ? (
                <div className="flex flex-wrap gap-4">
                  {project.website_url && sanitizeUrl(project.website_url) && (
                    <Button asChild variant="outline" className="border-white/10 hover:bg-white/5 hover:text-foreground">
                      <a href={sanitizeUrl(project.website_url)} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Visit Website
                      </a>
                    </Button>
                  )}
                  {project.github_url && sanitizeUrl(project.github_url) && (
                    <Button asChild variant="outline" className="border-white/10 hover:bg-white/5 hover:text-foreground">
                      <a href={sanitizeUrl(project.github_url)} target="_blank" rel="noopener noreferrer">
                        <Github className="w-4 h-4 mr-2" />
                        View Source
                      </a>
                    </Button>
                  )}
                </div>
              ) : null}

              {/* Comments Section */}
              <div className="border-t border-white/10 pt-8">
                <CommentList
                  projectId={project.id}
                  totalComments={project.comments_count}
                />
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              <ProjectTeamManager
                projectId={project.id}
                creatorId={project.users?.id || ''}
                currentUserId={user?.id}
                canManage={canManageProject}
                initialMembers={project.users ? [{
                  id: `creator-${project.id}`,
                  user_id: project.users.id,
                  role: 'owner',
                  users: project.users
                }] : []}
                onMembershipChange={loadProject}
              />

              {/* Project Stats */}
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Project Stats</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Upvotes</span>
                    <span className="font-medium text-foreground">{currentVoteCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Comments</span>
                    <span className="font-medium text-foreground">{project.comments_count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-medium text-foreground">
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Edit Button for Project Team */}
              {(canManageProject || (user && project.users?.id === user.id)) && (
                <div className="glass-card rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Manage Project</h3>
                  <div className="space-y-2">
                    <Button asChild className="w-full bg-uiuc-orange hover:bg-uiuc-orange/90">
                      <Link to={`/project/${project.id}/edit`}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Project
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full border-white/10 hover:bg-white/5 hover:text-foreground">
                      <Link to="/dashboard">
                        View Dashboard
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
