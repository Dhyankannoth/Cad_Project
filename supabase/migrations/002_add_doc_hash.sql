-- Add content_hash to documentation_sections to support caching
ALTER TABLE public.documentation_sections 
ADD COLUMN IF NOT EXISTS content_hash text;

-- Index for faster lookups during regeneration checks
CREATE INDEX IF NOT EXISTS idx_docs_content_hash ON public.documentation_sections(content_hash);

-- Backfill content_hash from files table for existing documentation
UPDATE public.documentation_sections ds
SET content_hash = f.content_hash
FROM public.files f
WHERE ds.file_id = f.id;
