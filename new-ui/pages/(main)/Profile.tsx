import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { profilesApi, postsApi, followsApi } from '@/lib/api'
import type { Profile, Post } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Settings, UserPlus, UserMinus } from 'lucide-react'

export default function Profile() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const { user, profile: currentProfile, fetchProfile } = useAuthStore()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [postsCount, setPostsCount] = useState(0)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)

  const isOwnProfile = currentProfile?.username === username || profile?.id === user?.id

  useEffect(() => {
    if (username) {
      loadProfile()
    }
  }, [username])

  const loadProfile = async () => {
    if (!username) return

    setLoading(true)
    try {
      const profileData = await profilesApi.getProfileByUsername(username)
      setProfile(profileData)

      // Load user posts
      const userPosts = await postsApi.getPosts(20, 0, profileData.id)
      setPosts(userPosts)

      // Load counts
      const [postsCountData, followersCountData, followingCountData] = await Promise.all([
        followsApi.getPostsCount(profileData.id),
        followsApi.getFollowersCount(profileData.id),
        followsApi.getFollowingCount(profileData.id),
      ])
      setPostsCount(postsCountData)
      setFollowersCount(followersCountData)
      setFollowingCount(followingCountData)

      // Check if following (if not own profile)
      if (user && profileData.id !== user.id) {
        const following = await followsApi.isFollowing(user.id, profileData.id)
        setIsFollowing(following)
      }
    } catch (error) {
      console.error('Error loading profile:', error)
      navigate('/')
    } finally {
      setLoading(false)
    }
  }

  const handleFollow = async () => {
    if (!user || !profile || isOwnProfile) return

    const previousFollowing = isFollowing
    const previousCount = followersCount

    // Optimistic update
    setIsFollowing(!isFollowing)
    setFollowersCount(isFollowing ? followersCount - 1 : followersCount + 1)

    try {
      if (previousFollowing) {
        await followsApi.unfollowUser(user.id, profile.id)
      } else {
        await followsApi.followUser(user.id, profile.id)
      }
    } catch (error) {
      // Revert on error
      setIsFollowing(previousFollowing)
      setFollowersCount(previousCount)
      console.error('Error toggling follow:', error)
      alert('Failed to update follow status')
    }
  }

  const handleEditProfile = async (formData: {
    username: string
    full_name: string
    bio: string
    avatar?: File
  }) => {
    if (!user || !profile) return

    setEditLoading(true)
    try {
      let avatarUrl = profile.avatar_url

      if (formData.avatar) {
        avatarUrl = await profilesApi.uploadAvatar(user.id, formData.avatar)
      }

      await profilesApi.updateProfile(user.id, {
        username: formData.username,
        full_name: formData.full_name || null,
        bio: formData.bio || null,
        avatar_url: avatarUrl || null,
      })

      // Refresh profile
      await fetchProfile(user.id)
      await loadProfile()
      setIsEditDialogOpen(false)

      // Update URL if username changed
      if (formData.username !== profile.username) {
        navigate(`/profile/${formData.username}`, { replace: true })
      }
    } catch (error: any) {
      console.error('Error updating profile:', error)
      alert(error.message || 'Failed to update profile')
    } finally {
      setEditLoading(false)
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

  if (loading) {
    return <ProfileSkeleton />
  }

  if (!profile) {
    return (
      <div className="text-center py-16">
        <p className="text-xl font-semibold text-muted-foreground">Profile not found</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-8">
        {/* Profile Header */}
        <div className="flex flex-col md:flex-row gap-8">
          <Avatar className="h-24 w-24 md:h-32 md:w-32 mx-auto md:mx-0">
            <AvatarImage src={profile.avatar_url || undefined} alt={profile.username} />
            <AvatarFallback className="text-2xl">
              {getInitials(profile.full_name || profile.username)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <h1 className="text-2xl md:text-3xl font-bold">{profile.username}</h1>
              <div className="flex gap-2">
                {isOwnProfile ? (
                  <Button onClick={() => setIsEditDialogOpen(true)} variant="outline">
                    <Settings className="mr-2 h-4 w-4" />
                    Edit Profile
                  </Button>
                ) : (
                  <Button
                    onClick={handleFollow}
                    variant={isFollowing ? 'outline' : 'default'}
                  >
                    {isFollowing ? (
                      <>
                        <UserMinus className="mr-2 h-4 w-4" />
                        Unfollow
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Follow
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-6">
              <div>
                <span className="font-semibold">{postsCount}</span>
                <span className="text-muted-foreground ml-1">posts</span>
              </div>
              <div>
                <span className="font-semibold">{followersCount}</span>
                <span className="text-muted-foreground ml-1">followers</span>
              </div>
              <div>
                <span className="font-semibold">{followingCount}</span>
                <span className="text-muted-foreground ml-1">following</span>
              </div>
            </div>

            {/* Bio */}
            {profile.full_name && (
              <p className="font-semibold">{profile.full_name}</p>
            )}
            {profile.bio && (
              <p className="whitespace-pre-line">{profile.bio}</p>
            )}
          </div>
        </div>

        {/* Posts Grid */}
        <div>
          {posts.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-xl font-semibold text-muted-foreground">No posts yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {posts.map((post) => (
                <div key={post.id} className="relative aspect-square group cursor-pointer">
                  <img
                    src={post.image_url}
                    alt={post.caption || 'Post'}
                    className="h-full w-full object-cover rounded-lg"
                    onClick={() => navigate(`/post/${post.id}`)}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-6">
                    <div className="text-white font-semibold flex items-center gap-2">
                      <span>❤️</span>
                      <span>{post.likes_count || 0}</span>
                    </div>
                    <div className="text-white font-semibold flex items-center gap-2">
                      <span>💬</span>
                      <span>{post.comments_count || 0}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Profile Dialog */}
      {isOwnProfile && (
        <EditProfileDialog
          profile={profile}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSave={handleEditProfile}
          loading={editLoading}
        />
      )}
    </>
  )
}

interface EditProfileDialogProps {
  profile: Profile
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: { username: string; full_name: string; bio: string; avatar?: File }) => Promise<void>
  loading: boolean
}

function EditProfileDialog({ profile, open, onOpenChange, onSave, loading }: EditProfileDialogProps) {
  const [username, setUsername] = useState(profile.username)
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setUsername(profile.username)
      setFullName(profile.full_name || '')
      setBio(profile.bio || '')
      setAvatarPreview(profile.avatar_url || null)
      setAvatar(null)
    }
  }, [open, profile])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatar(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSave({
      username,
      full_name: fullName,
      bio,
      avatar: avatar || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Avatar */}
          <div className="flex flex-col items-center space-y-2">
            <Avatar className="h-24 w-24">
              <AvatarImage src={avatarPreview || undefined} />
              <AvatarFallback>
                {fullName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) || 'U'}
              </AvatarFallback>
            </Avatar>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Change Photo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              disabled={loading}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ProfileSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row gap-8">
        <Skeleton className="h-32 w-32 rounded-full mx-auto md:mx-0" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-6">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="aspect-square" />
        ))}
      </div>
    </div>
  )
}

