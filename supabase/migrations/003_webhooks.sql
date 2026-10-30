-- migrations/003_webhooks.sql
-- Description: Create webhooks table for tracking repository changes.

CREATE TABLE IF NOT EXISTS public.webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    github_repo_id BIGINT, 
    target_branches TEXT[] DEFAULT '{"main"}', 
    secret_key TEXT NOT NULL, 
    is_active BOOLEAN DEFAULT true,
    last_event_at TIMESTAMP WITH TIME ZONE,
    last_status TEXT, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

-- Polices: Users can manage webhooks for their own projects
CREATE POLICY "Users can view webhooks for their projects"
    ON public.webhooks FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = webhooks.project_id AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create webhooks for their projects"
    ON public.webhooks FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = webhooks.project_id AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update webhooks for their projects"
    ON public.webhooks FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = webhooks.project_id AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete webhooks for their projects"
    ON public.webhooks FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = webhooks.project_id AND p.user_id = auth.uid()
        )
    );

-- Index for lookup
CREATE INDEX IF NOT EXISTS idx_webhooks_project_id ON public.webhooks(project_id);
