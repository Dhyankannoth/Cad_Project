# Repository Documentation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a comprehensive, source-grounded repository documentation system for DocAgent that generates, validates, and safely maintains professional, interconnected Markdown documentation (README, getting-started, architecture, guides, references, metadata generation report) tailored to the actual contents of any codebase.

**Architecture:** Extend DocAgent with a modular documentation pipeline:
1. `DocPlanner`: Inspects repository AST index, configuration files, and scripts to conditionally select which documents to generate and derive verified technical claims.
2. `RepoDocGenerator`: Generates professional, cohesive Markdown documents using established design templates, Mermaid diagrams, verified source paths, and LLM/deterministic generation.
3. `RepoDocValidator`: Performs multi-document validation including internal link resolution, source path verification, AST symbol checks, Mermaid syntax verification, and secret detection.
4. `SafeFileWriter`: Manages safe filesystem operations, atomic writes, change detection, and manual user-edit preservation.
5. `GenerationReportWriter`: Emits a detailed, machine-readable `docs/metadata/generation-report.json` omitting any secrets.
6. `RepositoryDocOrchestrator`: Orchestrates the end-to-end repository documentation workflow and wires into the CLI.

**Tech Stack:** TypeScript (ESM), Node.js (v20+), `@clack/prompts`, `commander`, `ora`, `picocolors`, native `tsx --test`.

**Spec:** Defined by the user request covering Sections 1 through 19: conditional generation, professional Markdown design system, source grounding, targeted validation, safe regeneration, and TDD.

## Global Constraints
- Preserve existing working functionality and all 52 baseline tests.
- Zero external network calls required for tests: mock LLM calls deterministically.
- Never expose or write secret keys or environment credentials to documentation or reports.
- Do not fabricate missing code, APIs, or database models. If absent or uncertain, document as unknown or omit the document.
- All relative Markdown links between generated documents must resolve to real files.

---

### Task 1: Repository Documentation Planner (`DocPlanner`)
**Files:**
- Create: `Chronodoc/packages/agent/src/planner/docPlanner.ts`
- Create: `Chronodoc/packages/agent/src/planner/types.ts`
- Test: `Chronodoc/packages/agent/tests/planner/docPlanner.test.ts`

- [ ] **Step 1 (RED):** Write failing unit tests for `DocPlanner` verifying:
  - Detection of project metadata, tech stack, build scripts from `package.json` and files.
  - Conditional planning: generates `reference/api.md` only when API routes/endpoints or exported interfaces exist.
  - Conditional planning: generates `reference/database.md` only when database/ORM schemas or models exist.
  - Document selection: produces plan with `README.md`, `getting-started.md`, `architecture/overview.md`, `architecture/components.md`, `architecture/data-flow.md`, `guides/development.md`, `guides/testing.md`, `guides/configuration.md`, `reference/dependencies.md`.
  - Records skip reasons for excluded documents (e.g. database omitted because no DB models found).
- [ ] **Step 2 (VERIFY RED):** Run `npm test Chronodoc/packages/agent/tests/planner/docPlanner.test.ts` and verify test fails.
- [ ] **Step 3 (GREEN):** Implement `DocPlanner` and types in `Chronodoc/packages/agent/src/planner/`.
- [ ] **Step 4 (VERIFY GREEN):** Re-run tests and verify all pass.
- [ ] **Step 5 (COMMIT):** Commit Task 1 changes.

---

### Task 2: Multi-Document Source-Grounded Generator (`RepoDocGenerator`)
**Files:**
- Create: `Chronodoc/packages/agent/src/generator/repoDocGenerator.ts`
- Modify: `Chronodoc/packages/agent/src/generator/types.ts`
- Test: `Chronodoc/packages/agent/tests/generator/repoDocGenerator.test.ts`

- [ ] **Step 1 (RED):** Write failing unit tests for `RepoDocGenerator` verifying:
  - Generates `docs/README.md` with relative links to all generated documents, tech stack, and project overview.
  - Generates `getting-started.md` with verified prerequisites, installation, run, test scripts.
  - Generates `architecture/overview.md` with Mermaid architecture diagram based on verified components.
  - Generates `architecture/components.md` with verified exported symbols, responsibilities, and source paths.
  - Generates `architecture/data-flow.md` with Mermaid workflow diagrams.
  - Generates `guides/development.md`, `guides/testing.md`, `guides/configuration.md`.
  - Formats with professional Markdown design standards (single top-level `#`, clear tables, code fences).
- [ ] **Step 2 (VERIFY RED):** Run test and confirm failure.
- [ ] **Step 3 (GREEN):** Implement `RepoDocGenerator` supporting both deterministic AST synthesis and LLM-assisted generation.
- [ ] **Step 4 (VERIFY GREEN):** Re-run tests and confirm pass.
- [ ] **Step 5 (COMMIT):** Commit Task 2 changes.

