import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Search, UserMinus, UserPlus, UserRoundPlus, X } from 'lucide-react'
import { ProjectsService } from '@/lib/database'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { showToast } from '@/components/ui/toast'

type UserSummary = {
  id: string
  email?: string | null
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

type ProjectMember = {
  id: string
  user_id: string
  role: string | null
  users: UserSummary | null
}

type ProjectInvitation = {
  id: string
  invitee_id: string
  users: UserSummary | null
}

interface ProjectTeamManagerProps {
  projectId: string
  creatorId: string
  currentUserId?: string
  canManage: boolean
  initialMembers?: ProjectMember[]
  onMembershipChange?: () => void
}

function displayName(user: UserSummary | null) {
  return user?.full_name || user?.username || user?.email || 'Unknown user'
}

function initials(user: UserSummary | null) {
  const name = displayName(user)
  return name.slice(0, 2).toUpperCase()
}

function inviteStatusLabel(
  result: UserSummary,
  memberIds: Set<string>,
  pendingInviteeIds: Set<string>,
  currentUserId?: string
) {
  if (result.id === currentUserId) return 'You'
  if (memberIds.has(result.id)) return 'Added'
  if (pendingInviteeIds.has(result.id)) return 'Invited'
  return 'Invite'
}

export function ProjectTeamManager({
  projectId,
  creatorId,
  currentUserId,
  canManage,
  initialMembers = [],
  onMembershipChange
}: ProjectTeamManagerProps) {
  const [members, setMembers] = useState<ProjectMember[]>(initialMembers)
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([])
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const memberIds = useMemo(() => new Set(members.map((member) => member.user_id)), [members])
  const pendingInviteeIds = useMemo(() => new Set(invitations.map((invite) => invite.invitee_id)), [invitations])

  const loadTeam = async () => {
    const [membersResult, invitationsResult] = await Promise.all([
      ProjectsService.getProjectMembers(projectId),
      canManage ? ProjectsService.getProjectInvitations(projectId) : Promise.resolve({ data: [], error: null })
    ])

    if (!membersResult.error && membersResult.data) {
      setMembers(membersResult.data as never)
    }

    if (!invitationsResult.error && invitationsResult.data) {
      setInvitations(invitationsResult.data as never)
    }
  }

  useEffect(() => {
    setMembers(initialMembers)
  }, [initialMembers])

  useEffect(() => {
    loadTeam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, canManage])

  useEffect(() => {
    let cancelled = false

    const search = async () => {
      if (!canManage || query.trim().length < 2) {
        setSearchResults([])
        return
      }

      setLoading(true)
      const { data } = await ProjectsService.searchUsersForInvite(query)
      if (!cancelled) {
        setSearchResults((data ?? []) as never)
        setLoading(false)
      }
    }

    const timeoutId = window.setTimeout(search, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [query, canManage])

  const inviteUser = async (userId: string) => {
    setBusyId(userId)
    const { error } = await ProjectsService.inviteProjectMember(projectId, userId)
    setBusyId(null)

    if (error) {
      showToast.error('Invite failed', { description: error.message })
      return
    }

    showToast.success('Invite sent')
    setQuery('')
    setSearchResults([])
    await loadTeam()
  }

  const revokeInvite = async (invitationId: string) => {
    setBusyId(invitationId)
    const { error } = await ProjectsService.revokeProjectInvitation(invitationId)
    setBusyId(null)

    if (error) {
      showToast.error('Could not revoke invite', { description: error.message })
      return
    }

    showToast.success('Invite revoked')
    await loadTeam()
  }

  const removeMember = async (member: ProjectMember) => {
    if (member.user_id === creatorId) {
      showToast.warning('The original creator must stay on the project')
      return
    }

    setBusyId(member.user_id)
    const { error } = await ProjectsService.removeProjectMember(projectId, member.user_id)
    setBusyId(null)

    if (error) {
      showToast.error('Could not remove team member', { description: error.message })
      return
    }

    showToast.success('Team member removed')
    await loadTeam()
    onMembershipChange?.()
  }

  return (
    <div className="glass-card rounded-xl p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">Project Team</h3>
      <div className="space-y-4">
        {members.map((member) => (
          <div key={member.id} className="flex items-center justify-between gap-3">
            <Link to={`/user/${member.user_id}`} className="flex items-center gap-3 min-w-0 hover:text-uiuc-orange transition-colors">
              <Avatar>
                <AvatarImage src={member.users?.avatar_url || undefined} />
                <AvatarFallback>{initials(member.users)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{displayName(member.users)}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {member.user_id === creatorId ? 'Creator' : 'Owner'}
                  </Badge>
                  {member.users?.username && (
                    <span className="text-xs text-muted-foreground truncate">@{member.users.username}</span>
                  )}
                </div>
              </div>
            </Link>
            {canManage && member.user_id !== currentUserId && member.user_id !== creatorId && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-red-500"
                onClick={() => removeMember(member)}
                disabled={busyId === member.user_id}
              >
                <UserMinus className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}

        {canManage && (
          <div className="border-t border-white/10 pt-4 space-y-4">
            <div className="rounded-lg border border-uiuc-orange/30 bg-uiuc-orange/10 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-uiuc-orange/20 p-2 text-uiuc-orange">
                  <UserRoundPlus className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-semibold text-foreground">Add teammates</h4>
                  <p className="text-sm text-muted-foreground">
                    Search for people already on IlliniHunt, then send an invite.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor={`team-invite-search-${projectId}`} className="text-sm font-medium text-foreground">
                  Find a teammate
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                  <Input
                    id={`team-invite-search-${projectId}`}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Type a name, username, or @illinois.edu email"
                    className="pl-9 bg-midnight-800/80 border-white/15"
                  />
                </div>
                {query.trim().length < 2 && (
                  <p className="text-xs text-muted-foreground">
                    Start typing at least 2 characters to find someone.
                  </p>
                )}
              </div>
            </div>

            {loading && <p className="text-sm text-muted-foreground">Searching...</p>}

            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((result) => {
                  const isUnavailable = memberIds.has(result.id) || pendingInviteeIds.has(result.id) || result.id === currentUserId
                  const statusLabel = inviteStatusLabel(result, memberIds, pendingInviteeIds, currentUserId)
                  return (
                    <div key={result.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={result.avatar_url || undefined} />
                          <AvatarFallback>{initials(result)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{displayName(result)}</p>
                          <p className="text-xs text-muted-foreground truncate">{result.email}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => inviteUser(result.id)}
                        disabled={isUnavailable || busyId === result.id}
                      >
                        {statusLabel === 'Invite' && <UserPlus className="w-4 h-4 mr-1" />}
                        {busyId === result.id ? 'Sending...' : statusLabel}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            {!loading && query.trim().length >= 2 && searchResults.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-midnight-800/40 p-3 text-sm text-muted-foreground">
                No matching IlliniHunt users yet. Teammates need to sign in once before they can be invited.
              </div>
            )}

            {invitations.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Pending invites</p>
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm truncate">{displayName(invitation.users)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-red-500"
                      onClick={() => revokeInvite(invitation.id)}
                      disabled={busyId === invitation.id}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
