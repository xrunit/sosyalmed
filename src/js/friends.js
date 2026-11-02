import { supabase } from '@/js/supabase.js';
import { unwrap } from '@/js/data.js';

export async function fetchFriendships() {
  return unwrap(await supabase.from('friendships').select('user_low,user_high,requested_by,status').limit(5000));
}

export async function friendAction(peerId, action) {
  const { data, error } = await supabase.rpc('friend_action', { peer: peerId, action });
  if (error) throw error;
  return data;
}

export function friendStatus(friendships, meId, otherId) {
  const row = friendships.find(
    (f) =>
      (f.user_low === meId && f.user_high === otherId) || (f.user_low === otherId && f.user_high === meId),
  );
  if (!row) return { state: 'none' };
  if (row.status === 'accepted') return { state: 'friends' };
  return row.requested_by === meId ? { state: 'sent' } : { state: 'received' };
}

export function acceptedFriendIds(friendships, meId) {
  return friendships
    .filter((f) => f.status === 'accepted')
    .map((f) => (f.user_low === meId ? f.user_high : f.user_low));
}
