import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Send, X } from 'lucide-react'
import type { Comment } from '@/types'
import { useAuthStore } from '@/store/authStore'
import { commentsApi } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'

interface CommentsDialogProps {
  postId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommentsDialog({ postId, open, onOpenChange }: CommentsDialogProps) {
  const { user, profile } = useAuthStore()
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      loadComments()
    }
  }, [open, postId])

  const loadComments = async () => {
    setLoading(true)
    try {
      const data = await commentsApi.getComments(postId)
      setComments(data)
    } catch (error) {
      console.error('Error loading comments:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newComment.trim() || submitting) return

    setSubmitting(true)
    const commentText = newComment.trim()
    setNewComment('')

    try {
      const newCommentData = await commentsApi.createComment(postId, user.id, commentText)
      setComments((prev) => [...prev, newCommentData])
      // Trigger a refresh to update comment count on parent
      window.dispatchEvent(new CustomEvent('comment-added'))
    } catch (error) {
      console.error('Error creating comment:', error)
      alert('Failed to post comment')
      setNewComment(commentText)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return

    try {
      await commentsApi.deleteComment(commentId)
      setComments((prev) => prev.filter((c) => c.id !== commentId))
      window.dispatchEvent(new CustomEvent('comment-deleted'))
    } catch (error) {
      console.error('Error deleting comment:', error)
      alert('Failed to delete comment')
    }
  }

  const getInitials = (name: string | null) => {
    if (!name) return 'U'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Comments</DialogTitle>
        </DialogHeader>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start space-x-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No comments yet. Be the first to comment!
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex items-start space-x-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={comment.profile?.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {getInitials(comment.profile?.full_name ?? comment.profile?.username ?? null)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm">{comment.profile?.username}</span>
                      <span className="ml-2 text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {user?.id === comment.user_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(comment.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm mt-1">{comment.content}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Comment Form */}
        {user && (
          <form onSubmit={handleSubmit} className="flex items-end space-x-2 pt-4 border-t">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback>
                {getInitials(profile?.full_name ?? profile?.username ?? null)}
              </AvatarFallback>
            </Avatar>
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 min-h-[60px] resize-none"
              disabled={submitting}
            />
            <Button type="submit" size="icon" disabled={!newComment.trim() || submitting}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

