-- ============================================
-- DOCFLOW Core Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Projects
create table if not exists public.projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  source_type text check (source_type in ('upload', 'github')) not null default 'upload',
  github_repo_url text,
  status text check (status in (
    'pending_analysis', 'analyzing', 'generating_docs', 'ready', 'updating', 'error'
  )) not null default 'pending_analysis',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Files
create table if not exists public.files (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  file_path text not null,
  file_name text not null,
  extension text,
  content text,
  content_hash text,
  size_bytes integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(project_id, file_path)
);

-- 3. File Metadata (extracted code structure)
create table if not exists public.file_metadata (
  id uuid default gen_random_uuid() primary key,
  file_id uuid references public.files(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  functions jsonb default '[]'::jsonb,
  classes jsonb default '[]'::jsonb,
  imports jsonb default '[]'::jsonb,
  exports jsonb default '[]'::jsonb,
  routes jsonb default '[]'::jsonb,
  complexity_score integer default 0,
  loop_count integer default 0,
  conditional_count integer default 0,
  max_nesting_depth integer default 0,
  unique(file_id)
);

-- 4. Dependencies (import graph edges)
create table if not exists public.dependencies (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  source_file_id uuid references public.files(id) on delete cascade not null,
  target_file_id uuid references public.files(id) on delete cascade,
  import_path text not null,
  created_at timestamptz default now()
);

-- 5. Project Metrics
create table if not exists public.project_metrics (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null unique,
  doc_coverage_pct numeric default 0,
  avg_complexity numeric default 0,
  central_modules jsonb default '[]'::jsonb,
  orphan_files jsonb default '[]'::jsonb,
  total_files integer default 0,
  total_functions integer default 0,
  computed_at timestamptz default now()
);

-- 6. Documentation Sections (AI-generated per-file docs)
create table if not exists public.documentation_sections (
  id uuid default gen_random_uuid() primary key,
  file_id uuid references public.files(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  overview text,
  function_docs jsonb default '[]'::jsonb,
  edge_cases jsonb default '[]'::jsonb,
  complexity_notes text,
  architecture_role text,
  generated_at timestamptz default now(),
  version integer default 1,
  unique(file_id)
);

-- 7. Commits
create table if not exists public.commits (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  commit_hash text,
  message text,
  changed_files jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- 8. Change Analysis
create table if not exists public.change_analysis (
  id uuid default gen_random_uuid() primary key,
  commit_id uuid references public.commits(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  summary text,
  impact_explanation text,
  risk_level text check (risk_level in ('low', 'medium', 'high', 'critical')),
  affected_files jsonb default '[]'::jsonb,
  regenerated_docs jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- ============================================
-- Row Level Security
-- ============================================

alter table public.projects enable row level security;
alter table public.files enable row level security;
alter table public.file_metadata enable row level security;
alter table public.dependencies enable row level security;
alter table public.project_metrics enable row level security;
alter table public.documentation_sections enable row level security;
alter table public.commits enable row level security;
alter table public.change_analysis enable row level security;

-- Projects: users can only access their own
create policy "Users can view own projects"
  on public.projects for select using (auth.uid() = user_id);
create policy "Users can create own projects"
  on public.projects for insert with check (auth.uid() = user_id);
create policy "Users can update own projects"
  on public.projects for update using (auth.uid() = user_id);
create policy "Users can delete own projects"
  on public.projects for delete using (auth.uid() = user_id);

-- Files: accessed via project ownership
create policy "Users can view files in own projects"
  on public.files for select using (
    project_id in (select id from public.projects where user_id = auth.uid())
  );
create policy "Users can insert files in own projects"
  on public.files for insert with check (
    project_id in (select id from public.projects where user_id = auth.uid())
  );
create policy "Users can update files in own projects"
  on public.files for update using (
    project_id in (select id from public.projects where user_id = auth.uid())
  );
create policy "Users can delete files in own projects"
  on public.files for delete using (
    project_id in (select id from public.projects where user_id = auth.uid())
  );

-- File Metadata
create policy "Users can view metadata in own projects"
  on public.file_metadata for select using (
    project_id in (select id from public.projects where user_id = auth.uid())
  );
create policy "Users can insert metadata in own projects"
  on public.file_metadata for insert with check (
    project_id in (select id from public.projects where user_id = auth.uid())
  );

-- Dependencies
create policy "Users can view deps in own projects"
  on public.dependencies for select using (
    project_id in (select id from public.projects where user_id = auth.uid())
  );
create policy "Users can insert deps in own projects"
  on public.dependencies for insert with check (
    project_id in (select id from public.projects where user_id = auth.uid())
  );

-- Project Metrics
create policy "Users can view metrics in own projects"
  on public.project_metrics for select using (
    project_id in (select id from public.projects where user_id = auth.uid())
  );
create policy "Users can upsert metrics in own projects"
  on public.project_metrics for insert with check (
    project_id in (select id from public.projects where user_id = auth.uid())
  );
create policy "Users can update metrics in own projects"
  on public.project_metrics for update using (
    project_id in (select id from public.projects where user_id = auth.uid())
  );

-- Documentation Sections
create policy "Users can view docs in own projects"
  on public.documentation_sections for select using (
    project_id in (select id from public.projects where user_id = auth.uid())
  );
create policy "Users can insert docs in own projects"
  on public.documentation_sections for insert with check (
    project_id in (select id from public.projects where user_id = auth.uid())
  );
create policy "Users can update docs in own projects"
  on public.documentation_sections for update using (
    project_id in (select id from public.projects where user_id = auth.uid())
  );

-- Commits
create policy "Users can view commits in own projects"
  on public.commits for select using (
    project_id in (select id from public.projects where user_id = auth.uid())
  );
create policy "Users can insert commits in own projects"
  on public.commits for insert with check (
    project_id in (select id from public.projects where user_id = auth.uid())
  );

-- Change Analysis
create policy "Users can view analysis in own projects"
  on public.change_analysis for select using (
    project_id in (select id from public.projects where user_id = auth.uid())
  );
create policy "Users can insert analysis in own projects"
  on public.change_analysis for insert with check (
    project_id in (select id from public.projects where user_id = auth.uid())
  );

-- ============================================
-- Indexes for performance
-- ============================================

create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_files_project_id on public.files(project_id);
create index if not exists idx_file_metadata_project_id on public.file_metadata(project_id);
create index if not exists idx_file_metadata_file_id on public.file_metadata(file_id);
create index if not exists idx_dependencies_project_id on public.dependencies(project_id);
create index if not exists idx_dependencies_source on public.dependencies(source_file_id);
create index if not exists idx_dependencies_target on public.dependencies(target_file_id);
create index if not exists idx_docs_project_id on public.documentation_sections(project_id);
create index if not exists idx_docs_file_id on public.documentation_sections(file_id);
create index if not exists idx_commits_project_id on public.commits(project_id);
create index if not exists idx_change_analysis_project_id on public.change_analysis(project_id);

-- ============================================
-- Updated_at trigger
-- ============================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_projects_updated_at
  before update on public.projects
  for each row execute function public.handle_updated_at();

create trigger set_files_updated_at
  before update on public.files
  for each row execute function public.handle_updated_at();
