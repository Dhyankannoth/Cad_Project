# @chronodoc/agent

> AI Documentation Agent with Hybrid RAG, AST Grounding, Native Tool Calling, and Bounded Self-Revision.

`@chronodoc/agent` scans your codebase, extracts AST symbols and dependencies, performs hybrid retrieval, and uses an autonomous agent with local repository tools to generate verified, section-based technical documentation.

---

## ⚡ Quickstart (Zero Installation)

Generate documentation for any file in your codebase using `npx`:

```bash
# Scan repository files
npx @chronodoc/agent scan .

# Generate documentation for a specific file
npx @chronodoc/agent generate src/index.ts

# Generate and save directly to your documentation folder
npx @chronodoc/agent generate src/index.ts --out docs/generated
```

---

## 📦 Installation

Install globally for CLI use:
```bash
npm install -g @chronodoc/agent
```

Or add to your project dependencies:
```bash
npm install @chronodoc/agent
```

---

## 🔑 Configuration

Chronodoc automatically loads environment variables from `env/.env` or `.env`.

Set your preferred provider and API key:

```env
# Primary LLM Provider: "openai" | "gemini" | "mock"
LLM_PROVIDER=gemini

# API Key
GEMINI_API_KEY=your_gemini_api_key_here
# or
OPENAI_API_KEY=your_openai_api_key_here

# Optional Model Overrides
LLM_MODEL=gemini-1.5-flash
```

---

## 🛠️ CLI Usage

```bash
# Scan supported code files and AST dependencies
chronodoc-agent scan [directory]

# Generate documentation
chronodoc-agent generate <file> [options]

Options:
  --root <dir>           Repository root directory (default: current directory)
  --out <dir>            Directory where generated markdown should be saved
  --provider <provider>  "gemini" | "openai" | "mock"
  --style <style>        "developer-guide" | "api-reference" | "architecture-overview"
  --help, -h             Show CLI options
  --version, -v          Show version
```

---

## 💻 Programmatic Usage (Node.js & TypeScript)

```typescript
import { PipelineOrchestrator, loadConfig } from "@chronodoc/agent";

const config = loadConfig();
const orchestrator = new PipelineOrchestrator({
    provider: config.llmProvider,
    apiKey: config.geminiApiKey || config.openaiApiKey,
    tokenBudget: 8000,
    maxRevisionAttempts: 2
});

const result = await orchestrator.execute({
    target: "src/server.ts",
    rootDir: ".",
    style: "developer-guide",
    outDir: "docs/api"
});

console.log(`Status: ${result.status}`);
console.log(`Output:\n${result.document.rawMarkdown}`);
```

---

## 🛡️ Architecture & Verification

- **AST Symbol Grounding**: Uses the official TypeScript compiler API to extract real types, signatures, and imports.
- **Native Tool Calling**: Equipped with local repository inspection tools (`astLookup`, `readFileSlice`, `findReferences`).
- **Deterministic Validation**: Catches non-existent symbols and broken file paths before approval.
- **Bounded Self-Revision**: Enforces strict revision limits (max 2 attempts) to guarantee cost-predictable execution without infinite loops.

---

## License

Apache-2.0
