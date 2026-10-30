-- migrations/007_webhooks_unique_constraint.sql
-- Description: Add unique constraint on project_id in webhooks table.
-- This is required for the upsert (ON CONFLICT) operation to work.

ALTER TABLE public.webhooks
    ADD CONSTRAINT webhooks_project_id_unique UNIQUE (project_id);
