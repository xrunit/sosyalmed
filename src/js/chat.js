import { supabase } from '@/js/supabase.js';
import { unwrap } from '@/js/data.js';

const CONVERSATION_FIELDS = 'id,kind,name,owner_id,is_public,created_at';
const MESSAGE_FIELDS = 'id,conversation_id,user_id,body,kind,reply_to,created_at';
const MEMBER_FIELDS = 'conversation_id,user_id,role,joined_at,last_read_at';
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

async function callRpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

export async function fetchMyConversations(userId) {
  const rows = unwrap(
    await supabase
      .from('conversation_members')
      .select(`role,last_read_at,conversations(${CONVERSATION_FIELDS})`)
      .eq('user_id', userId),
  );
  return rows
    .filter((row) => row.conversations)
    .map((row) => ({ conversation: row.conversations, role: row.role, lastReadAt: row.last_read_at }));
}

export async function fetchMembers(conversationIds) {
  if (!conversationIds.length) return [];
  return unwrap(
    await supabase.from('conversation_members').select(MEMBER_FIELDS).in('conversation_id', conversationIds),
  );
}

export async function fetchPublicGroups() {
  return unwrap(
    await supabase
      .from('conversations')
      .select(CONVERSATION_FIELDS)
      .eq('kind', 'group')
      .eq('is_public', true),
  );
}

export async function fetchLatestMessages(conversationIds) {
  if (!conversationIds.length) return [];
  return unwrap(
    await supabase
      .from('messages')
      .select(MESSAGE_FIELDS)
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(300),
  );
}

export async function fetchMessages(conversationId) {
  const rows = unwrap(
    await supabase
      .from('messages')
      .select(MESSAGE_FIELDS)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(200),
  );
  return rows.reverse();
}

export async function fetchReactions(messageIds) {
  if (!messageIds.length) return [];
  return unwrap(
    await supabase.from('message_reactions').select('message_id,user_id,emoji').in('message_id', messageIds),
  );
}

export async function searchMessages(conversationIds, query) {
  if (!conversationIds.length) return [];
  const pattern = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  return unwrap(
    await supabase
      .from('messages')
      .select(MESSAGE_FIELDS)
      .in('conversation_id', conversationIds)
      .eq('kind', 'user')
      .ilike('body', pattern)
      .order('created_at', { ascending: false })
      .limit(30),
  );
}

export async function sendMessage(userId, conversationId, body, replyTo) {
  unwrap(
    await supabase.from('messages').insert({
      user_id: userId,
      conversation_id: conversationId,
      body,
      reply_to: replyTo ?? null,
    }),
  );
}

export async function deleteMessage(messageId) {
  unwrap(await supabase.from('messages').delete().eq('id', messageId));
}

export async function toggleReaction(messageId, userId, emoji) {
  const removed = unwrap(
    await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji)
      .select('emoji'),
  );
  if (!removed.length) {
    unwrap(await supabase.from('message_reactions').insert({ message_id: messageId, user_id: userId, emoji }));
  }
}

export async function markRead(conversationId, userId) {
  unwrap(
    await supabase
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId),
  );
}

export function openDm(peerId) {
  return callRpc('open_dm', { peer: peerId });
}

export function createGroup(name, memberIds) {
  return callRpc('create_group', { group_name: name, member_ids: memberIds });
}

export function addGroupMembers(groupId, memberIds) {
  return callRpc('add_group_members', { gid: groupId, member_ids: memberIds });
}

export function removeGroupMember(groupId, memberId) {
  return callRpc('remove_group_member', { gid: groupId, target: memberId });
}

export function setGroupMemberRole(groupId, memberId, role) {
  return callRpc('set_group_member_role', { gid: groupId, target: memberId, new_role: role });
}

export function renameGroup(groupId, name) {
  return callRpc('rename_group', { gid: groupId, new_name: name });
}

export function setGroupPublic(groupId, isPublic) {
  return callRpc('set_group_public', { gid: groupId, pub: isPublic });
}

export function leaveGroup(groupId) {
  return callRpc('leave_group', { gid: groupId });
}

export function joinPublicGroup(groupId) {
  return callRpc('join_public_group', { gid: groupId });
}
