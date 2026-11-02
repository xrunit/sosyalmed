/*
# Lock down anonymous access and function execution

1. Summary
- The app requires sign-in, so the anonymous role must not reach any table or function.
- The two SECURITY DEFINER helper functions were callable by every role (including anonymous visitors).

2. Security changes
- Revoke all table privileges from `anon` on every public table. RLS policies only target `authenticated`, so this removes unused access rather than changing any visible behavior.
- Revoke EXECUTE on `is_conversation_member` and `open_dm` from PUBLIC and `anon`.
- Keep EXECUTE for `authenticated` on both, since RLS policies call the membership helper as the signed-in user and the app calls `open_dm` for direct messages.

3. Notes
- No data is modified or removed.
*/

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.open_dm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_dm(uuid) TO authenticated;
