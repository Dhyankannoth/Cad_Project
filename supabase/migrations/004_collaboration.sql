-- ============================================
-- DOCFLOW Collaboration Schema
-- Migration 004: project_members, collaboration_invites,
--   updated RLS policies, and auto-owner trigger
-- ============================================

-- Helper function: check if current user is a member of a project
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function: check if current user is the owner of a project
CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid() AND role = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- 1. Project Members Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text CHECK (role IN ('owner', 'member')) NOT NULL DEFAULT 'member',
  joined_at timestamptz DEFAULT now(),
  UNIQUE(project_id, user_id)
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Members can view other members of projects they belong to
CREATE POLICY "Members can view project members"
  ON public.project_members FOR SELECT
  USING (public.is_project_member(project_id));

-- Only owners can add members
CREATE POLICY "Owners can insert project members"
  ON public.project_members FOR INSERT
  WITH CHECK (public.is_project_owner(project_id));

-- Only owners can remove members (but not themselves)
CREATE POLICY "Owners can delete project members"
  ON public.project_members FOR DELETE
  USING (public.is_project_owner(project_id));

CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON public.project_members(user_id);

-- ============================================
-- 2. Collaboration Invites Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.collaboration_invites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invited_email text NOT NULL,
  invited_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code text UNIQUE NOT NULL,
  status text CHECK (status IN ('pending', 'accepted', 'revoked')) NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.collaboration_invites ENABLE ROW LEVEL SECURITY;

-- Owners can view/create invites for their projects
CREATE POLICY "Owners can view invites"
  ON public.collaboration_invites FOR SELECT
  USING (public.is_project_owner(project_id) OR invited_user_id = auth.uid());

CREATE POLICY "Owners can create invites"
  ON public.collaboration_invites FOR INSERT
  WITH CHECK (public.is_project_owner(project_id) AND invited_by = auth.uid());

