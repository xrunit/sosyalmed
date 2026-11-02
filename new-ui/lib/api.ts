import { supabase } from './supabase'
import type { Profile, Post, Comment } from '@/types'

// ============================================
// PROFILES API
// ============================================

export const profilesApi = {
  async getProfile(userId: string): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (error) throw error
    return data
  },

  async getProfileByUsername(username: string): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()
    
    if (error) throw error
    return data
  },

  async updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async uploadAvatar(userId: string, file: File): Promise<string> {
    const fileExt = file.name.split('.').pop()
    const fileName = `${userId}-${Math.random()}.${fileExt}`
    const filePath = `avatars/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })

    if (uploadError) throw uploadError

    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    return data.publicUrl
  },
}

// ============================================
// POSTS API
// ============================================

export const postsApi = {
  async getPosts(limit = 10, offset = 0, userId?: string): Promise<Post[]> {
    const { data: userData } = await supabase.auth.getUser()
    const currentUserId = userData?.user?.id

    let query = supabase
      .from('posts')
      .select(`
        *,
        profile:profiles(*)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query

    if (error) throw error

    if (!data || data.length === 0) return []

    // Get all post IDs
    const postIds = data.map((post: any) => post.id)

    // Get likes counts for all posts in one query
    const { data: likesData } = await supabase
      .from('likes')
      .select('post_id')
      .in('post_id', postIds)

    // Get comments counts for all posts
    const { data: commentsData } = await supabase
      .from('comments')
      .select('post_id')
      .in('post_id', postIds)

    // Get user's likes in one query
    let userLikes: string[] = []
    if (currentUserId) {
      const { data: userLikesData } = await supabase
        .from('likes')
        .select('post_id')
        .in('post_id', postIds)
        .eq('user_id', currentUserId)
      
      userLikes = (userLikesData || []).map((like: any) => like.post_id)
    }

    // Count likes and comments per post
    const likesCountMap = new Map<string, number>()
    const commentsCountMap = new Map<string, number>()

    ;(likesData || []).forEach((like: any) => {
      likesCountMap.set(like.post_id, (likesCountMap.get(like.post_id) || 0) + 1)
    })

    ;(commentsData || []).forEach((comment: any) => {
      commentsCountMap.set(comment.post_id, (commentsCountMap.get(comment.post_id) || 0) + 1)
    })

    // Map posts with counts
    return data.map((post: any) => ({
      ...post,
      likes_count: likesCountMap.get(post.id) || 0,
      comments_count: commentsCountMap.get(post.id) || 0,
      is_liked: userLikes.includes(post.id),
    }))
  },

  async getPost(postId: string): Promise<Post> {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profile:profiles(*)
      `)
      .eq('id', postId)
      .single()

    if (error) throw error

    const { data: userData } = await supabase.auth.getUser()
    const currentUserId = userData?.user?.id

    // Get counts
    const { count: likesCount } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId)

    const { count: commentsCount } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId)

    // Check if liked
    let isLiked = false
    if (currentUserId) {
      const { data: likeData } = await supabase
        .from('likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', currentUserId)
        .single()
      isLiked = !!likeData
    }

    return {
      ...data,
      likes_count: likesCount || 0,
      comments_count: commentsCount || 0,
      is_liked: isLiked,
    }
  },

  async createPost(userId: string, imageUrl: string, caption: string | null): Promise<Post> {
    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        image_url: imageUrl,
        caption,
      })
      .select(`
        *,
        profile:profiles(*)
      `)
      .single()

    if (error) throw error
    return { ...data, likes_count: 0, comments_count: 0, is_liked: false }
  },

  async deletePost(postId: string): Promise<void> {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)

    if (error) throw error
  },

  async uploadPostImage(userId: string, file: File): Promise<string> {
    const fileExt = file.name.split('.').pop()
    const fileName = `${userId}-${Date.now()}.${fileExt}`
    const filePath = `posts/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('posts')
      .upload(filePath, file)

    if (uploadError) throw uploadError

    const { data } = supabase.storage
      .from('posts')
      .getPublicUrl(filePath)

    return data.publicUrl
  },
}

// ============================================
// LIKES API
// ============================================

export const likesApi = {
  async likePost(postId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('likes')
      .insert({ post_id: postId, user_id: userId })

    if (error) throw error
  },

  async unlikePost(postId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId)

    if (error) throw error
  },

  async isLiked(postId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return !!data
  },
}

// ============================================
// COMMENTS API
// ============================================

export const commentsApi = {
  async getComments(postId: string): Promise<Comment[]> {
    const { data, error } = await supabase
      .from('comments')
      .select(`
        *,
        profile:profiles(*)
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return data
  },

  async createComment(postId: string, userId: string, content: string): Promise<Comment> {
    const { data, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: userId,
        content,
      })
      .select(`
        *,
        profile:profiles(*)
      `)
      .single()

    if (error) throw error
    return data
  },

  async deleteComment(commentId: string): Promise<void> {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)

    if (error) throw error
  },
}

// ============================================
// FOLLOWS API
// ============================================

export const followsApi = {
  async followUser(followerId: string, followingId: string): Promise<void> {
    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: followerId, following_id: followingId })

    if (error) throw error
  },

  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingId)

    if (error) throw error
  },

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return !!data
  },

  async getFollowersCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId)

    if (error) throw error
    return count || 0
  },

  async getFollowingCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId)

    if (error) throw error
    return count || 0
  },

  async getPostsCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    if (error) throw error
    return count || 0
  },
}

