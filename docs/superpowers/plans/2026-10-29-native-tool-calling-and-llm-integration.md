# Native Tool Calling & LLM Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real LLM provider integrations (OpenAI and Google Gemini) with native tool-calling capabilities (`astLookup`, `readFileSlice`, `findReferences`) into `@chronodoc/agent`, making installation and CLI usage frictionless: `npm i -g @chronodoc/agent` or `npx @chronodoc/agent generate <file>`.

**Architecture:** Extend the existing pure TypeScript pipeline with a lightweight, zero-dependency `LLMClient` interface supporting function calling. Equip `DocumentGenerator` and `DocumentValidator` with deterministic local repository tools. Support automatic environment variable loading from `env/.env` and CLI output to disk.

**Tech Stack:** Node.js (ESM), TypeScript 5.8+, Node Test Runner (`node:test`, `node:assert/strict`), native `fetch` (zero heavy external framework dependencies).

**Spec:** `docs/architecture/agent-architecture.md` and `docs/architecture/ADR-002-agent-runtime-and-langchain-tradeoffs.md`

## Global Constraints

- Must remain 100% native TypeScript (ESM) with zero heavy framework bloat (no LangChain, no Python).
- Zero external runtime setup for end users: running `npx @chronodoc/agent generate <file>` or `npm i @chronodoc/agent` must work immediately with standard Node.js (>= 18).
- Offline test suite must execute cleanly with zero external API keys via `MockLLMClient`.
- Maximum 2 revision attempts enforced on validation failures.
- Environment variables must automatically resolve from local `env/.env`, `.env`, or process environment variables.

## Review Focus

1. **Missing or invalid API key:** Gracefully throw a descriptive configuration error informing the user how to configure their key instead of an unhandled crash.
2. **File slice out of bounds:** `readFileSlice` must handle non-existent files or out-of-range line indices safely.
3. **Symbol not found in AST index:** `astLookup` must return `{ found: false, error: "Symbol not found" }` so the LLM can adjust.
4. **Tool execution cycle budget:** Prevent infinite model tool-calling loops with a strict max cycle count (5 turns).
5. **CLI frictionless UX:** Auto-create destination directories when writing generated documentation.

---

### Task 1: Lightweight LLM Client Abstraction & Provider Implementations

**Files:**
- Create: `Chronodoc/packages/agent/src/llm/types.ts`
- Create: `Chronodoc/packages/agent/src/llm/client.ts`
- Test: `Chronodoc/packages/agent/tests/llmClient.test.ts`

**Interfaces:**
- Produces:
```ts
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCallRequest[];
  toolCallId?: string;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCallRequest[];
}

export interface LLMClient {
  chat(messages: LLMMessage[], options?: { tools?: ToolDefinition[]; temperature?: number }): Promise<LLMResponse>;
}
```

- [ ] **Step 1: Write the failing test**
Create `Chronodoc/packages/agent/tests/llmClient.test.ts` testing MockLLMClient and validation of missing API keys.
- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- tests/llmClient.test.ts`
- [ ] **Step 3: Implement `src/llm/types.ts` and `src/llm/client.ts`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: Repository Inspection Tools (AST Lookup, File Slicing, References)

**Files:**
- Create: `Chronodoc/packages/agent/src/tools/repoTools.ts`
- Test: `Chronodoc/packages/agent/tests/repoTools.test.ts`

**Interfaces:**
- Produces:
```ts
export function createRepositoryTools(rootDir: string, scanIndex: RepositoryScanIndex): {
  tools: ToolDefinition[];
  executeTool: (name: string, args: Record<string, any>) => Promise<string>;
};
```

- [ ] **Step 1: Write the failing test**
Create `Chronodoc/packages/agent/tests/repoTools.test.ts` testing `astLookup`, `readFileSlice`, and `findReferences`.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `createRepositoryTools` in `src/tools/repoTools.ts`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: Tool-Calling Execution Loop in Document Generator & Validator

**Files:**
- Modify: `Chronodoc/packages/agent/src/generator/documentGenerator.ts`
- Modify: `Chronodoc/packages/agent/src/generator/types.ts`
- Test: `Chronodoc/packages/agent/tests/generatorToolCalling.test.ts`

- [ ] **Step 1: Write the failing test**
Create `Chronodoc/packages/agent/tests/generatorToolCalling.test.ts` verifying that tool call requests from the LLM client are executed and observations are fed back to the model.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Update `DocumentGenerator` with tool execution loop**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: Pipeline Integration & CLI Output Export

**Files:**
- Modify: `Chronodoc/packages/agent/src/orchestrator/pipelineOrchestrator.ts`
- Modify: `Chronodoc/packages/agent/src/cli.ts`
- Test: `Chronodoc/packages/agent/tests/cliGenerate.test.ts`

- [ ] **Step 1: Write the failing test**
Create `Chronodoc/packages/agent/tests/cliGenerate.test.ts` testing end-to-end execution and `--out` file writing.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Wire CLI and Orchestrator with repo tools and automatic `.env` discovery**
- [ ] **Step 4: Run all tests and build verification**
- [ ] **Step 5: Commit**

---

### Task 5: Frictionless Distribution & README Documentation

**Files:**
- Modify: `Chronodoc/packages/agent/README.md`
- Modify: `Chronodoc/packages/agent/package.json`

- [ ] **Step 1: Add quickstart README with one-line installation (`npx @chronodoc/agent generate <file>`)**
- [ ] **Step 2: Verify `npm pack --dry-run` and clean build**
- [ ] **Step 3: Commit**
