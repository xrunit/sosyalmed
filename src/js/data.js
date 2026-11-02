import { supabase } from '@/js/supabase.js';

export const PROFILE_COLORS = ['#075FEA', '#4D8CFF', '#7B9EFF', '#3054A8', '#38BDF8', '#92B7FF'];

const PROFILE_FIELDS = 'id,name,bio,color,avatar_url,created_at';
const POST_FIELDS = 'id,user_id,body,media_path,media_type,post_type,created_at';
const NOTIFICATION_FIELDS = 'id,user_id,actor_id,type,read,created_at';

export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signUp(email, password, name) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
  if (error) throw error;
  return data.session !== null;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function ensureProfile(userId, name) {
  const color = PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)];
  unwrap(
    await supabase
      .from('profiles')
      .upsert({ id: userId, name: name.slice(0, 24), color }, { onConflict: 'id', ignoreDuplicates: true }),
  );
}

export async function fetchProfile(userId) {
  return unwrap(await supabase.from('profiles').select(PROFILE_FIELDS).eq('id', userId).maybeSingle());
}

export async function fetchProfiles() {
  return unwrap(
    await supabase.from('profiles').select(PROFILE_FIELDS).order('created_at', { ascending: true }).limit(500),
  );
}

export async function updateProfile(userId, { name, bio, color, avatar_url }) {
  unwrap(await supabase.from('profiles').update({ name, bio, color, avatar_url }).eq('id', userId));
}

export async function fetchFollows() {
  return unwrap(await supabase.from('follows').select('follower_id,following_id').limit(5000));
}

export async function followUser(userId, targetId) {
  unwrap(await supabase.from('follows').insert({ follower_id: userId, following_id: targetId }));
}

export async function unfollowUser(userId, targetId) {
  unwrap(await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId));
}

export async function fetchNotifications(userId) {
  return unwrap(
    await supabase
      .from('notifications')
      .select(NOTIFICATION_FIELDS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
  );
}

export async function countUnreadNotifications(userId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationsRead(userId) {
  unwrap(await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false));
}

export async function fetchPosts(userId) {
  let query = supabase.from('posts').select(POST_FIELDS).order('created_at', { ascending: false }).limit(100);
  if (userId) query = query.eq('user_id', userId);
  return unwrap(await query);
}

export async function createPost(userId, body, media = {}) {
  unwrap(await supabase.from('posts').insert({ user_id: userId, body, ...media }));
}

export async function deletePost(postId) {
  unwrap(await supabase.from('posts').delete().eq('id', postId));
}

export function watch(channelName, table, filter, onChange) {
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, () => onChange())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
