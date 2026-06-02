import { useEffect, useRef, useState } from 'react'
import { apiResult } from '@/lib/api'

interface VoteCountChange {
  projectId: string
  newCount: number
}

interface UserVoteChange {
  projectId: string
  userId: string
  hasVoted: boolean
}

interface UseRealtimeVotesProps {
  onVoteCountChange?: (change: VoteCountChange) => void
  onUserVoteChange?: (change: UserVoteChange) => void
  onProjectDeleted?: (projectId: string) => void
  userId?: string
}

const POLL_INTERVAL_MS = 30_000

/**
 * 30-second polling replacement for the old Supabase Realtime hook.
 *
 * Architecturally: fetches the active project list once per poll cycle, then
 * batches a single GET /api/votes/batch?projectIds=... request to update the
 * vote map. Changes vs. the previous snapshot fire the same callbacks the
 * realtime version did, so RealtimeVotesProvider doesn't need to change.
 *
 * Trade-offs vs. realtime:
 *   - Up to 30s of lag for vote count visibility (acceptable for IlliniHunt)
 *   - Two HTTP requests per poll (list + batch); both are cheap reads
 *   - Project deletions detected by absence from successive polls
 */
export function useRealtimeVotes({
  onVoteCountChange,
  onUserVoteChange,
  onProjectDeleted,
  userId,
}: UseRealtimeVotesProps) {
  const [isConnected, setIsConnected] = useState(false)

  const onVoteCountChangeRef = useRef(onVoteCountChange)
  const onUserVoteChangeRef = useRef(onUserVoteChange)
  const onProjectDeletedRef = useRef(onProjectDeleted)

  useEffect(() => {
    onVoteCountChangeRef.current = onVoteCountChange
    onUserVoteChangeRef.current = onUserVoteChange
    onProjectDeletedRef.current = onProjectDeleted
  }, [onVoteCountChange, onUserVoteChange, onProjectDeleted])

  useEffect(() => {
    let cancelled = false
    const prevData = new Map<string, { count: number; hasVoted: boolean }>()

    const poll = async () => {
      try {
        const projectsResult = await apiResult<{ projects: Array<{ id: string }> }>(
          '/projects?limit=500',
        )
        if (cancelled) return
        if (projectsResult.error || !projectsResult.data) {
          setIsConnected(false)
          return
        }
        const ids = projectsResult.data.projects.map((p) => p.id)
        if (ids.length === 0) {
          setIsConnected(true)
          return
        }

        const votesResult = await apiResult<Record<string, { count: number; hasVoted: boolean }>>(
          `/votes/batch?projectIds=${ids.join(',')}`,
        )
        if (cancelled) return
        if (votesResult.error || !votesResult.data) {
          setIsConnected(false)
          return
        }

        const newIds = new Set<string>()
        for (const [id, val] of Object.entries(votesResult.data)) {
          newIds.add(id)
          const prev = prevData.get(id)
          prevData.set(id, val)
          if (!prev || prev.count !== val.count) {
            onVoteCountChangeRef.current?.({ projectId: id, newCount: val.count })
          }
          if (userId && prev && prev.hasVoted !== val.hasVoted) {
            onUserVoteChangeRef.current?.({ projectId: id, userId, hasVoted: val.hasVoted })
          }
        }
        // Detect deletions (in prev snapshot but not in current)
        for (const id of Array.from(prevData.keys())) {
          if (!newIds.has(id)) {
            prevData.delete(id)
            onProjectDeletedRef.current?.(id)
          }
        }
        setIsConnected(true)
      } catch {
        setIsConnected(false)
      }
    }

    poll() // immediate first poll
    const intervalId = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      setIsConnected(false)
    }
  }, [userId])

  return {
    isConnected,
    channels: [] as never[],
  }
}