---

### Task 3: Comprehensive Multi-Document Validator (`RepoDocValidator`)
**Files:**
- Create: `Chronodoc/packages/agent/src/validator/repoDocValidator.ts`
- Test: `Chronodoc/packages/agent/tests/validator/repoDocValidator.test.ts`

- [ ] **Step 1 (RED):** Write failing tests for `RepoDocValidator` verifying:
  - Detection of broken internal relative links between documents (e.g. link to non-existent file).
  - Verification of source code file paths and symbol references.
  - Detection and rejection of exposed API keys/secrets (e.g., `sk-...`, `AIzaSy...`, passwords).
  - Validation of Mermaid code block syntax (`flowchart`, `sequenceDiagram`, `erDiagram`).
  - Validation of single top-level heading and non-empty sections.
- [ ] **Step 2 (VERIFY RED):** Run test and confirm failure.
- [ ] **Step 3 (GREEN):** Implement `RepoDocValidator`.
- [ ] **Step 4 (VERIFY GREEN):** Re-run tests and confirm pass.
- [ ] **Step 5 (COMMIT):** Commit Task 3 changes.

---

### Task 4: Safe File Writer with Change Detection & Edit Preservation (`SafeFileWriter`)
**Files:**
- Create: `Chronodoc/packages/agent/src/writer/safeFileWriter.ts`
- Test: `Chronodoc/packages/agent/tests/writer/safeFileWriter.test.ts`

- [ ] **Step 1 (RED):** Write failing tests for `SafeFileWriter` verifying:
  - Writing documents to disk safely in structured subdirectories.
  - Skipping unchanged documents when regenerating.
  - Updating changed documents while preserving user manual edit blocks (`<!-- docagent:manual-start -->...<!-- docagent:manual-end -->`).
  - Reporting counts of created, updated, unchanged, and preserved documents.
  - Preventing path traversal outside designated output root.
- [ ] **Step 2 (VERIFY RED):** Run test and confirm failure.
- [ ] **Step 3 (GREEN):** Implement `SafeFileWriter`.
- [ ] **Step 4 (VERIFY GREEN):** Re-run tests and confirm pass.
- [ ] **Step 5 (COMMIT):** Commit Task 4 changes.

---

### Task 5: Machine-Readable Generation Report (`GenerationReportWriter`)
**Files:**
- Create: `Chronodoc/packages/agent/src/report/generationReport.ts`
- Test: `Chronodoc/packages/agent/tests/report/generationReport.test.ts`

- [ ] **Step 1 (RED):** Write failing tests for `GenerationReportWriter` verifying:
  - Emits `docs/metadata/generation-report.json`.
  - Contains generator version, schema version, ISO timestamp, summary counts.
  - Records documents generated and documents skipped with explicit reasons.
  - Records validation status, warnings, and unresolved references.
  - Ensures no API keys or secrets are ever present in the report.
- [ ] **Step 2 (VERIFY RED):** Run test and confirm failure.
- [ ] **Step 3 (GREEN):** Implement `GenerationReportWriter`.
- [ ] **Step 4 (VERIFY GREEN):** Re-run tests and confirm pass.
- [ ] **Step 5 (COMMIT):** Commit Task 5 changes.

---

### Task 6: Repository Documentation Orchestrator & CLI Integration
**Files:**
- Create: `Chronodoc/packages/agent/src/orchestrator/repositoryDocOrchestrator.ts`
- Modify: `Chronodoc/packages/agent/src/cli.ts`
- Modify: `Chronodoc/packages/agent/src/index.ts`
- Test: `Chronodoc/packages/agent/tests/orchestrator/repositoryDocOrchestrator.test.ts`

- [ ] **Step 1 (RED):** Write failing integration test for `RepositoryDocOrchestrator` verifying end-to-end repository documentation generation on a sample repository.
- [ ] **Step 2 (VERIFY RED):** Run test and confirm failure.
- [ ] **Step 3 (GREEN):** Implement `RepositoryDocOrchestrator`, wire into `cli.ts` so `docagent generate` (when invoked on repo or without target file) generates the full suite, and update public exports.
- [ ] **Step 4 (VERIFY GREEN):** Re-run test and confirm pass.
- [ ] **Step 5 (COMMIT):** Commit Task 6 changes.

---

### Task 7: Full Verification & Build
- [ ] Run full project test suite (`npm test`).
- [ ] Run TypeScript build (`npm run build`).
- [ ] Run demonstration script (`how-to-use/run-demo.ps1`).
- [ ] Generate documentation for `how-to-use/sample-project` and inspect output.
- [ ] Prepare comprehensive final report.
