export interface Profile {
  id: string
  username: string
  full_name: string | null
  bio: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Post {
  id: string
  user_id: string
  image_url: string
  caption: string | null
  created_at: string
  updated_at: string
  profile?: Profile
  likes_count?: number
  comments_count?: number
  is_liked?: boolean
}

export interface Like {
  id: string
  post_id: string
  user_id: string
  created_at: string
}

export interface Comment {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
  profile?: Profile
}

export interface Follow {
  id: string
  follower_id: string
  following_id: string
  created_at: string
}

