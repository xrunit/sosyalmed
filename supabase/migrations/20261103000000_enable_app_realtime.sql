DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'posts',
    'follows',
    'notifications',
    'conversations',
    'conversation_members',
    'messages',
    'friendships',
    'message_reactions'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;
