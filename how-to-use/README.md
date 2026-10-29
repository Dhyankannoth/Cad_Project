# How to Use DocAgent (`docagent`)

Welcome! This folder provides a complete, runnable quickstart guide and sample project so you can download, install, and test DocAgent immediately on your machine without publishing anything to npm.

---

## 📦 Step 1: How to Download & Install It Right Now

You can install DocAgent globally on your machine using either of the two methods below:

### Method A: Install the Downloadable Tarball (Recommended for Testing)

The downloadable package tarball `docagent-1.0.0.tgz` is already packaged in the main repository root. You can install it directly via npm:

```bash
# From the repository root:
npm install -g ./docagent-1.0.0.tgz
```

*(Or if you ever want to rebuild the tarball yourself, simply run `npm pack` in the main folder).*

### Method B: Install Directly from the Local Project Root

```bash
# From the repository root:
npm install -g .
```

Verify that DocAgent is installed and available:

```bash
docagent --help
```

---

## ⚡ Step 2: Test It in the Included Sample Project

We created a self-contained sample project in [how-to-use/sample-project](file:///c:/Users/Dhyan%20Kannoth/OneDrive/Documents/Cad_Project/how-to-use/sample-project).

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
  ○ Google Gemini (Gemini 1.5 Flash / Pro)
  ○ Mock / Offline (Local testing without API key)
│
  ↑/↓ Navigate   ↵ Select
```

- Use **Up and Down arrow keys** to navigate.
- Press **Enter** to select.
- If you pick OpenAI, Anthropic, or Gemini, type your API key (masked on-screen with `*`).
- If you pick **Mock / Offline**, it immediately configures without requiring an API key.

---

### 2. Scan the Project

Run repository scanning:

```bash
docagent scan
```

Output:
```text
◆ DOCAGENT
  Your codebase, documented.

  Project: sample-project
  Output:  how-to-use\sample-project

  ○ Scanning repository files...
  ✔ Repository scanned: 2 supported files discovered
```

Notice that DocAgent automatically detects `sample-project` as the main project directory and scans all files (`orderService.ts`, `paymentGateway.ts`) from the main directory onwards.

---

### 3. Generate Grounded Documentation

Generate technical documentation for `orderService.ts`:

#### Test Offline (Instant, No API Key Required):
```bash
docagent generate src/orderService.ts -p mock
```

#### Generate with Real AI (Using Configured Provider):
```bash
docagent generate src/orderService.ts
```

Output:
```text
◆ DOCAGENT
  Your codebase, documented.

  Project: sample-project
  Output:  docs/generated
  Target:  src/orderService.ts

  ○ Repository scanning...
  ✔ Repository scanning: 2 files discovered
  ○ Hybrid retrieval (AST + Lexical + Semantic)...
  ✔ Hybrid retrieval: context items retrieved
  ○ Context preparation & token budgeting...
  ✔ Context preparation: symbols indexed
  ○ Document generation...
  ✔ Document generation: 3 sections generated
  ○ Document validation (Deterministic AST & References)...
  ✔ Document validation passed
  ○ Writing documentation to output directory...
  ✔ Documentation saved to docs\generated\orderService_ts.md

✔ Documentation generated successfully
```

---

### 4. Validate Existing Documentation

Verify that all AST symbol references, function names, and interfaces in a document exist in the actual codebase:

```bash
docagent validate docs/generated/orderService_ts.md
```

Output:
```text
◆ DOCAGENT
  Your codebase, documented.

  ✔ Validation passed (3 sections verified)
```

---

## 🏃 1-Click Automated Demo Script

Want to see the entire flow executed automatically in 5 seconds?

Run the included PowerShell script from this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-demo.ps1
```

This script automatically:
1. Navigates to `sample-project/`
2. Initializes DocAgent with the mock provider
3. Scans all files
4. Generates verified documentation for `src/orderService.ts`
5. Validates the generated markdown against codebase AST
6. Prints the generated documentation directly to your terminal!
