# How to Use DocAgent (`docagent`)

Welcome! This folder provides a complete, runnable quickstart guide and sample project so you can download, install, and test DocAgent immediately on your machine without publishing anything to npm.

---

## 📦 Step 1: How to Download & Install (or Reinstall) It Right Now

The package tarball `docagent-1.0.0.tgz` is packaged in the root of the project.

### If you want to uninstall and reinstall fresh:
```bash
# 1. Uninstall the existing global binary:
npm uninstall -g docagent

# 2. Install fresh from the local tarball:
npm install -g ./docagent-1.0.0.tgz --force
```

### Verify the installation:
```bash
docagent --help
```

---

## ⚡ Step 2: Test It in the Clean Sample Demo Project

We provide a clean, self-contained demo project in [how-to-use/sample-project](file:///c:/Users/Dhyan%20Kannoth/OneDrive/Documents/Cad_Project/how-to-use/sample-project).

Navigate to the sample project in your terminal:

```bash
cd how-to-use/sample-project
```

### 1. Configure Your AI Provider (Interactive Menu)

Run the interactive setup wizard:

```bash
docagent init
```

You will see the Vite-style keyboard-navigable selection menu:

```text
◆ DOCAGENT
│
◆ Select your AI provider
│
  ● OpenAI (GPT-4o / GPT-4o-mini)
  ○ Anthropic (Claude 3.5 Sonnet)
  ○ Google Gemini (Gemini 2.5 Flash / Pro)
  ○ Mock / Offline (Local testing without API key)
│
  ↑/↓ Navigate   ↵ Select
```

- If you pick **Google Gemini**, **OpenAI**, or **Anthropic**, enter your API key (it is masked on-screen with `*`).
- If you pick **Mock / Offline**, it immediately configures without requiring an API key (ideal for zero-cost offline testing).

---

### 2. Generate the Full Repository Documentation Suite

To generate the complete interconnected documentation suite (`README.md`, `architecture/overview.md` with Mermaid diagrams, `components.md`, `data-flow.md`, `guides/`, and `metadata/`):

```bash
# Run inside sample-project:
docagent generate -p mock
```

*(Or from anywhere specifying the root directory: `docagent generate -r how-to-use/sample-project -p mock`)*

**Output:**
```text
◆ DOCAGENT
  Your codebase, documented.

  Project: sample-project
  Output:  docs
  Target:  Whole Repository Suite
  Provider:mock

  ○ Scanning repository files and AST symbols...
  ✔ Scanned 2 files (6 symbols discovered)
  ○ Analyzing project characteristics and planning documentation tree...
  ✔ Planned 8 documents (2 skipped with reasons)
  ○ Generating cohesive Markdown documentation suite...
  ✔ Generated 8 documentation files
  ○ Validating cross-document internal links, symbols, and secrets...
  ✔ Validation passed (8 links verified)
  ○ Writing documentation to disk with edit preservation...
  ✔ Wrote documents: 8 created, 0 updated, 0 unchanged
  ○ Generating machine-readable metadata report...
  ✔ Metadata report saved to docs\metadata\generation-report.json
  ▲ Skipped 'reference/api.md': No HTTP routes, REST endpoints, or server handlers detected in codebase.
  ▲ Skipped 'reference/database.md': No database schemas, ORM models, migrations, or database client dependencies detected in codebase.

✔ Documentation generated successfully
```

---

### 3. Test Safe Regeneration (Change Detection)

Run the command again without changing files:
```bash
docagent generate -p mock
```

**Output:**
```text
✔ Wrote documents: 0 created, 0 updated, 8 unchanged
```
DocAgent uses SHA-256 hashes to detect that nothing changed, preserving existing files and file modification timestamps!

---

### 4. Generate Documentation for an Individual Source File

If you only want documentation for a single source file (e.g. `src/orderService.ts`):

```bash
docagent generate src/orderService.ts -p mock
```

---

## 🏃 1-Click Automated Demo Script

Want to see the entire erase-and-recreate flow executed in 5 seconds?

Run the included PowerShell script from the `how-to-use` folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\how-to-use\run-demo.ps1
```

This script automatically:
1. Erases previous `docs/` in the sample project
2. Initializes DocAgent with the mock provider
3. Generates the full repository documentation suite (`8 created`)
4. Prints the generated `docs/README.md` and `docs/architecture/overview.md` (with Mermaid diagrams) directly to your terminal!
