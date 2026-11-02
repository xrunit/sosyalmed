/*
# Friends, groups, replies, reactions and read receipts

## 1. Summary
Adds the data needed for friend requests, group chats with owners and admins, Instagram-style direct messages, replies, emoji reactions, seen receipts and system messages such as "Ayşe çıktı".

## 2. New tables
- `friendships`: one row per pair of users. `status` is `pending` (request sent, waiting) or `accepted` (friends). `requested_by` records who sent the request. The pair is stored ordered (`user_low` < `user_high`) so a pair exists only once.
- `message_reactions`: an emoji reaction a user placed on a message. One reaction per user, per emoji, per message.

## 3. Changed tables
- `conversations`: new `owner_id` (group owner) and `is_public` (anyone signed in can join). Kind `room` becomes `group`. The seeded "Genel" room becomes a public group.
- `conversation_members`: new `role` (`owner`, `admin`, `member`) and `last_read_at` (used for seen receipts).
- `messages`: new `reply_to` (the message being answered) and `kind` (`user` for normal messages, `system` for automatic notes like "Ayşe çıktı").

## 4. Security
- Friendships can only be read by the two people involved. Changes happen through server functions added in the next migration.
- Conversations and memberships can no longer be inserted, updated or deleted directly by the app. Creating, renaming, adding/removing members and leaving are done through server functions that check roles.
- Members can only update their own `last_read_at`.
- Messages can only be sent by a current member, and direct messages only between friends.
- Reactions can only be added to messages the user can see.

## 5. Notes
- Existing data is kept. Nothing is dropped or deleted.
- Existing direct-message and public group rules are replaced by the rules above.
*/

ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_check;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_kind_check;
UPDATE public.conversations SET kind = 'group' WHERE kind = 'room';
ALTER TABLE public.conversations ADD CONSTRAINT conversations_kind_check CHECK (kind IN ('group', 'dm'));
ALTER TABLE public.conversations ADD CONSTRAINT conversations_check CHECK (
  (kind = 'dm' AND dm_key IS NOT NULL) OR (kind = 'group' AND dm_key IS NULL)
);

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
UPDATE public.conversations SET is_public = true WHERE kind = 'group' AND name = 'Genel';

ALTER TABLE public.conversation_members ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';
ALTER TABLE public.conversation_members ADD COLUMN IF NOT EXISTS last_read_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.conversation_members'::regclass AND conname = 'conversation_members_role_check'
  ) THEN
    ALTER TABLE public.conversation_members ADD CONSTRAINT conversation_members_role_check CHECK (role IN ('owner', 'admin', 'member'));
  END IF;
END $$;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'user';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.messages'::regclass AND conname = 'messages_kind_check'
  ) THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_kind_check CHECK (kind IN ('user', 'system'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON public.messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.friendships (
  user_low uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_high uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  PRIMARY KEY (user_low, user_high),
  CHECK (user_low < user_high),
  CHECK (requested_by IN (user_low, user_high))
);
CREATE INDEX IF NOT EXISTS friendships_user_high_idx ON public.friendships (user_high);

CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.conversations FROM authenticated;
GRANT SELECT ON public.conversations TO authenticated;
DROP POLICY IF EXISTS conversations_insert_own_room ON public.conversations;
DROP POLICY IF EXISTS conversations_select_rooms_or_members ON public.conversations;
DROP POLICY IF EXISTS conversations_select_visible ON public.conversations;
CREATE POLICY conversations_select_visible ON public.conversations FOR SELECT
  TO authenticated USING (is_public OR public.is_conversation_member(id));

REVOKE INSERT, UPDATE, DELETE ON public.conversation_members FROM authenticated;
GRANT SELECT ON public.conversation_members TO authenticated;
GRANT UPDATE (last_read_at) ON public.conversation_members TO authenticated;
DROP POLICY IF EXISTS members_insert_self_room ON public.conversation_members;
DROP POLICY IF EXISTS members_select_visible ON public.conversation_members;
DROP POLICY IF EXISTS members_update_own_read ON public.conversation_members;
CREATE POLICY members_select_visible ON public.conversation_members FOR SELECT
  TO authenticated USING (
    public.is_conversation_member(conversation_id)
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_members.conversation_id AND c.is_public)
  );
CREATE POLICY members_update_own_read ON public.conversation_members FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS messages_select_members_or_rooms ON public.messages;
DROP POLICY IF EXISTS messages_select_visible ON public.messages;
CREATE POLICY messages_select_visible ON public.messages FOR SELECT
  TO authenticated USING (
    public.is_conversation_member(conversation_id)
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.is_public)
  );
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
        JOIN public.friendships f
          ON f.status = 'accepted'
         AND f.user_low = LEAST(auth.uid(), m.user_id)
         AND f.user_high = GREATEST(auth.uid(), m.user_id)
        WHERE m.conversation_id = messages.conversation_id AND m.user_id <> auth.uid()
      )
    )
  );

GRANT SELECT ON public.friendships TO authenticated;
DROP POLICY IF EXISTS friendships_select_party ON public.friendships;
CREATE POLICY friendships_select_party ON public.friendships FOR SELECT
  TO authenticated USING (auth.uid() IN (user_low, user_high));

GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
DROP POLICY IF EXISTS message_reactions_select_visible ON public.message_reactions;
CREATE POLICY message_reactions_select_visible ON public.message_reactions FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_reactions.message_id));
DROP POLICY IF EXISTS message_reactions_insert_member ON public.message_reactions;
CREATE POLICY message_reactions_insert_member ON public.message_reactions FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id AND public.is_conversation_member(m.conversation_id)
    )
  );
DROP POLICY IF EXISTS message_reactions_delete_own ON public.message_reactions;
CREATE POLICY message_reactions_delete_own ON public.message_reactions FOR DELETE
  TO authenticated USING (user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friendships') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END $$;
