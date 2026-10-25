# AI Documentation Agent Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready, downloadable npm package (`@chronodoc/agent`) implementing a 7-stage documentation agent pipeline with hybrid RAG, section-based generation, deterministic/semantic validation, and bounded targeted revisions.

**Architecture:** The agent operates a sequential pipeline: Repository Scanning (AST symbols + file discovery) -> Hybrid RAG (Structural + Lexical BM25 + Semantic Cosine) -> Context Builder (deduplication + token budget) -> Agent 1: Document Generator (modular section-based Markdown) -> Agent 2: Document Validator (deterministic AST/path checks + semantic LLM verification) -> Targeted Revision (max 2 attempts on affected sections only) -> Final Document-Level Validation & Output (`ValidatedDocumentation` or `UnapprovedDraft`).

**Tech Stack:** Node.js (ESM), TypeScript 5.8+, Node Test Runner (`node:test`, `node:assert/strict`), `tsx`, TypeScript Compiler API (`typescript` for AST parsing).

**Spec:** `docs/architecture/agent-architecture.md`

## Global Constraints

- Must be packaged and exported as a valid npm package with ESM `"type": "module"`, TypeScript declaration files (`.d.ts`), and strict exports map.
- Maximum 2 revision attempts permitted after initial generation before triggering fallback or outputting an unapproved draft.
- Documents must use identifiable section objects (`DocumentSection`) so revisions can target single sections while leaving unaffected content intact.
- Deterministic checks (symbol existence in AST, file paths exist, markdown hierarchy) must run prior to expensive LLM semantic checks.
- If validation persistently fails, the system must retain the result as `UnapprovedDraft` with an unresolved issues report rather than failing silently or returning a false pass.
- No hardcoded API keys; all configuration and credentials must be loaded via environment variables or `env/.env`.

## Review Focus

1. **Inaccessible file/directory during repository scanning:** Must catch permission errors and populate `warnings` without crashing when `allowPartial` is set.
2. **Circular imports in source files:** AST dependency graph traversal in structural retrieval must terminate safely without recursion overflow.
3. **Zero retrieval matches or empty repository:** Context builder must produce a valid structured context skeleton without exceeding token budget or crashing generator.
4. **Hallucinated symbol names in generated documentation:** Validator must catch non-existent symbol references deterministically against the AST index and map them to the specific section ID.
5. **Persistent validation failure after 2 revision attempts:** Orchestrator must terminate gracefully and return `status: "unapproved"` with all unresolved issues attached, preserving the generated draft.

---

### Task 1: Package Scaffolding, TypeScript Build & Environment Configuration

**Files:**
- Create: `Chronodoc/packages/agent/src/config/env.ts`
- Modify: `Chronodoc/packages/agent/package.json`
- Modify: `Chronodoc/packages/agent/tsconfig.json`
- Test: `Chronodoc/packages/agent/tests/config.test.ts`

**Interfaces:**
- Produces: `loadConfig(envOverrides?: Partial<AgentConfig>): AgentConfig`
```ts
export interface AgentConfig {
  llmProvider: 'openai' | 'gemini' | 'anthropic' | 'mock';
  openaiApiKey?: string;
  geminiApiKey?: string;
  anthropicApiKey?: string;
  llmModel: string;
  embeddingModel: string;
  llmTemperature: number;
  maxTokens: number;
  maxRevisionAttempts: number;
  tokenBudget: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  cacheDir: string;
}
```

- [ ] **Step 1: Write the failing test**
Create `Chronodoc/packages/agent/tests/config.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config/env.js";

test("loadConfig returns default configuration when no env is provided", () => {
    const config = loadConfig({});
    assert.equal(config.maxRevisionAttempts, 2);
    assert.equal(config.tokenBudget, 8000);
    assert.equal(config.llmProvider, "openai");
});

test("loadConfig respects custom overrides", () => {
    const config = loadConfig({ maxRevisionAttempts: 1, llmProvider: "mock" });
    assert.equal(config.maxRevisionAttempts, 1);
    assert.equal(config.llmProvider, "mock");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- tests/config.test.ts`