CREATE POLICY "Owners can update invites"
  ON public.collaboration_invites FOR UPDATE
  USING (public.is_project_owner(project_id) OR invited_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_collab_invites_project_id ON public.collaboration_invites(project_id);
CREATE INDEX IF NOT EXISTS idx_collab_invites_code ON public.collaboration_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_collab_invites_user_id ON public.collaboration_invites(invited_user_id);

-- ============================================
-- 3. Auto-insert owner into project_members on project creation
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_project_owner()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (project_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_project_created_add_owner
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_project_owner();

-- ============================================
-- 4. Update RLS Policies on existing tables
--    to allow collaborator access
-- ============================================

-- --- PROJECTS ---
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
-- Keep insert policy (only the creator inserts)

CREATE POLICY "Members can view projects"
  ON public.projects FOR SELECT
  USING (public.is_project_member(id));

CREATE POLICY "Owners can update projects"
  ON public.projects FOR UPDATE
  USING (public.is_project_owner(id));

CREATE POLICY "Owners can delete projects"
  ON public.projects FOR DELETE
  USING (public.is_project_owner(id));

-- --- FILES ---
DROP POLICY IF EXISTS "Users can view files in own projects" ON public.files;
DROP POLICY IF EXISTS "Users can insert files in own projects" ON public.files;
DROP POLICY IF EXISTS "Users can update files in own projects" ON public.files;
DROP POLICY IF EXISTS "Users can delete files in own projects" ON public.files;

CREATE POLICY "Members can view files"
  ON public.files FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY "Members can insert files"
  ON public.files FOR INSERT
  WITH CHECK (public.is_project_member(project_id));

CREATE POLICY "Members can update files"
  ON public.files FOR UPDATE
  USING (public.is_project_member(project_id));

CREATE POLICY "Owners can delete files"
  ON public.files FOR DELETE
  USING (public.is_project_owner(project_id));

-- --- FILE METADATA ---
DROP POLICY IF EXISTS "Users can view metadata in own projects" ON public.file_metadata;
DROP POLICY IF EXISTS "Users can insert metadata in own projects" ON public.file_metadata;

CREATE POLICY "Members can view metadata"
  ON public.file_metadata FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY "Members can insert metadata"
  ON public.file_metadata FOR INSERT
  WITH CHECK (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Users can view deps in own projects" ON public.dependencies;
DROP POLICY IF EXISTS "Users can insert deps in own projects" ON public.dependencies;

CREATE POLICY "Members can view deps"
  ON public.dependencies FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY "Members can insert deps"
  ON public.dependencies FOR INSERT
  WITH CHECK (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Users can view metrics in own projects" ON public.project_metrics;
DROP POLICY IF EXISTS "Users can upsert metrics in own projects" ON public.project_metrics;
DROP POLICY IF EXISTS "Users can update metrics in own projects" ON public.project_metrics;

CREATE POLICY "Members can view metrics"
  ON public.project_metrics FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY "Members can insert metrics"
  ON public.project_metrics FOR INSERT
  WITH CHECK (public.is_project_member(project_id));

CREATE POLICY "Members can update metrics"
  ON public.project_metrics FOR UPDATE
  USING (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Users can view docs in own projects" ON public.documentation_sections;
DROP POLICY IF EXISTS "Users can insert docs in own projects" ON public.documentation_sections;
DROP POLICY IF EXISTS "Users can update docs in own projects" ON public.documentation_sections;

CREATE POLICY "Members can view docs"
  ON public.documentation_sections FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY "Members can insert docs"
  ON public.documentation_sections FOR INSERT
  WITH CHECK (public.is_project_member(project_id));

CREATE POLICY "Members can update docs"
  ON public.documentation_sections FOR UPDATE
  USING (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Users can view commits in own projects" ON public.commits;
DROP POLICY IF EXISTS "Users can insert commits in own projects" ON public.commits;

CREATE POLICY "Members can view commits"
  ON public.commits FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY "Members can insert commits"
  ON public.commits FOR INSERT
  WITH CHECK (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Users can view analysis in own projects" ON public.change_analysis;
DROP POLICY IF EXISTS "Users can insert analysis in own projects" ON public.change_analysis;

CREATE POLICY "Members can view analysis"
  ON public.change_analysis FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY "Members can insert analysis"
  ON public.change_analysis FOR INSERT
  WITH CHECK (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Users can view webhooks for their projects" ON public.webhooks;
DROP POLICY IF EXISTS "Users can create webhooks for their projects" ON public.webhooks;
DROP POLICY IF EXISTS "Users can update webhooks for their projects" ON public.webhooks;
DROP POLICY IF EXISTS "Users can delete webhooks for their projects" ON public.webhooks;

CREATE POLICY "Owners can view webhooks"
  ON public.webhooks FOR SELECT
  USING (public.is_project_owner(project_id));

CREATE POLICY "Owners can create webhooks"
  ON public.webhooks FOR INSERT
  WITH CHECK (public.is_project_owner(project_id));

CREATE POLICY "Owners can update webhooks"
  ON public.webhooks FOR UPDATE
  USING (public.is_project_owner(project_id));

CREATE POLICY "Owners can delete webhooks"
  ON public.webhooks FOR DELETE
  USING (public.is_project_owner(project_id));

CREATE OR REPLACE FUNCTION public.accept_invite_code(p_code text)
RETURNS uuid AS $$
DECLARE
  v_invite record;
  v_caller_id uuid := auth.uid();
BEGIN
  SELECT * INTO v_invite
  FROM public.collaboration_invites
  WHERE invite_code = upper(p_code)
    AND status = 'pending'
  FOR UPDATE;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite code.';
  END IF;

  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'This invite code has expired.';
  END IF;

  IF v_invite.invited_user_id != v_caller_id THEN
    RAISE EXCEPTION 'This invite was sent to a different account.';
  END IF;

  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (v_invite.project_id, v_caller_id, 'member')
  ON CONFLICT (project_id, user_id) DO NOTHING;

  UPDATE public.collaboration_invites
  SET status = 'accepted'
  WHERE id = v_invite.id;

  RETURN v_invite.project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO public.project_members (project_id, user_id, role)
SELECT id, user_id, 'owner'
FROM public.projects
ON CONFLICT (project_id, user_id) DO NOTHING;
