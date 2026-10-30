ALTER TABLE public.collaboration_invites 
ALTER COLUMN expires_at SET DEFAULT (now() + interval '3 minutes');

COMMENT ON COLUMN public.collaboration_invites.expires_at IS 'Invite codes expire after 3 minutes for enhanced security.';
