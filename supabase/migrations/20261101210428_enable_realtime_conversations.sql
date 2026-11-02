/*
# Enable realtime for conversations

1. Summary
- Adds the conversations table to the realtime publication so new rooms and direct messages appear live in the Messages list.

2. Security
- No policy or grant changes. Existing row level security still decides which conversations each user receives.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;
