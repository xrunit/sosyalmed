import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Heart, MessageCircle, MoreVertical, Bookmark } from 'lucide-react'
import type { Post } from '@/types'
import { useAuthStore } from '@/store/authStore'
import { likesApi, postsApi } from '@/lib/api'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CommentsDialog } from './CommentsDialog'

interface PostCardProps {
  post: Post
  onDelete?: () => void
}

export function PostCard({ post, onDelete }: PostCardProps) {
  const { user } = useAuthStore()
  const [isLiked, setIsLiked] = useState(post.is_liked || false)
  const [likesCount, setLikesCount] = useState(post.likes_count || 0)
  const [isLiking, setIsLiking] = useState(false)
  const [showComments, setShowComments] = useState(false)

  const isOwnPost = user?.id === post.user_id

  const handleLike = async () => {
    if (!user || isLiking) return

    setIsLiking(true)
    const previousLiked = isLiked
    const previousCount = likesCount

    // Optimistic update
    setIsLiked(!isLiked)
    setLikesCount(isLiked ? likesCount - 1 : likesCount + 1)

    try {
      if (previousLiked) {
        await likesApi.unlikePost(post.id, user.id)
      } else {
        await likesApi.likePost(post.id, user.id)
      }
    } catch (error) {
      // Revert on error
      setIsLiked(previousLiked)
      setLikesCount(previousCount)
      console.error('Error toggling like:', error)
    } finally {
      setIsLiking(false)
    }
  }

  const handleDelete = async () => {
    if (!isOwnPost || !onDelete) return
    if (!confirm('Are you sure you want to delete this post?')) return

    try {
      await postsApi.deletePost(post.id)
      onDelete()
    } catch (error) {
      console.error('Error deleting post:', error)
      alert('Failed to delete post')
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
    <>
      <article className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6 max-w-[470px] w-full mx-auto shadow-md">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5">
          <Link
            to={`/profile/${post.profile?.username}`}
            className="flex items-center gap-3 flex-1 min-w-0"
          >
            <Avatar className="h-8 w-8 ring-2 ring-offset-1 ring-gray-100">
              <AvatarImage
                // src={post.profile?.avatar_url}
                alt={post.profile?.username}
              />
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xs font-semibold">
                {getInitials(
                  post.profile?.full_name ?? post.profile?.username ?? null
                )}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-sm text-gray-900 hover:text-gray-600 transition-colors truncate">
                {post.profile?.username}
              </span>
              {post.profile?.full_name && (
                <span className="text-xs text-gray-500 truncate">
                  {post.profile.full_name}
                </span>
              )}
            </div>
          </Link>

          {isOwnPost && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-700 hover:text-gray-900"
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-red-600 focus:text-red-600 font-semibold cursor-pointer"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Image Container - Fixed aspect ratio like Instagram */}
        <div className="relative w-full bg-black">
          <img
            src={post.image_url}
            alt={post.caption || 'Post image'}
            className="w-full h-auto object-contain max-h-[585px]"
            style={{ display: 'block' }}
          />
        </div>

        {/* Actions Bar */}
        <div className="px-3 pt-2 pb-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLike}
                disabled={!user || isLiking}
                className={`h-9 w-9 hover:bg-transparent hover:scale-110 transition-transform ${
                  isLiked ? 'text-red-500' : 'text-gray-900'
                }`}
              >
                <Heart
                  className={`h-6 w-6 ${isLiked ? 'fill-current' : ''}`}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowComments(true)}
                disabled={!user}
                className="h-9 w-9 hover:bg-transparent hover:scale-110 transition-transform text-gray-900"
              >
                <MessageCircle className="h-6 w-6" />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 hover:bg-transparent hover:scale-110 transition-transform text-gray-900"
            >
              <Bookmark className="h-6 w-6" />
            </Button>
          </div>
        </div>

        {/* Likes Count */}
        {likesCount > 0 && (
          <div className="px-3 pb-2">
            <button className="font-semibold text-sm text-gray-900 hover:text-gray-600">
              {likesCount.toLocaleString()}{' '}
              {likesCount === 1 ? 'like' : 'likes'}
            </button>
          </div>
        )}

        {/* Caption */}
        {post.caption && (
          <div className="px-3 pb-2">
            <div className="text-sm">
              <Link
                to={`/profile/${post.profile?.username}`}
                className="font-semibold text-gray-900 hover:text-gray-600 mr-2"
              >
                {post.profile?.username}
              </Link>
              <span className="text-gray-900">{post.caption}</span>
            </div>
          </div>
        )}

        {/* View Comments */}
        {post.comments_count !== undefined && post.comments_count > 0 && (
          <button
            onClick={() => setShowComments(true)}
            className="px-3 pb-2 text-sm text-gray-500 hover:text-gray-700 w-full text-left"
          >
            View all {post.comments_count}{' '}
            {post.comments_count === 1 ? 'comment' : 'comments'}
          </button>
        )}

        {/* Timestamp */}
        <div className="px-3 pb-3">
          <time className="text-xs text-gray-500 uppercase">
            {formatDistanceToNow(new Date(post.created_at), {
              addSuffix: true,
            })}
          </time>
        </div>
      </article>

      {showComments && (
        <CommentsDialog
          postId={post.id}
          open={showComments}
          onOpenChange={setShowComments}
        />
      )}
    </>
  )
}