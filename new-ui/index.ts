import { useState, useEffect } from 'react'
import InfiniteScroll from 'react-infinite-scroll-component'
import type { Post } from '@/types'
import { postsApi } from '@/lib/api'
import { PostCard } from '@/components/PostCard'
import { Skeleton } from '@/components/ui/skeleton'
import STORYIMAGE from '@/assets/download (2).jpg'
import STORYIMAGES1 from '@/assets/485a0101007cd39acfb3fbeeefcc1075.jpg'
import STORYIMAGES2 from '@/assets/front-view-man-posing-indoors_23-2149883570.avif'
import STORYIMAGES3 from '@/assets/medium-shot-old-woman-beach_23-2148442032.avif'
import STORYIMAGES4 from '@/assets/smiling-young-girl-with-american-flag-nature.jpg'
import STORYIMAGES5 from '@/assets/images.jpeg'
export default function Feed() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)
  const postsPerPage = 10

  const loadPosts = async (pageNum: number, reset = false) => {
    try {
      const newPosts = await postsApi.getPosts(postsPerPage, pageNum * postsPerPage)

      if (reset) {
        setPosts(newPosts)
      } else {
        setPosts((prev) => [...prev, ...newPosts])
      }

      setHasMore(newPosts.length === postsPerPage)
    } catch (error) {
      console.error('Error loading posts:', error)
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPosts(0, true)

    // Listen for comment changes to refresh posts
    const handleCommentChange = () => {
      loadPosts(0, true)
    }
    window.addEventListener('comment-added', handleCommentChange)
    window.addEventListener('comment-deleted', handleCommentChange)

    return () => {
      window.removeEventListener('comment-added', handleCommentChange)
      window.removeEventListener('comment-deleted', handleCommentChange)
    }
  }, [])

  const fetchMorePosts = () => {
    const nextPage = page + 1
    setPage(nextPage)
    loadPosts(nextPage, false)
  }

  const handlePostDelete = () => {
    loadPosts(0, true)
  }

  if (loading && posts.length === 0) {
    return (
      <div className="space-y-8">
        {[1, 2, 3].map((i) => (
          <PostSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (posts.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-xl font-semibold text-muted-foreground mb-2">No posts yet</p>
        <p className="text-muted-foreground">Be the first to share something!</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex gap-4 w-full overflow-x-auto py-2">
        {/* Instagram-style gradient story rings. Replace `src` with real avatar URLs. */}
        <div className='flex justify-center w-full gap-3'>{[STORYIMAGE,STORYIMAGES1,STORYIMAGES2,STORYIMAGES3,STORYIMAGES4,STORYIMAGES5].map((_, i) => (
          <StoryAvatar src={_} key={i} />
        ))}</div>
      </div>
      <div id="feed-scroll-container" className="h-auto lg:h-[500px] overflow-auto">
        <InfiniteScroll
          scrollableTarget="feed-scroll-container"
          dataLength={posts.length}
          next={fetchMorePosts}
          hasMore={hasMore}
          loader={
            <div className="space-y-8 mt-8">
              {[1, 2].map((i) => (
                <PostSkeleton key={i} />
              ))}
            </div>
          }
          endMessage={
            <div className="text-center py-8 text-muted-foreground">
              <p>You've seen all posts!</p>
            </div>
          }
        >
          <div className="">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onDelete={handlePostDelete} />
            ))}
          </div>
        </InfiniteScroll>
      </div>
    </>


  )
}

function PostSkeleton() {
  return (
    <article className="rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center space-x-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </div>
      <Skeleton className="aspect-square w-full" />
      <div className="p-4 space-y-2">
        <div className="flex space-x-4">
          <Skeleton className="h-6 w-6" />
          <Skeleton className="h-6 w-6" />
        </div>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-32" />
      </div>
    </article>
  )
}

function StoryAvatar({ src }: { src?: string }) {
  return (
    <div className="w-[50px] h-[50px] p-[2px] rounded-full bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#962fbf]">
      <div className="bg-white rounded-full w-full h-full overflow-hidden shadow-sm">
        {src ? (
          <img src={src} alt="story" className="w-full h-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground">
            <img
              src={STORYIMAGE}
              alt="default avatar"
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>
    </div>
  )
}
