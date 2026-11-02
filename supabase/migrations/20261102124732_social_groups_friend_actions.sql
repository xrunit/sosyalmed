/*
# Friend requests, group management and automatic direct messages

## 1. Summary
Adds the server-side actions for friend requests, group creation and management, leaving groups, and direct messages that open automatically when two people follow each other. The app calls these actions instead of writing to the tables directly, so every rule is enforced in the database.

## 2. New server actions
- `friend_action(peer, action)`: send, accept, decline, cancel or remove a friend request.
- `create_group(name, member_ids)`: create a group. Members must be accepted friends.
- `add_group_members(group, member_ids)`: owners and admins add friends to a group.
- `remove_group_member(group, member)`: owners and admins remove a member. Admins cannot remove other admins.
- `set_group_member_role(group, member, role)`: only the owner makes someone an admin or takes that role away.
- `rename_group(group, name)`: owners and admins rename a group.
- `set_group_public(group, is_public)`: only the owner changes whether a group is open to everyone.
- `leave_group(group)`: removes the user from the group. If the owner leaves, the next admin (or earliest member) becomes owner. A system note "Name çıktı" is posted.
- `join_public_group(group)`: join an open group.
- `open_dm(peer)`: opens a direct message. Requires mutual follow.

## 3. Automatic actions
- When two people follow each other, their direct message opens automatically.
- Friend requests, acceptances and group additions create notifications.

## 4. Security
- All server actions check the signed-in user and their role inside the database.
- The helper functions cannot be called by the app directly.
- Direct messages can only be sent between users who follow each other. Group messages only by current members.
- Notification types are extended to include friend requests, friend acceptances and group additions.

## 5. Notes
- Existing "Genel" group, messages and follows are kept.
- Friend requests and follows are separate: friends are needed for groups, mutual follow is needed for direct messages.
*/

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('follow', 'friend_request', 'friend_accept', 'group_add'));

DROP POLICY IF EXISTS messages_insert_member_self ON public.messages;
CREATE POLICY messages_insert_member_self ON public.messages FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND kind = 'user'
    AND public.is_conversation_member(conversation_id)
    AND (
      EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.kind = 'group')
      OR EXISTS (
        SELECT 1
        FROM public.conversation_members m
        WHERE m.conversation_id = messages.conversation_id
          AND m.user_id <> auth.uid()
          AND EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.following_id = m.user_id)
          AND EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = m.user_id AND f.following_id = auth.uid())
      )
    )
  );

CREATE OR REPLACE FUNCTION public.are_friends(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted' AND f.user_low = LEAST(a, b) AND f.user_high = GREATEST(a, b)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.friend_action(peer uuid, action text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  lo uuid;
  hi uuid;
  current_row public.friendships%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF peer IS NULL OR peer = me THEN
    RAISE EXCEPTION 'invalid peer' USING ERRCODE = '22023';
  END IF;
  IF action NOT IN ('request', 'accept', 'decline', 'cancel', 'remove') THEN
    RAISE EXCEPTION 'invalid action' USING ERRCODE = '22023';
  END IF;

  lo := LEAST(me, peer);
  hi := GREATEST(me, peer);
  SELECT * INTO current_row FROM public.friendships f WHERE f.user_low = lo AND f.user_high = hi;

  IF NOT FOUND THEN
    IF action <> 'request' THEN
      RAISE EXCEPTION 'no friendship' USING ERRCODE = 'P0002';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = peer) THEN
      RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.friendships (user_low, user_high, requested_by, status)
    VALUES (lo, hi, me, 'pending');
    RETURN 'pending';
  END IF;

  IF current_row.status = 'accepted' THEN
    IF action = 'remove' THEN
      DELETE FROM public.friendships WHERE user_low = lo AND user_high = hi;
      RETURN 'none';
    END IF;
    IF action = 'request' THEN
      RETURN 'accepted';
    END IF;
    RAISE EXCEPTION 'no pending request' USING ERRCODE = 'P0002';
  END IF;

  IF action = 'request' THEN
    IF current_row.requested_by = me THEN
      RETURN 'pending';
    END IF;
    UPDATE public.friendships SET status = 'accepted', responded_at = now() WHERE user_low = lo AND user_high = hi;
    RETURN 'accepted';
  END IF;

  IF action = 'accept' AND current_row.requested_by <> me THEN
    UPDATE public.friendships SET status = 'accepted', responded_at = now() WHERE user_low = lo AND user_high = hi;
    RETURN 'accepted';
  END IF;

  IF action = 'decline' AND current_row.requested_by <> me THEN
    DELETE FROM public.friendships WHERE user_low = lo AND user_high = hi;
    RETURN 'none';
  END IF;

  IF action IN ('cancel', 'remove') AND current_row.requested_by = me THEN
    DELETE FROM public.friendships WHERE user_low = lo AND user_high = hi;
    RETURN 'none';
  END IF;

  RAISE EXCEPTION 'no pending request' USING ERRCODE = 'P0002';
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_friendship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  other uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    other := CASE WHEN NEW.requested_by = NEW.user_low THEN NEW.user_high ELSE NEW.user_low END;
    INSERT INTO public.notifications (user_id, actor_id, type) VALUES (other, NEW.requested_by, 'friend_request');
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    other := CASE WHEN NEW.requested_by = NEW.user_low THEN NEW.user_high ELSE NEW.user_low END;
    INSERT INTO public.notifications (user_id, actor_id, type) VALUES (NEW.requested_by, other, 'friend_accept');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_on_friendship() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS friendships_notify ON public.friendships;
