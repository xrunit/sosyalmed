/*
# Create follow notifications

1. Summary
- When someone follows a profile, a notification is written for the followed user so the Notifications list has data.

2. New behavior
- Trigger on `follows` inserts: writes one `notifications` row (type 'follow') for the followed profile, with the follower as the actor.
- Self-follows are skipped.

3. Security
- The trigger function is SECURITY DEFINER with a fixed search_path because notifications have no client insert policy.
- EXECUTE is revoked from PUBLIC, anon and authenticated; triggers run without client execute access.
*/

CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.follower_id <> NEW.following_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (NEW.following_id, NEW.follower_id, 'follow');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_on_follow() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS follows_notify_on_insert ON public.follows;
CREATE TRIGGER follows_notify_on_insert
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();
