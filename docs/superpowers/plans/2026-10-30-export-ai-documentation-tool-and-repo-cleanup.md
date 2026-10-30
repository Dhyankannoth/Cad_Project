# Export AI Documentation Tool & Repository Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the pre-built `AI documentation tool` (React/Vite GUI) from `OneDrive/Documents/AI documentation tool` into `Chronodoc/packages/web`, preserve backend migrations/functions, clean up root artifacts, and integrate it into the root monorepo scripts.

**Architecture:** Monorepo package integration under `Chronodoc/packages/*`. The existing `agent` package handles CLI and AST/LLM generation, while `web` provides the interactive GUI. Build and dev commands are coordinated from the root `package.json`.

**Tech Stack:** React 19, Vite 7, Tailwind CSS v4, TypeScript, npm workspaces, Supabase / PostgreSQL.

**Spec:** [docs/architecture/aws-architecture-spec.md](file:///c:/Users/Dhyan%20Kannoth/OneDrive/Documents/Cad_Project/docs/architecture/aws-architecture-spec.md) and [docs/decisions/ADR-001-database.md](file:///c:/Users/Dhyan%20Kannoth/OneDrive/Documents/Cad_Project/docs/decisions/ADR-001-database.md).

## Global Constraints

- Never commit sensitive `.env` files or active API keys.
- Do not copy assistant/IDE artifacts (`.agent`, `.agents`, `.claude`, `.continue`, `.git`, `node_modules`, `dist`, `.zip`).
- Ensure `Chronodoc/packages/agent` tests and build are not broken by the workspace additions.
- Ensure `Chronodoc/packages/web` builds successfully with `npm run build`.

## Review Focus

- Missing asset references in `Chronodoc/packages/web` after copying (e.g., hero previews, public icons).
- Duplicate `.env` definitions between root, agent, and web packages causing confusion.
- Git tracking of unwanted root build artifacts like `*.tgz`.
- Node package workspace resolution conflicts between React 19 dependencies and root monorepo.

---

### Task 1: Clean Up Repository Root and Update Git Ignore

**Files:**
- Modify: `.gitignore`
- Delete: `docagent-1.0.0.tgz`
- Modify: `.env.example` (consolidate top-level variables)

**Interfaces:**
- Consumes: Existing `.gitignore` and `env/.env.example`
- Produces: Clean root directory free of unmanaged binary archives and clear ignore rules for future packaging.

- [ ] **Step 1: Update `.gitignore`**
  Ensure `.gitignore` contains rules for:
  - `*.tgz`
  - `.env` and `.env.local`
  - `dist/`
  - `node_modules/`
  - `.superpowers/`
  - `.agents/`, `.agent/`, `.claude/`, `.continue/`

- [ ] **Step 2: Remove loose tarball**
  Delete `docagent-1.0.0.tgz` from root.

- [ ] **Step 3: Consolidate `.env.example`**
  Place a unified `.env.example` at root that documents:
  - Agent LLM keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)
  - Web GUI keys (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

- [ ] **Step 4: Verify working tree clean**
  Run: `git status`
  Expected: Clean working tree reflecting modified `.gitignore` and removed `.tgz`.

- [ ] **Step 5: Commit Task 1**
  Run: `git add .gitignore .env.example && git rm -f docagent-1.0.0.tgz && git commit -m "chore: clean up repo root and update gitignore"`

---

### Task 2: Export Clean GUI and Database Assets to Monorepo

**Files:**
- Create directory: `Chronodoc/packages/web`
- Copy source files from: `c:/Users/Dhyan Kannoth/OneDrive/Documents/AI documentation tool`
  - `src/`
  - `public/`
  - `index.html`
  - `vite.config.js`
  - `tsconfig.json`
  - `eslint.config.js`
  - `package.json`
  - `.env.example`
- Create directory: `supabase/` (preserve migrations and edge functions at top-level for deployment)
  - `supabase/migrations/`
  - `supabase/functions/`
  - `supabase/config.toml`

**Interfaces:**
- Consumes: Pre-built code from `AI documentation tool`
- Produces: Isolated frontend package `Chronodoc/packages/web` and centralized database migration directory `supabase/`.

- [ ] **Step 1: Create `Chronodoc/packages/web` directory**
  Create directory and copy only application files (`src`, `public`, `index.html`, `vite.config.js`, `tsconfig.json`, `eslint.config.js`, `package.json`).
  Explicitly exclude `.git`, `node_modules`, `dist`, `.agent`, `.agents`, `.claude`, `.continue`, and zip files.

- [ ] **Step 2: Copy `supabase` directory to `supabase/`**
  Copy `migrations/`, `functions/`, and `config.toml` from `AI documentation tool/supabase` to `Cad_Project/supabase/`.

- [ ] **Step 3: Create `Chronodoc/packages/web/.env.example`**
  Add template with:
  ```env
  VITE_SUPABASE_URL=https://your-project.supabase.co
  VITE_SUPABASE_ANON_KEY=your-anon-key
  ```

- [ ] **Step 4: Commit Task 2**
  Run: `git add Chronodoc/packages/web supabase && git commit -m "feat(web): export AI documentation tool into Chronodoc packages"`

---

### Task 3: Monorepo Integration & Workspace Scripting

**Files:**
- Modify: `package.json` (root)
- Modify: `Chronodoc/packages/web/package.json` (update name to `@chronodoc/web` or `docagent-web` to match convention)

**Interfaces:**
- Consumes: Root workspace config `Chronodoc/packages/*`
- Produces: Orchestrated scripts allowing developers to run `npm run build`, `npm run dev:web`, `npm run dev:agent`, etc.

- [ ] **Step 1: Standardize package name in `Chronodoc/packages/web/package.json`**
  Change package name to `@chronodoc/web`.

- [ ] **Step 2: Update root `package.json` scripts**
  Add scripts to root `package.json`:
  ```json
  {
    "scripts": {
      "build:agent": "npm --prefix Chronodoc/packages/agent run build",
      "build:web": "npm --prefix Chronodoc/packages/web run build",
      "build": "npm run build:agent && npm run build:web",
      "dev:web": "npm --prefix Chronodoc/packages/web run dev",
      "test:agent": "npm --prefix Chronodoc/packages/agent test",
      "test": "npm run test:agent"
    }
  }
  ```

- [ ] **Step 3: Install web dependencies**
  Run: `npm install` from root or within `Chronodoc/packages/web`.
  Verify dependencies install cleanly.

- [ ] **Step 4: Commit Task 3**
  Run: `git add package.json Chronodoc/packages/web/package.json && git commit -m "build: integrate web package into root monorepo scripts"`

---

### Task 4: Verification and Quality Check

**Files:**
- Test target: `Chronodoc/packages/agent` test suite
- Build target: `Chronodoc/packages/web` build output
- Documentation: Update root `README.md` to reflect new repo structure and GUI development command.

- [ ] **Step 1: Verify Agent tests pass**
  Run: `npm run test`
  Expected: All 6 test suites pass (14 passing tests).

- [ ] **Step 2: Verify Web GUI build passes**
  Run: `npm run build:web`
  Expected: Vite build succeeds, outputting to `Chronodoc/packages/web/dist`.

- [ ] **Step 3: Update root `README.md`**
  Document the monorepo structure:
  - `Chronodoc/packages/agent`: CLI and doc generation agent
  - `Chronodoc/packages/web`: Interactive React documentation UI
  - How to run GUI locally (`npm run dev:web`)
  - How to run CLI agent (`npm run docagent`)

- [ ] **Step 4: Final verification and commit**
  Run: `git status`
  Commit: `git add README.md && git commit -m "docs: document web GUI integration and updated monorepo structure"`