Expected: FAIL with "Cannot find module '../src/config/env.js'"

- [ ] **Step 3: Implement `loadConfig` in `src/config/env.ts` and configure npm package standards**
In `package.json`: set name `"@chronodoc/agent"`, exports map (`"."`, `"./scanner"`, `"./retrieval"`, `"./generator"`, `"./validator"`, `"./orchestrator"`), `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`, `"files": ["dist", "env"]`.
In `tsconfig.json`: enable `"outDir": "./dist"`, `"rootDir": "./src"`.
In `src/config/env.ts`: parse `process.env` with sensible defaults.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -- tests/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add package.json tsconfig.json env/ src/config/ tests/config.test.ts
git commit -m "feat(config): standardize npm package and environment configuration"
```

---

### Task 2: Repository Scanner & AST Symbol Extraction

**Files:**
- Modify: `Chronodoc/packages/agent/src/scanner/scanRepository.ts`
- Create: `Chronodoc/packages/agent/src/scanner/astExtractor.ts`
- Modify: `Chronodoc/packages/agent/tests/scanRepository.test.ts`
- Test: `Chronodoc/packages/agent/tests/astExtractor.test.ts`

**Interfaces:**
- Consumes: `scanRepository(rootDirectory, options)`
- Produces: `extractSymbols(filePath: string, sourceCode: string): SymbolIndex`
```ts
export interface CodeSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'method';
  exported: boolean;
  filePath: string;
  line: number;
  jsdoc?: string;
  signature?: string;
}

export interface DependencyLink {
  fromFile: string;
  toFileOrModule: string;
  importedSymbols: string[];
}

export interface RepositoryScanIndex {
  files: string[];
  symbols: Map<string, CodeSymbol[]>;
  dependencies: DependencyLink[];
  warnings: string[];
  complete: boolean;
}
```

- [ ] **Step 1: Write the failing test**
Create `Chronodoc/packages/agent/tests/astExtractor.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSymbols } from "../src/scanner/astExtractor.js";

test("extractSymbols extracts exported functions, classes, and types from TypeScript", () => {
    const code = `
      /** Calculate total amount */
      export function calculateTotal(items: string[]): number { return items.length; }
      export class OrderProcessor {}
      export interface Order { id: string; }
    `;
    const symbols = extractSymbols("src/order.ts", code);
    assert.equal(symbols.length, 3);
    assert.equal(symbols.find(s => s.name === "calculateTotal")?.kind, "function");
    assert.equal(symbols.find(s => s.name === "OrderProcessor")?.kind, "class");
    assert.equal(symbols.find(s => s.name === "Order")?.kind, "interface");
});
```
And update `tests/scanRepository.test.ts` test 3 to support optional `readDirectory` in `ScanOptions`.

- [ ] **Step 2: Run tests to verify they fail**
Run: `npm test -- tests/astExtractor.test.ts tests/scanRepository.test.ts`
Expected: FAIL with missing `astExtractor.js` and missing option in `scanRepository.ts`.

- [ ] **Step 3: Implement `astExtractor.ts` using TypeScript compiler API and update `scanRepository.ts`**
In `scanRepository.ts`: accept optional `readDirectory` in `ScanOptions` to resolve test 3.
In `astExtractor.ts`: use `ts.createSourceFile` to traverse AST nodes (`FunctionDeclaration`, `ClassDeclaration`, `InterfaceDeclaration`, `TypeAliasDeclaration`, `VariableStatement`, `ImportDeclaration`).

- [ ] **Step 4: Run tests to verify they pass**
Run: `npm test -- tests/astExtractor.test.ts tests/scanRepository.test.ts`
Expected: PASS (all 4 tests pass)

- [ ] **Step 5: Commit**
```bash
git add src/scanner/ tests/astExtractor.test.ts tests/scanRepository.test.ts
git commit -m "feat(scanner): add AST symbol extraction and directory reader injection"
```

---

### Task 3: Hybrid Retrieval Pipeline (Structural + Lexical + Semantic)

**Files:**
- Create: `Chronodoc/packages/agent/src/retrieval/bm25.ts`
- Create: `Chronodoc/packages/agent/src/retrieval/structural.ts`
- Create: `Chronodoc/packages/agent/src/retrieval/semantic.ts`
- Create: `Chronodoc/packages/agent/src/retrieval/hybridRetriever.ts`
- Test: `Chronodoc/packages/agent/tests/hybridRetriever.test.ts`

**Interfaces:**
- Consumes: `RepositoryScanIndex` from Task 2, `AgentConfig` from Task 1.
- Produces: `retrieveContext(query: string, index: RepositoryScanIndex, options?: RetrievalOptions): Promise<RetrievedItem[]>`
```ts
export interface RetrievedItem {
  id: string;
  filePath: string;
  snippet: string;
  score: number;
  source: 'structural' | 'keyword' | 'semantic';
  symbolName?: string;
}

