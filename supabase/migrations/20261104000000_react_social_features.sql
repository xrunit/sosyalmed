-- Add media publishing and engagement features without removing existing data.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_path text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'post';

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_body_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_body_check
  CHECK (char_length(body) <= 2000 AND (char_length(body) > 0 OR media_path IS NOT NULL));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.posts'::regclass AND conname = 'posts_media_type_check'
  ) THEN
    ALTER TABLE public.posts ADD CONSTRAINT posts_media_type_check
      CHECK (media_type IS NULL OR media_type IN ('image', 'video'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.posts'::regclass AND conname = 'posts_type_media_check'
  ) THEN
    ALTER TABLE public.posts ADD CONSTRAINT posts_type_media_check
      CHECK (post_type IN ('post', 'reel') AND (post_type <> 'reel' OR media_type = 'video'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.posts'::regclass AND conname = 'posts_media_owner_path_check'
  ) THEN
    ALTER TABLE public.posts ADD CONSTRAINT posts_media_owner_path_check
      CHECK (media_path IS NULL OR media_path LIKE user_id::text || '/%');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS posts_type_created_at_idx
  ON public.posts (post_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_comments_post_created_idx
  ON public.post_comments (post_id, created_at);

CREATE TABLE IF NOT EXISTS public.saved_posts (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.post_likes, public.post_comments, public.saved_posts FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.post_likes TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.post_comments TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.saved_posts TO authenticated;

DROP POLICY IF EXISTS post_likes_select_authenticated ON public.post_likes;
CREATE POLICY post_likes_select_authenticated ON public.post_likes FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS post_likes_insert_own ON public.post_likes;
CREATE POLICY post_likes_insert_own ON public.post_likes FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS post_likes_delete_own ON public.post_likes;
CREATE POLICY post_likes_delete_own ON public.post_likes FOR DELETE
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS post_comments_select_authenticated ON public.post_comments;
CREATE POLICY post_comments_select_authenticated ON public.post_comments FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS post_comments_insert_own ON public.post_comments;
CREATE POLICY post_comments_insert_own ON public.post_comments FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS post_comments_delete_own ON public.post_comments;
CREATE POLICY post_comments_delete_own ON public.post_comments FOR DELETE
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS saved_posts_select_own ON public.saved_posts;
CREATE POLICY saved_posts_select_own ON public.saved_posts FOR SELECT
  TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS saved_posts_insert_own ON public.saved_posts;
CREATE POLICY saved_posts_insert_own ON public.saved_posts FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS saved_posts_delete_own ON public.saved_posts;
CREATE POLICY saved_posts_delete_own ON public.saved_posts FOR DELETE
  TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow', 'friend_request', 'friend_accept', 'group_add', 'like', 'comment'));

CREATE OR REPLACE FUNCTION public.notify_on_post_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_owner uuid;
  event_type text;
BEGIN
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  event_type := CASE WHEN TG_TABLE_NAME = 'post_likes' THEN 'like' ELSE 'comment' END;
  IF post_owner IS NOT NULL AND post_owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (post_owner, NEW.user_id, event_type);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_on_post_engagement() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS post_likes_notify ON public.post_likes;
CREATE TRIGGER post_likes_notify AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_engagement();
DROP TRIGGER IF EXISTS post_comments_notify ON public.post_comments;
CREATE TRIGGER post_comments_notify AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_engagement();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-media',
  'post-media',
  true,
  31457280,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS post_media_read ON storage.objects;
CREATE POLICY post_media_read ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'post-media');
DROP POLICY IF EXISTS post_media_insert_own ON storage.objects;
CREATE POLICY post_media_insert_own ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'post-media' AND (storage.foldername(name))[1] = auth.uid()::text
  );
DROP POLICY IF EXISTS post_media_delete_own ON storage.objects;
CREATE POLICY post_media_delete_own ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'post-media' AND (storage.foldername(name))[1] = auth.uid()::text
  );

DO $$
DECLARE
  table_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH table_name IN ARRAY ARRAY['posts', 'post_likes', 'post_comments', 'notifications'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
      END IF;
    END LOOP;
  END IF;
END $$;
