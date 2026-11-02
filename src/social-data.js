import { supabase } from '@/js/supabase.js';
import { fetchProfiles, unwrap } from '@/js/data.js';

const MEDIA_BUCKET = 'post-media';
const POST_FIELDS = 'id,user_id,body,media_path,media_type,post_type,created_at';

export async function uploadMedia(file, userId) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']);
  if (!allowed.has(file.type)) throw new Error('Bu dosya türü desteklenmiyor.');
  if (file.size > 30 * 1024 * 1024) throw new Error('Dosya boyutu 30 MB sınırını aşamaz.');

  const extension = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl, type: file.type.startsWith('video/') ? 'video' : 'image' };
}

export async function removeMedia(path) {
  if (!path) return;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
  if (error) throw error;
}

export async function createSocialPost(userId, body, media, postType) {
  const { error } = await supabase.from('posts').insert({
    user_id: userId,
    body,
    media_path: media?.path ?? null,
    media_type: media?.type ?? null,
    post_type: postType,
  });
  if (error) throw error;
}

export async function fetchSocialPosts({ userId, postType, savedBy, viewerId } = {}) {
  let savedIds;
  if (savedBy) {
    const savedRows = unwrap(await supabase.from('saved_posts').select('post_id').eq('user_id', savedBy));
    savedIds = savedRows.map((row) => row.post_id);
    if (!savedIds.length) return [];
  }

  let query = supabase.from('posts').select(POST_FIELDS).order('created_at', { ascending: false }).limit(100);
  if (userId) query = query.eq('user_id', userId);
  if (postType) query = query.eq('post_type', postType);
  if (savedIds) query = query.in('id', savedIds);
  const posts = unwrap(await query);
  if (!posts.length) return [];

  const postIds = posts.map((post) => post.id);
  const authorIds = [...new Set(posts.map((post) => post.user_id))];
  const [profiles, likes, saves] = await Promise.all([
    fetchProfiles(),
    supabase.from('post_likes').select('post_id,user_id').in('post_id', postIds),
    supabase
      .from('saved_posts')
      .select('post_id')
      .eq('user_id', viewerId || '00000000-0000-0000-0000-000000000000')
      .in('post_id', postIds),
  ]);
  if (likes.error) throw likes.error;
  if (saves.error) throw saves.error;

  const profileMap = new Map(profiles.filter((profile) => authorIds.includes(profile.id)).map((profile) => [profile.id, profile]));
  const likesByPost = new Map();
  for (const row of likes.data) {
    const current = likesByPost.get(row.post_id) ?? { count: 0, likedByMe: false };
    current.count += 1;
    if (row.user_id === viewerId) current.likedByMe = true;
    likesByPost.set(row.post_id, current);
  }
  const savedSet = new Set(saves.data.map((row) => row.post_id));

  return posts.map((post) => {
    const mediaUrl = post.media_path
      ? supabase.storage.from(MEDIA_BUCKET).getPublicUrl(post.media_path).data.publicUrl
      : null;
    const engagement = likesByPost.get(post.id) ?? { count: 0, likedByMe: false };
    return {
      ...post,
      author: profileMap.get(post.user_id) ?? null,
      media_url: mediaUrl,
      like_count: engagement.count,
      liked_by_me: engagement.likedByMe,
      saved_by_me: savedSet.has(post.id),
    };
  });
}

export async function togglePostLike(postId, userId, isLiked) {
  const result = isLiked
    ? await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId)
    : await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
  if (result.error) throw result.error;
}

export async function toggleSavedPost(postId, userId, isSaved) {
  const result = isSaved
    ? await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', userId)
    : await supabase.from('saved_posts').insert({ post_id: postId, user_id: userId });
  if (result.error) throw result.error;
}

export async function fetchComments(postId) {
  const comments = unwrap(
    await supabase.from('post_comments').select('id,post_id,user_id,body,created_at').eq('post_id', postId).order('created_at'),
  );
  if (!comments.length) return [];
  const profiles = await fetchProfiles();
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  return comments.map((comment) => ({ ...comment, author: profileMap.get(comment.user_id) ?? null }));
}

export async function addComment(postId, userId, body) {
  const { error } = await supabase.from('post_comments').insert({ post_id: postId, user_id: userId, body });
  if (error) throw error;
}

export async function searchSocial(query) {
  const term = query.trim();
  if (!term) return { profiles: [], posts: [] };
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  const [profiles, posts] = await Promise.all([
    supabase.from('profiles').select('id,name,bio,color,avatar_url,created_at').ilike('name', pattern).limit(20),
    supabase.from('posts').select(POST_FIELDS).ilike('body', pattern).order('created_at', { ascending: false }).limit(30),
  ]);
  if (profiles.error) throw profiles.error;
  if (posts.error) throw posts.error;
  const authors = await fetchProfiles();
  const authorMap = new Map(authors.map((profile) => [profile.id, profile]));
  return {
    profiles: profiles.data,
    posts: posts.data.map((post) => ({
      ...post,
      author: authorMap.get(post.user_id) ?? null,
      media_url: post.media_path ? supabase.storage.from(MEDIA_BUCKET).getPublicUrl(post.media_path).data.publicUrl : null,
    })),
  };
}

export async function deleteSocialPost(post) {
  const { error } = await supabase.from('posts').delete().eq('id', post.id).eq('user_id', post.user_id);
  if (error) throw error;
  if (!post.media_path) return null;
  try {
    await removeMedia(post.media_path);
    return null;
  } catch (cleanupError) {
    return cleanupError instanceof Error ? cleanupError.message : 'Storage cleanup failed.';
  }
}