export interface RetrievalOptions {
  topK?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  structuralWeight?: number;
}
```

- [ ] **Step 1: Write the failing test**
Create `Chronodoc/packages/agent/tests/hybridRetriever.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { HybridRetriever } from "../src/retrieval/hybridRetriever.js";

test("HybridRetriever ranks and deduplicates structural, lexical and semantic matches", async () => {
    const retriever = new HybridRetriever({ mockSemantic: true });
    retriever.indexCorpus([
        { filePath: "src/auth.ts", content: "export function authenticateUser(token: string) { ... }" },
        { filePath: "docs/auth.md", content: "# Authentication Guide\nUse authenticateUser to log in." }
    ]);

    const results = await retriever.search("authenticateUser token");
    assert.ok(results.length > 0);
    assert.equal(results[0]?.filePath, "src/auth.ts");
    assert.ok(results.every(r => r.score > 0));
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- tests/hybridRetriever.test.ts`
Expected: FAIL with "Cannot find module '../src/retrieval/hybridRetriever.js'"

- [ ] **Step 3: Implement HybridRetriever, BM25 tokenizer, structural graph lookup, and reciprocal rank fusion**
Implement `bm25.ts` for TF-IDF/BM25 scoring.
Implement `structural.ts` for file & symbol relationship lookup.
Implement `semantic.ts` for vector embeddings (with mock fallback).
Implement `hybridRetriever.ts` combining results with Reciprocal Rank Fusion (RRF) and deduplication.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -- tests/hybridRetriever.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/retrieval/ tests/hybridRetriever.test.ts
git commit -m "feat(retrieval): implement hybrid RAG pipeline with structural, BM25 and semantic ranking"
```

---

### Task 4: Context Builder & Token Budget Management

**Files:**
- Create: `Chronodoc/packages/agent/src/context/contextBuilder.ts`
- Test: `Chronodoc/packages/agent/tests/contextBuilder.test.ts`

**Interfaces:**
- Consumes: `RetrievedItem[]` from Task 3, `RepositoryScanIndex` from Task 2.
- Produces: `buildContext(target: string, items: RetrievedItem[], options: ContextOptions): AssembledContext`
```ts
export interface AssembledContext {
  target: string;
  estimatedTokens: number;
  files: Array<{ path: string; snippet: string }>;
  symbols: CodeSymbol[];
  documentationSnippets: string[];
  formattedPromptContext: string;
}

export interface ContextOptions {
  tokenBudget: number;
  docStyle?: 'api-reference' | 'architecture-overview' | 'developer-guide';
}
```

- [ ] **Step 1: Write the failing test**
Create `Chronodoc/packages/agent/tests/contextBuilder.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContext } from "../src/context/contextBuilder.js";

test("buildContext formats context and enforces token budget", () => {
    const items = [
        { id: "1", filePath: "src/user.ts", snippet: "export class User {}", score: 0.9, source: "structural" as const },
        { id: "2", filePath: "docs/user.md", snippet: "# User Model", score: 0.8, source: "keyword" as const }
    ];

    const context = buildContext("src/user.ts", items, { tokenBudget: 500 });
    assert.equal(context.target, "src/user.ts");
    assert.ok(context.estimatedTokens <= 500);
    assert.ok(context.formattedPromptContext.includes("User"));
});

test("buildContext handles empty retrieval without crashing", () => {
    const context = buildContext("src/empty.ts", [], { tokenBudget: 500 });
    assert.equal(context.files.length, 0);
    assert.ok(context.formattedPromptContext.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- tests/contextBuilder.test.ts`
Expected: FAIL with "Cannot find module '../src/context/contextBuilder.js'"

- [ ] **Step 3: Implement `buildContext` in `src/context/contextBuilder.ts`**
Implement token estimation (approx 4 chars/token heuristic).
Sort items by score, deduplicate snippets, prune low-relevance spans when exceeding `tokenBudget`.
Format structured markdown block ready for LLM consumption.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -- tests/contextBuilder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/context/ tests/contextBuilder.test.ts
git commit -m "feat(context): implement token-bounded context builder"
```

---

### Task 5: Agent 1 - Document Generator (Section-Based Model)

**Files:**
- Create: `Chronodoc/packages/agent/src/generator/documentGenerator.ts`
- Create: `Chronodoc/packages/agent/src/generator/types.ts`
- Test: `Chronodoc/packages/agent/tests/documentGenerator.test.ts`

**Interfaces:**
- Consumes: `AssembledContext` from Task 4.
- Produces: `generateDocumentation(context: AssembledContext, options?: GeneratorOptions): Promise<GeneratedDocument>`
```ts
export interface DocumentSection {
  id: string; // e.g. "overview", "api-reference", "dependencies", "examples"
  title: string;
  content: string;
  references: string[];
  status: 'generated' | 'revised' | 'approved' | 'unapproved';
}

export interface GeneratedDocument {
  id: string;
  title: string;
  style: string;
  sections: DocumentSection[];
  rawMarkdown: string;
  generatedAt: string;
}
```

- [ ] **Step 1: Write the failing test**
Create `Chronodoc/packages/agent/tests/documentGenerator.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DocumentGenerator } from "../src/generator/documentGenerator.js";

test("DocumentGenerator produces section-based modular document structure", async () => {
    const generator = new DocumentGenerator({ provider: "mock" });
    const mockContext = {
        target: "src/auth.ts",
        estimatedTokens: 100,
        files: [{ path: "src/auth.ts", snippet: "export function login() {}" }],
        symbols: [{ name: "login", kind: "function" as const, exported: true, filePath: "src/auth.ts", line: 1 }],
        documentationSnippets: [],
        formattedPromptContext: "Target: src/auth.ts\nSymbols: login"
    };

    const doc = await generator.generate(mockContext, { style: "api-reference" });
    assert.ok(doc.sections.length >= 2);
    assert.ok(doc.sections.some(s => s.id === "overview"));
    assert.ok(doc.sections.every(s => s.status === "generated"));
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- tests/documentGenerator.test.ts`
Expected: FAIL with "Cannot find module '../src/generator/documentGenerator.js'"

- [ ] **Step 3: Implement `DocumentGenerator` and section parser**
In `src/generator/types.ts`: define document and section types.
In `src/generator/documentGenerator.ts`: create generator engine supporting LLM provider calls (OpenAI, Gemini, Anthropic) with pluggable mock provider for tests. Parse generated markdown into distinct sections by `#` / `##` headings with assigned unique IDs and symbol references.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -- tests/documentGenerator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/generator/ tests/documentGenerator.test.ts
git commit -m "feat(generator): implement section-based document generator with mock provider"
```

---

### Task 6: Agent 2 - Document Validator (Deterministic & Semantic Checks)

**Files:**
- Create: `Chronodoc/packages/agent/src/validator/documentValidator.ts`
- Create: `Chronodoc/packages/agent/src/validator/types.ts`
- Test: `Chronodoc/packages/agent/tests/documentValidator.test.ts`

**Interfaces:**
- Consumes: `GeneratedDocument` from Task 5, `RepositoryScanIndex` from Task 2.
- Produces: `validateDocument(doc: GeneratedDocument, index: RepositoryScanIndex): Promise<ValidationResult>`
```ts
export interface ValidationIssue {
  sectionId: string;
  type: 'symbol_not_found' | 'invalid_path' | 'structural_violation' | 'semantic_inconsistency';
  severity: 'error' | 'warning';
  message: string;
  evidence?: string;
}

export interface ValidationResult {
  passed: boolean;
  issues: ValidationIssue[];
  affectedSectionIds: string[];
}
```

- [ ] **Step 1: Write the failing test**
Create `Chronodoc/packages/agent/tests/documentValidator.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DocumentValidator } from "../src/validator/documentValidator.js";

test("DocumentValidator detects hallucinated symbols and non-existent file paths", async () => {
    const validator = new DocumentValidator();
    const mockIndex = {
        files: ["src/realFile.ts"],
        symbols: new Map([["realFunction", [{ name: "realFunction", kind: "function" as const, exported: true, filePath: "src/realFile.ts", line: 1 }]]]),
        dependencies: [],
        warnings: [],
        complete: true
    };

    const invalidDoc = {
        id: "doc-1",
        title: "Test Doc",
        style: "api-reference",
        generatedAt: new Date().toISOString(),
        rawMarkdown: "",
        sections: [
            { id: "sec-1", title: "API", content: "Calls `fakeFunction()` in `src/fakeFile.ts`", references: ["fakeFunction", "src/fakeFile.ts"], status: "generated" as const }
        ]
    };

    const result = await validator.validate(invalidDoc, mockIndex);
    assert.equal(result.passed, false);
    assert.ok(result.issues.some(i => i.type === "symbol_not_found"));
    assert.ok(result.issues.some(i => i.type === "invalid_path"));
    assert.deepEqual(result.affectedSectionIds, ["sec-1"]);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- tests/documentValidator.test.ts`
Expected: FAIL with "Cannot find module '../src/validator/documentValidator.js'"

- [ ] **Step 3: Implement `DocumentValidator` in `src/validator/documentValidator.ts`**
Implement deterministic checks:
1. Verify references against `RepositoryScanIndex.symbols`.
2. Verify paths against `RepositoryScanIndex.files`.
3. Check structural validity (headings, non-empty sections).
4. Provide optional semantic consistency checks hook.
Aggregate issues and extract `affectedSectionIds`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -- tests/documentValidator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/validator/ tests/documentValidator.test.ts
git commit -m "feat(validator): implement deterministic and semantic document validator"
```

---

### Task 7: Targeted Revision & Bounded Feedback Loop Orchestrator

**Files:**
- Create: `Chronodoc/packages/agent/src/orchestrator/revisionAgent.ts`
- Create: `Chronodoc/packages/agent/src/orchestrator/pipelineOrchestrator.ts`
- Test: `Chronodoc/packages/agent/tests/orchestrator.test.ts`

**Interfaces:**
- Consumes: All components from Tasks 1-6.
- Produces: `runPipeline(targetFile: string, rootDir: string): Promise<PipelineResult>`
```ts
export interface PipelineResult {
  status: 'validated' | 'unapproved';
  document: GeneratedDocument;
  revisionAttempts: number;
  validationHistory: ValidationResult[];
  unresolvedIssues?: ValidationIssue[];
}
```

- [ ] **Step 1: Write the failing test**
Create `Chronodoc/packages/agent/tests/orchestrator.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PipelineOrchestrator } from "../src/orchestrator/pipelineOrchestrator.js";

test("PipelineOrchestrator enforces max 2 revision attempts and outputs unapproved draft on persistent failure", async () => {
    // Setup orchestrator with mock generator that repeatedly fails validation
    const orchestrator = new PipelineOrchestrator({
        maxRevisionAttempts: 2,
        alwaysFailValidation: true
    });

    const result = await orchestrator.execute({ target: "src/test.ts", rootDir: "." });
    assert.equal(result.status, "unapproved");
    assert.equal(result.revisionAttempts, 2);
    assert.ok(result.unresolvedIssues && result.unresolvedIssues.length > 0);
});

test("PipelineOrchestrator approves document when validation passes", async () => {
    const orchestrator = new PipelineOrchestrator({
        maxRevisionAttempts: 2,
        alwaysFailValidation: false
    });

    const result = await orchestrator.execute({ target: "src/test.ts", rootDir: "." });
    assert.equal(result.status, "validated");
    assert.ok(result.document.sections.every(s => s.status === "approved"));
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- tests/orchestrator.test.ts`
Expected: FAIL with "Cannot find module '../src/orchestrator/pipelineOrchestrator.js'"

- [ ] **Step 3: Implement `revisionAgent.ts` and `pipelineOrchestrator.ts`**
In `revisionAgent.ts`: target *only* `affectedSectionIds`, apply revision prompt with issue descriptions and evidence, preserve unaffected sections.
In `pipelineOrchestrator.ts`:
1. Execute scan -> hybrid retrieval -> context builder -> initial document generation.
2. Enter validation loop:
   - Run validator.
   - If passed: perform final document-level validation, mark sections `"approved"`, return `status: "validated"`.
   - If failed: check `revisionAttempts < maxRevisionAttempts` (max 2).
     - If attempts remain: increment count, run targeted revision on affected sections, loop back to validation.
     - If attempts exhausted: attempt controlled full regeneration once.
     - If still failing: mark sections `"unapproved"`, return `status: "unapproved"` with attached `unresolvedIssues`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -- tests/orchestrator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/orchestrator/ tests/orchestrator.test.ts
git commit -m "feat(orchestrator): implement bounded targeted revision pipeline and draft output"
```

---

### Task 8: Public Package Exports, CLI Entrypoint & Distribution Build Verification

**Files:**
- Create: `Chronodoc/packages/agent/src/index.ts`
- Create: `Chronodoc/packages/agent/src/cli.ts`
- Modify: `Chronodoc/packages/agent/package.json`
- Test: `Chronodoc/packages/agent/tests/package.test.ts`

**Interfaces:**
- Consumes: All modules from Tasks 1-7.
- Produces: Public NPM package exports and CLI command executable via `npx @chronodoc/agent`.

- [ ] **Step 1: Write the failing test**
Create `Chronodoc/packages/agent/tests/package.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as AgentPackage from "../src/index.js";

test("Public API exports all required pipeline components", () => {
    assert.ok(typeof AgentPackage.scanRepository === "function");
    assert.ok(typeof AgentPackage.HybridRetriever === "function");
    assert.ok(typeof AgentPackage.buildContext === "function");
    assert.ok(typeof AgentPackage.DocumentGenerator === "function");
    assert.ok(typeof AgentPackage.DocumentValidator === "function");
    assert.ok(typeof AgentPackage.PipelineOrchestrator === "function");
    assert.ok(typeof AgentPackage.loadConfig === "function");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- tests/package.test.ts`
Expected: FAIL with "Cannot find module '../src/index.js'"

- [ ] **Step 3: Implement `src/index.ts`, `src/cli.ts`, and npm build scripts**
In `src/index.ts`: export barrel of all modules and types.
In `src/cli.ts`: add CLI subcommands (`scan`, `generate`) with `#!/usr/bin/env node` shebang.
In `package.json`: add `"bin": { "chronodoc-agent": "./dist/cli.js" }`, add `"scripts": { "build": "tsc", "test": "tsx --test tests/*.test.ts", "prepack": "npm run build" }`.

- [ ] **Step 4: Run all tests and build verification**
Run: `npm run build && npm test && npm pack --dry-run`
Expected: PASS with 0 build errors, all tests passing, and valid npm tarball preview.

- [ ] **Step 5: Commit**
```bash
git add src/index.ts src/cli.ts package.json tests/package.test.ts
git commit -m "feat(package): expose public barrel API, CLI binary, and npm publication build"
```
