import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ProjectsService } from '@/lib/database'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { StatCard } from '@/components/shared/StatCard'
import { DeleteProjectModal } from '@/components/project/DeleteProjectModal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { showToast } from '@/components/ui/toast'
import {
  Plus,
  BarChart3,
  MessageCircle,
  ArrowUp,
  ExternalLink,
  Github,
  Edit3,
  Eye,
  Calendar,
  TrendingUp,
  RefreshCw,
  Trash2,
  UserPlus,
  Check,
  X
} from 'lucide-react'

type DashboardProject = {
  id: string
  name: string
  tagline: string
  description: string
  image_url: string | null
  website_url: string | null
  github_url: string | null
  upvotes_count: number
  comments_count: number
  status: string
  created_at: string
  categories: {
    id: string
    name: string
    color: string | null
    icon: string | null
  } | null
  membership_role?: string | null
  is_creator?: boolean
}

type ProjectInvitation = {
  id: string
  created_at: string | null
  projects: {
    id: string
    name: string
    tagline: string
    image_url: string | null
  } | null
  users: {
    id: string
    username: string | null
    full_name: string | null
    avatar_url: string | null
    email: string
  } | null
}

export function DashboardPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const location = useLocation()
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalProjects: 0,
    totalUpvotes: 0,
    totalComments: 0,
    totalViews: 0 // Placeholder for future views tracking
  })
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean
    project: DashboardProject | null
  }>({
    isOpen: false,
    project: null
  })
  const [deleting, setDeleting] = useState(false)

  const loadUserProjects = useCallback(async () => {
    if (!user?.id) return

    setLoading(true)
    const { data, error } = await ProjectsService.getUserProjects(user.id)

    if (!error && data) {
      setProjects(data)

      // Calculate stats
      const totalUpvotes = data.reduce((sum, p) => sum + p.upvotes_count, 0)
      const totalComments = data.reduce((sum, p) => sum + p.comments_count, 0)

      setStats({
        totalProjects: data.length,
        totalUpvotes,
        totalComments,
        totalViews: 0 // Placeholder
      })
    }

    setLoading(false)
  }, [user?.id])

  const loadInvitations = useCallback(async () => {
    if (!user?.id) return

    const { data, error } = await ProjectsService.getPendingInvitationsForCurrentUser()
    if (!error && data) {
      setInvitations(data as ProjectInvitation[])
    }
  }, [user?.id])

  // Load projects when component mounts or when returning from another page
  useEffect(() => {
    loadUserProjects()
    loadInvitations()
  }, [loadUserProjects, loadInvitations, location.pathname])

  const handleInvitation = async (invitationId: string, action: 'accept' | 'decline') => {
    setDeleting(true)
    const { error } = action === 'accept'
      ? await ProjectsService.acceptProjectInvitation(invitationId)
      : await ProjectsService.declineProjectInvitation(invitationId)

    setDeleting(false)

    if (error) {
      showToast.error(action === 'accept' ? 'Could not accept invite' : 'Could not decline invite', {
        description: error.message
      })
      return
    }

    showToast.success(action === 'accept' ? 'Invite accepted' : 'Invite declined')
    await Promise.all([loadUserProjects(), loadInvitations()])
  }

  const handleDeleteProject = (project: DashboardProject) => {
    setDeleteModal({
      isOpen: true,
      project
    })
  }

  const handleConfirmDelete = async () => {
    if (!deleteModal.project || !user?.id) return

    setDeleting(true)
    try {
      const { error } = await ProjectsService.deleteProject(deleteModal.project.id)

      if (error) {
        throw new Error(error.message)
      }

      // Remove project from local state
      setProjects(prev => prev.filter(p => p.id !== deleteModal.project!.id))

      // Update stats
      setStats(prev => ({
        ...prev,
        totalProjects: prev.totalProjects - 1,
        totalUpvotes: prev.totalUpvotes - deleteModal.project!.upvotes_count,
        totalComments: prev.totalComments - deleteModal.project!.comments_count
      }))

      showToast.success(
        'Project deleted successfully',
        `"${deleteModal.project.name}" has been permanently deleted.`
      )
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error deleting project:', error)
      }
      showToast.error(
        'Failed to delete project',
        {
          description: error instanceof Error ? error.message : 'An unexpected error occurred'
        }
      )
    } finally {
      setDeleting(false)
      setDeleteModal({ isOpen: false, project: null })
    }
  }

  const handleCloseDeleteModal = () => {
    if (!deleting) {
      setDeleteModal({ isOpen: false, project: null })
    }
  }

  // Show loading while auth is being determined
  if (authLoading) {
    return <LoadingSpinner className="min-h-screen" />
  }

  // Only show access denied if auth is complete and user is null
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-6">You need to be logged in to access your dashboard.</p>
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
                Welcome back, {profile?.full_name || profile?.username || 'there'}!
              </h1>
              <p className="text-muted-foreground">
                Manage your projects and track your community impact
              </p>
            </div>

            <div className="flex items-center gap-4">
              <Button asChild>
                <Link to="/submit">
                  <Plus className="w-4 h-4 mr-2" />
                  New Project
                </Link>
              </Button>

              <Avatar>
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback>
                  {profile?.full_name?.charAt(0) ||
                    profile?.username?.charAt(0) ||
                    user.email?.charAt(0) ||
                    '?'}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <StatCard title="Total Projects" value={stats.totalProjects} icon={BarChart3} description="Projects submitted" />
            <StatCard title="Total Upvotes" value={stats.totalUpvotes} icon={ArrowUp} description="Community approval" />
            <StatCard title="Total Comments" value={stats.totalComments} icon={MessageCircle} description="Community engagement" />
            <StatCard title="Profile Views" value="-" icon={Eye} description="Coming soon" />
          </div>
        </div>

        {/* Projects Section */}
        <div>
          {invitations.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4">Project Invites</h2>
              <div className="space-y-3">
                {invitations.map((invitation) => (
                  <Card key={invitation.id} className="border-uiuc-orange/30">
                    <CardContent className="p-5">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          {invitation.projects?.image_url ? (
                            <img
                              src={invitation.projects.image_url}
                              alt={invitation.projects.name}
                              className="w-14 h-14 rounded-lg object-cover border flex-shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                              <UserPlus className="w-6 h-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground truncate">
                              {invitation.projects?.name || 'Project invite'}
                            </h3>
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              Invited by {invitation.users?.full_name || invitation.users?.username || invitation.users?.email || 'a project owner'}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleInvitation(invitation.id, 'accept')}
                            disabled={deleting}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleInvitation(invitation.id, 'decline')}
                            disabled={deleting}
                          >
                            <X className="w-4 h-4 mr-1" />
                            Decline
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground">Your Projects</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadUserProjects()}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button asChild variant="outline">
                <Link to={`/user/${user.id}`}>
                  <Eye className="w-4 h-4 mr-2" />
                  View Public Profile
                </Link>
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-uiuc-orange mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading your projects...</p>
            </div>
          ) : projects.length > 0 ? (
            <div className="space-y-6">
              {projects.map((project) => (
                <Card key={project.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-6">
                      {/* Project Image */}
                      {project.image_url ? (
                        <img
                          src={project.image_url}
                          alt={project.name}
                          className="w-20 h-20 rounded-lg object-cover border flex-shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-gray-400 text-2xl">📱</span>
                        </div>
                      )}

                      {/* Project Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-foreground mb-1">
                              <Link
                                to={`/project/${project.id}`}
                                className="hover:text-uiuc-orange transition-colors cursor-pointer"
                              >
                                {project.name}
                              </Link>
                            </h3>
                            <p className="text-foreground/80 mb-2 line-clamp-2">
                              {project.tagline}
                            </p>

                            {/* Category & Status */}
                            <div className="flex items-center gap-2 mb-3">
                              {project.categories && (
                                <Badge
                                  variant="secondary"
                                  className="text-foreground"
                                  style={{
                                    backgroundColor: `${project.categories.color}20`,
                                    borderColor: `${project.categories.color}40`
                                  }}
                                >
                                  {project.categories.icon && (
                                    <span className="mr-1" style={{ color: project.categories.color ?? undefined }}>{project.categories.icon}</span>
                                  )}
                                  {project.categories.name}
                                </Badge>
                              )}

                              <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                                {project.status}
                              </Badge>
                              {!project.is_creator && (
                                <Badge variant="secondary">
                                  Team project
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-6 mb-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <ArrowUp className="w-4 h-4" />
                            <span>{project.upvotes_count} upvotes</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MessageCircle className="w-4 h-4" />
                            <span>{project.comments_count} comments</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>{new Date(project.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/project/${project.id}`}>
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Link>
                          </Button>

                          <Button asChild variant="outline" size="sm">
                            <Link to={`/project/${project.id}/edit`}>
                              <Edit3 className="w-4 h-4 mr-1" />
                              Edit
                            </Link>
                          </Button>

                          {project.is_creator !== false && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteProject(project)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Delete
                            </Button>
                          )}

                          {project.website_url && (
                            <Button asChild variant="outline" size="sm">
                              <a href={project.website_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4 mr-1" />
                                Visit
                              </a>
                            </Button>
                          )}

                          {project.github_url && (
                            <Button asChild variant="outline" size="sm">
                              <a href={project.github_url} target="_blank" rel="noopener noreferrer">
                                <Github className="w-4 h-4 mr-1" />
                                Source
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-muted/10 rounded-lg border-2 border-dashed border-border/50">
              <div className="max-w-md mx-auto">
                <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No projects yet
                </h3>
                <p className="text-muted-foreground mb-6">
                  Start building your presence on IlliniHunt by submitting your first project.
                </p>
                <Button asChild>
                  <Link to="/submit">
                    <Plus className="w-4 h-4 mr-2" />
                    Submit Your First Project
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Project Modal */}
      <DeleteProjectModal
        projectName={deleteModal.project?.name || ''}
        isOpen={deleteModal.isOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleConfirmDelete}
        loading={deleting}
      />
    </div>
  )
}