CREATE TRIGGER friendships_notify AFTER INSERT OR UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_friendship();

CREATE OR REPLACE FUNCTION public.ensure_dm(a uuid, b uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key text := LEAST(a::text, b::text) || '_' || GREATEST(a::text, b::text);
  cid uuid;
BEGIN
  INSERT INTO public.conversations (kind, dm_key, created_by)
  VALUES ('dm', key, a)
  ON CONFLICT (dm_key) DO NOTHING
  RETURNING id INTO cid;

  IF cid IS NOT NULL THEN
    INSERT INTO public.conversation_members (conversation_id, user_id) VALUES (cid, a), (cid, b);
  ELSE
    SELECT id INTO cid FROM public.conversations WHERE dm_key = key;
  END IF;

  RETURN cid;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ensure_dm(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.open_dm(peer uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF peer IS NULL OR peer = me THEN
    RAISE EXCEPTION 'invalid peer' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.follows WHERE follower_id = me AND following_id = peer)
    AND EXISTS (SELECT 1 FROM public.follows WHERE follower_id = peer AND following_id = me)
  ) THEN
    RAISE EXCEPTION 'mutual follow required' USING ERRCODE = '42501';
  END IF;
  RETURN public.ensure_dm(me, peer);
END;
$$;

CREATE OR REPLACE FUNCTION public.open_dm_on_mutual_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.follows WHERE follower_id = NEW.following_id AND following_id = NEW.follower_id) THEN
    PERFORM public.ensure_dm(NEW.follower_id, NEW.following_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.open_dm_on_mutual_follow() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS follows_open_dm_on_mutual ON public.follows;
CREATE TRIGGER follows_open_dm_on_mutual AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.open_dm_on_mutual_follow();

CREATE OR REPLACE FUNCTION public.create_group(group_name text, member_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  gname text := btrim(group_name);
  cid uuid;
  my_name text;
  member_id uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF char_length(gname) < 1 OR char_length(gname) > 30 THEN
    RAISE EXCEPTION 'invalid group name' USING ERRCODE = '22023';
  END IF;
  IF cardinality(coalesce(member_ids, '{}')) > 49 THEN
    RAISE EXCEPTION 'too many members' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO my_name FROM public.profiles WHERE id = me;

  INSERT INTO public.conversations (kind, name, owner_id, created_by)
  VALUES ('group', gname, me, me)
  RETURNING id INTO cid;
  INSERT INTO public.conversation_members (conversation_id, user_id, role) VALUES (cid, me, 'owner');

  FOREACH member_id IN ARRAY coalesce(member_ids, '{}') LOOP
    CONTINUE WHEN member_id = me;
    IF NOT public.are_friends(me, member_id) THEN
      RAISE EXCEPTION 'only friends can be added' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (cid, member_id, 'member')
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      INSERT INTO public.notifications (user_id, actor_id, type) VALUES (member_id, me, 'group_add');
    END IF;
  END LOOP;

  INSERT INTO public.messages (conversation_id, user_id, body, kind)
  VALUES (cid, me, coalesce(my_name, 'Biri') || ' grubu oluşturdu', 'system');

  RETURN cid;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_group_members(gid uuid, member_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_role text;
  my_name text;
  member_id uuid;
  added_ids uuid[] := '{}';
  added_names text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT cm.role INTO my_role
  FROM public.conversation_members cm
  JOIN public.conversations c ON c.id = cm.conversation_id
  WHERE cm.conversation_id = gid AND cm.user_id = me AND c.kind = 'group';
  IF my_role IS NULL OR my_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM public.conversation_members WHERE conversation_id = gid) + cardinality(coalesce(member_ids, '{}')) > 50 THEN
    RAISE EXCEPTION 'group is full' USING ERRCODE = '22023';
  END IF;

  FOREACH member_id IN ARRAY coalesce(member_ids, '{}') LOOP
    CONTINUE WHEN member_id = me;
    IF NOT public.are_friends(me, member_id) THEN
      RAISE EXCEPTION 'only friends can be added' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (gid, member_id, 'member')
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      added_ids := array_append(added_ids, member_id);
      INSERT INTO public.notifications (user_id, actor_id, type) VALUES (member_id, me, 'group_add');
    END IF;
  END LOOP;

  IF cardinality(added_ids) > 0 THEN
    SELECT string_agg(p.name, ', ' ORDER BY p.name) INTO added_names FROM public.profiles p WHERE p.id = ANY(added_ids);
    SELECT name INTO my_name FROM public.profiles WHERE id = me;
    INSERT INTO public.messages (conversation_id, user_id, body, kind)
    VALUES (gid, me, coalesce(my_name, 'Biri') || ' ' || added_names || ' gruba eklendi', 'system');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_group_member(gid uuid, target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_role text;
  target_role text;
  target_name text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF target = me THEN
    RAISE EXCEPTION 'use leave' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO my_role FROM public.conversation_members WHERE conversation_id = gid AND user_id = me;
  IF my_role IS NULL OR my_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO target_role FROM public.conversation_members WHERE conversation_id = gid AND user_id = target;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'not a member' USING ERRCODE = 'P0002';
  END IF;
  IF target_role = 'owner' OR (target_role = 'admin' AND my_role <> 'owner') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.conversation_members WHERE conversation_id = gid AND user_id = target;

  SELECT name INTO target_name FROM public.profiles WHERE id = target;
  INSERT INTO public.messages (conversation_id, user_id, body, kind)
  VALUES (gid, me, coalesce(target_name, 'Biri') || ' gruptan çıkarıldı', 'system');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_group_member_role(gid uuid, target uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_role text;
  target_role text;
  target_name text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF new_role NOT IN ('admin', 'member') OR target = me THEN
    RAISE EXCEPTION 'invalid role change' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO my_role FROM public.conversation_members WHERE conversation_id = gid AND user_id = me;
  IF my_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO target_role FROM public.conversation_members WHERE conversation_id = gid AND user_id = target;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'not a member' USING ERRCODE = 'P0002';
  END IF;
  IF target_role = 'owner' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.conversation_members SET role = new_role WHERE conversation_id = gid AND user_id = target;

  SELECT name INTO target_name FROM public.profiles WHERE id = target;
  INSERT INTO public.messages (conversation_id, user_id, body, kind)
  VALUES (
    gid,
    me,
    coalesce(target_name, 'Biri') || CASE WHEN new_role = 'admin' THEN ' yönetici yapıldı' ELSE ' yöneticilikten çıkarıldı' END,
    'system'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rename_group(gid uuid, new_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  gname text := btrim(new_name);
  my_role text;
  my_name text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF char_length(gname) < 1 OR char_length(gname) > 30 THEN
    RAISE EXCEPTION 'invalid group name' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO my_role FROM public.conversation_members WHERE conversation_id = gid AND user_id = me;
  IF my_role IS NULL OR my_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.conversations SET name = gname WHERE id = gid AND kind = 'group';

  SELECT name INTO my_name FROM public.profiles WHERE id = me;
  INSERT INTO public.messages (conversation_id, user_id, body, kind)
  VALUES (gid, me, coalesce(my_name, 'Biri') || ' grup adını "' || gname || '" olarak değiştirdi', 'system');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_group_public(gid uuid, pub boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_role text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO my_role FROM public.conversation_members WHERE conversation_id = gid AND user_id = me;
  IF my_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.conversations SET is_public = pub WHERE id = gid AND kind = 'group';
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_group(gid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_role text;
  my_name text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO my_role FROM public.conversation_members WHERE conversation_id = gid AND user_id = me;
  IF my_role IS NULL THEN
    RAISE EXCEPTION 'not a member' USING ERRCODE = 'P0002';
  END IF;

  SELECT name INTO my_name FROM public.profiles WHERE id = me;

  DELETE FROM public.conversation_members WHERE conversation_id = gid AND user_id = me;

  IF my_role = 'owner' THEN
    UPDATE public.conversation_members
    SET role = 'owner'
    WHERE conversation_id = gid
      AND user_id = (
        SELECT cm.user_id
        FROM public.conversation_members cm
        WHERE cm.conversation_id = gid
        ORDER BY (cm.role = 'admin') DESC, cm.joined_at
        LIMIT 1
      );
  END IF;

  UPDATE public.conversations
  SET owner_id = (
    SELECT cm.user_id FROM public.conversation_members cm WHERE cm.conversation_id = gid AND cm.role = 'owner'
  )
  WHERE id = gid;

  INSERT INTO public.messages (conversation_id, user_id, body, kind)
  VALUES (gid, me, coalesce(my_name, 'Biri') || ' çıktı', 'system');
END;
$$;

CREATE OR REPLACE FUNCTION public.join_public_group(gid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_name text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = gid AND kind = 'group' AND is_public) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id, role) VALUES (gid, me, 'member')
  ON CONFLICT DO NOTHING;

  IF FOUND THEN
    SELECT name INTO my_name FROM public.profiles WHERE id = me;
    INSERT INTO public.messages (conversation_id, user_id, body, kind)
    VALUES (gid, me, coalesce(my_name, 'Biri') || ' katıldı', 'system');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.friend_action(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_group(text, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_group_members(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_group_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_group_member_role(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rename_group(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_group_public(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leave_group(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_public_group(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.open_dm(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.friend_action(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group(text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_group_members(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_group_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_group(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_public(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_public_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_dm(uuid) TO authenticated;
