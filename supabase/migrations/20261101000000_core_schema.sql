CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Kullanıcı',
  bio text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#00d4ff',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON public.posts (created_at DESC);

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('follow')),
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('room', 'dm')),
  name text,
  dm_key text UNIQUE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_check CHECK (
    (kind = 'dm' AND dm_key IS NOT NULL) OR (kind = 'room' AND dm_key IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON public.messages (conversation_id, created_at);

CREATE OR REPLACE FUNCTION public.is_conversation_member(cid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = cid AND cm.user_id = auth.uid()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.open_dm(peer uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  dm_id uuid;
  pair_key text;
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

  pair_key := LEAST(me::text, peer::text) || '_' || GREATEST(me::text, peer::text);
  INSERT INTO public.conversations (kind, dm_key, created_by)
  VALUES ('dm', pair_key, me)
  ON CONFLICT (dm_key) DO NOTHING
  RETURNING id INTO dm_id;

  IF dm_id IS NULL THEN
    SELECT id INTO dm_id FROM public.conversations WHERE dm_key = pair_key;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (dm_id, me), (dm_id, peer)
  ON CONFLICT DO NOTHING;

  RETURN dm_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.open_dm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_dm(uuid) TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT, INSERT ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.conversation_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;

CREATE POLICY profiles_select_authenticated ON public.profiles FOR SELECT
  TO authenticated USING (true);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE
  TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY posts_select_authenticated ON public.posts FOR SELECT
  TO authenticated USING (true);
CREATE POLICY posts_insert_own ON public.posts FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY posts_delete_own ON public.posts FOR DELETE
  TO authenticated USING (user_id = auth.uid());

CREATE POLICY follows_select_authenticated ON public.follows FOR SELECT
  TO authenticated USING (true);
CREATE POLICY follows_insert_own ON public.follows FOR INSERT
  TO authenticated WITH CHECK (follower_id = auth.uid());
CREATE POLICY follows_delete_own ON public.follows FOR DELETE
  TO authenticated USING (follower_id = auth.uid());

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT
  TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY conversations_select_rooms_or_members ON public.conversations FOR SELECT
  TO authenticated USING (kind = 'room' OR public.is_conversation_member(id));
CREATE POLICY conversations_insert_own_room ON public.conversations FOR INSERT
  TO authenticated WITH CHECK (kind = 'room' AND created_by = auth.uid());

CREATE POLICY members_select_visible ON public.conversation_members FOR SELECT
  TO authenticated USING (
    public.is_conversation_member(conversation_id)
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.kind = 'room')
  );
CREATE POLICY members_insert_self_room ON public.conversation_members FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.kind = 'room')
  );

CREATE POLICY messages_select_members_or_rooms ON public.messages FOR SELECT
  TO authenticated USING (
    public.is_conversation_member(conversation_id)
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.kind = 'room')
  );
CREATE POLICY messages_insert_member_self ON public.messages FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_conversation_member(conversation_id));
CREATE POLICY messages_delete_own ON public.messages FOR DELETE
  TO authenticated USING (user_id = auth.uid() AND public.is_conversation_member(conversation_id));

INSERT INTO public.conversations (kind, name)
SELECT 'room', 'Genel'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE kind = 'room' AND name = 'Genel');
