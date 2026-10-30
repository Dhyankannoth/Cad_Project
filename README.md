# DocAgent (`docagent`)

> **Your codebase, documented.**  
> AI-powered, AST-grounded technical documentation platform with hybrid RAG, local tool execution, and deterministic AST verification.

---

## 🚀 Quick Setup & Run (No npm publish required)

You do **not** need DocAgent to be published on the npm registry. You can run it immediately directly from this main directory using any of the methods below.

### Option 1: Global CLI Command (Recommended)

Run once from this main directory:

```bash
npm install -g .
```

Now you can use `docagent`, `doc`, or `chronodoc` anywhere on your computer:

```bash
# 1. Initialize environment (.env template)
docagent init

# 2. Add your Gemini or OpenAI API key in env/.env
# GEMINI_API_KEY=your_key_here

# 3. Generate documentation for any file
docagent generate Chronodoc/packages/agent/src/scanner/astExtractor.ts

# 4. Or test offline immediately with the mock provider (no API key needed!)
docagent generate Chronodoc/packages/agent/src/scanner/astExtractor.ts -p mock
```

---

### Option 2: Run Directly from Main Directory (Zero Installation)

Without installing anything globally:

```bash
# Initialize env configuration
npm run init

# Scan repository files
npm run scan

# Generate documentation using npm script
npm run docagent -- generate Chronodoc/packages/agent/src/scanner/astExtractor.ts -p mock

# Or run via npx directly from root
npx . generate Chronodoc/packages/agent/src/scanner/astExtractor.ts -p mock

# Or direct Node invocation
node Chronodoc/packages/agent/dist/cli.js generate Chronodoc/packages/agent/src/scanner/astExtractor.ts -p mock
```

---

## 📥 How Another User Downloads & Runs It

Anyone who wants to use this tool can get it from the **main directory** via Git:

```bash
# 1. Clone the repository from GitHub
git clone https://github.com/Dhyankannoth/Cad_Project.git

# 2. Enter the main directory
cd Cad_Project

# 3. Install dependencies and automatically build
npm install

# 4. Link globally or run locally
npm install -g .
docagent --help
```

---

## 🔑 Setting Up Your API Key

1. Run:
   ```bash
   docagent init
   ```
2. Open the generated `env/.env` file and insert your API key:
   ```env
   LLM_PROVIDER=gemini
   GEMINI_API_KEY=AIzaSy...
   # Or for OpenAI:
   # LLM_PROVIDER=openai
   # OPENAI_API_KEY=sk-...
   ```
3. Run the generator:
   ```bash
   docagent generate <path-to-file>
   ```

---

## 🛠️ CLI Commands & Flags

```text
Usage: docagent [options] [command]

Options:
  -V, --version                 Output the version number
  --no-color                    Disable colored terminal output
  --quiet                       Suppress non-essential messages
  --verbose                     Show detailed diagnostic output
  --json                        Output results in JSON format
  -h, --help                    Display help for command

Commands:
  init [options]                Initialize DocAgent environment (.env template)
  scan [directory]              Scan repository files, AST symbols, and dependencies
  validate [options] <docFile>  Validate an existing doc against codebase AST
  generate [options] <file>     Generate verified technical documentation (default)
```

---

## 🏗️ Monorepo Architecture

Chronodoc is organized as an npm monorepo with multiple specialized packages:

```text
Cad_Project/
├── Chronodoc/
│   └── packages/
│       ├── agent/                 # CLI and AI Documentation Agent Core
│       │   ├── src/
│       │   └── dist/
│       └── web/                   # Interactive Documentation Web GUI (React + Vite)
│           ├── src/
│           └── public/
├── supabase/                      # PostgreSQL migrations & Edge Functions
├── docs/                          # Architecture specs & decisions (ADR-001, AWS specs)
├── how-to-use/                    # Hands-on demo & sample project
└── .env.example                   # Unified environment configuration template
```

---

## 💻 Web GUI Application (`packages/web`)

The interactive web GUI provides a visual interface for managing repositories, previewing generated documentation, and inspecting AST graphs.

### Running the Web GUI Locally:

```bash
# 1. Start the Vite development server from repository root
npm run dev:web

# 2. Or build the production static bundle
npm run build:web
```

The GUI will be accessible at `http://localhost:5173`. Make sure to configure your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` or `Chronodoc/packages/web/.env`.

---

## 🧪 Testing & Building

```bash
# Run the agent test suite
npm test

# Build all packages (CLI agent + Web GUI)
npm run build
```
