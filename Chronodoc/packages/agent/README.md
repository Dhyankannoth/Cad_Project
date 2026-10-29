# DocAgent (`@chronodoc/agent`)

> **Your codebase, documented.**
> AI-powered, AST-grounded technical documentation with hybrid RAG, local tool execution, and deterministic verification.

DocAgent analyzes your codebase, extracts AST declarations and dependency graphs, and runs a bounded generation and validation loop to produce verified, high-quality technical documentation.

---

## ⚡ Quickstart

Generate documentation for any file in your project using `npx`:

```bash
# Initialize configuration (creates env/.env template)
npx @chronodoc/agent init

# Generate documentation for a target source file
npx @chronodoc/agent generate src/index.ts

# Test offline with mock provider (no API key required)
npx @chronodoc/agent generate src/index.ts -p mock

# Validate an existing document against the current codebase AST
npx @chronodoc/agent validate docs/generated/index_ts.md
```

---

## 📦 Global Installation

```bash
npm install -g @chronodoc/agent
```

Once installed, use the short `docagent` command:

```bash
docagent init
docagent generate src/server.ts
docagent validate docs/generated/server_ts.md
```

---

## 🛠️ Commands & Options

```text
Usage: docagent [options] [command]

Your codebase, documented.

Options:
  -V, --version                 Output version number
  --no-color                    Disable colored terminal output
  --quiet                       Suppress non-essential messages
  --verbose                     Show detailed diagnostic stack traces
  --json                        Output machine-readable JSON results
  -h, --help                    Display help

Commands:
  init [options]                Initialize DocAgent environment configuration
  scan [directory]              Scan repository files, AST symbols, and dependencies
  generate [options] <file>     Generate verified technical documentation (default)
  validate [options] <docFile>  Validate existing markdown against codebase AST
```

### Command Flags:
- `-o, --out <dir>`: Destination directory (defaults to `docs/generated`)
- `-p, --provider <provider>`: LLM provider: `gemini` | `openai` | `mock`
- `-s, --style <style>`: `developer-guide` | `api-reference` | `architecture-overview`
- `-r, --root <dir>`: Repository root directory (default: `.`)

---

## 💻 Programmatic API (TypeScript & Node.js)

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
    target: "src/scanner/astExtractor.ts",
    rootDir: ".",
    style: "developer-guide",
    outDir: "docs/generated"
});

console.log(`Status: ${result.status}`); // "validated" | "unapproved"
console.log(`Saved to: ${result.savedFilePath}`);
```

---

## 🛡️ Architecture & Verification

1. **AST Grounding**: Extracts real types, function parameters, interfaces, and imports using TypeScript's official Compiler API.
2. **Native Tool Calling**: Equips LLMs with local read-only repository tools (`astLookup`, `readFileSlice`, `findReferences`) to inspect code logic without token overflow.
3. **Deterministic Validation**: Catches hallucinated symbol names, broken file references, and markdown hierarchy violations before approval.
4. **Bounded Self-Revision**: Limits automated revisions to a maximum of 2 cycles on affected sections only.

---

## License

Apache-2.0
