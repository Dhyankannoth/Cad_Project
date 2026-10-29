# Interactive AI Provider Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Vite-style, keyboard-navigable interactive AI provider selection menu and masked API key input for DocAgent, saving configuration securely to `env/.env`.

**Architecture:** Introduce `InteractivePromptHandler` with a production `@clack/prompts` implementation (`ClackPromptHandler`) and a mockable test implementation. Integrate into `executeInitCommand` and the `docagent init` CLI command with clean non-interactive fallbacks. Add `AnthropicLLMClient` to complete support for OpenAI, Google Gemini, Anthropic, and Mock providers.

**Tech Stack:** TypeScript, Node.js (`node:test`), `@clack/prompts`, `picocolors`, `commander`.

**Spec:** User prompt requirements: Up/Down arrow key navigation, Enter to confirm, masked API key input with validation, provider-specific configuration in `env/.env`, zero key exposure in logs/errors, preserving all existing CLI capabilities and tests.

## Global Constraints

- Never print API keys in terminal logs, diagnostics, or error messages.
- Must support arrow key navigation (`↑/↓ Navigate   ↵ Select`) and Enter confirmation.
- Input must be masked with `*` or bullets and reject empty strings gracefully.
- Display only supported AI providers: Google Gemini, OpenAI, Anthropic, Mock (Offline).
- Preserve existing non-interactive test behaviors; do not block in CI or headless environments.

## Review Focus

1. Non-TTY environments (CI, piped stdin, automated tests) must not hang on interactive prompts.
2. User pressing Ctrl+C or Escape must cancel gracefully with exit code 0 and no unhandled promise rejections.
3. Whitespace-only or empty API keys must be rejected with helpful validation messages.
4. Selecting Mock provider must bypass API key input and configure `LLM_PROVIDER=mock`.
5. Existing `env/.env` values must be cleanly updated without duplicating keys or corrupting file structure.

---

### Task 1: Anthropic LLM Client & Provider Support

**Files:**
- Modify: `Chronodoc/packages/agent/src/llm/client.ts`
- Modify: `Chronodoc/packages/agent/src/cli.ts:275-285`
- Test: `Chronodoc/packages/agent/tests/llmClient.test.ts`

**Interfaces:**
- Produces: `AnthropicLLMClient implements LLMClient`
- Produces: `createLLMClient({ provider: "anthropic", apiKey: "..." })`

- [ ] **Step 1: Write the failing test for Anthropic client in `tests/llmClient.test.ts`**
  Add assertions checking that `createLLMClient({ provider: "anthropic", apiKey: "" })` throws `Anthropic API key is missing`, and instantiates `AnthropicLLMClient` when key is supplied.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test`
  Expected: FAIL with "Unsupported LLM provider: anthropic"

- [ ] **Step 3: Implement `AnthropicLLMClient` and update `createLLMClient` in `src/llm/client.ts`**
  Implement client using `fetch("https://api.anthropic.com/v1/messages")` with tool use support.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add Chronodoc/packages/agent/src/llm/client.ts Chronodoc/packages/agent/tests/llmClient.test.ts
  git commit -m "feat(llm): add AnthropicLLMClient supporting Claude models and tool calling"
  ```

---

### Task 2: Interactive Prompt Handler & Provider Menu

**Files:**
- Create: `Chronodoc/packages/agent/src/cli/prompts.ts`
- Test: `Chronodoc/packages/agent/tests/cli/prompts.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface InteractivePromptHandler {
      selectProvider(): Promise<"gemini" | "openai" | "anthropic" | "mock" | null>;
      promptApiKey(provider: "gemini" | "openai" | "anthropic" | "mock"): Promise<string | null>;
  }
  export class ClackPromptHandler implements InteractivePromptHandler
  ```

- [ ] **Step 1: Write unit tests in `tests/cli/prompts.test.ts`**
  Test validation logic, provider metadata, and mock handler simulations.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test`
  Expected: FAIL with module not found `prompts.js`

- [ ] **Step 3: Implement `src/cli/prompts.ts` using `@clack/prompts`**
  Implement `ClackPromptHandler` with:
  - `p.select` for provider navigation
  - `p.password` for masked API key with validation
  - Ctrl+C cancellation detection (`p.isCancel`)
  - Mock provider bypass for API key

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add Chronodoc/packages/agent/src/cli/prompts.ts Chronodoc/packages/agent/tests/cli/prompts.test.ts
  git commit -m "feat(cli): implement ClackPromptHandler for interactive provider and key selection"
  ```

---

### Task 3: Integrate Interactive Selection into `executeInitCommand`

**Files:**
- Modify: `Chronodoc/packages/agent/src/cli/commands.ts`
- Test: `Chronodoc/packages/agent/tests/cli/commands.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface InitOptions {
      rootDir?: string;
      interactive?: boolean;
      provider?: "gemini" | "openai" | "anthropic" | "mock";
      apiKey?: string;
      force?: boolean;
      promptHandler?: InteractivePromptHandler;
  }
  export async function executeInitCommand(options?: InitOptions): Promise<InitResult>
  ```

- [ ] **Step 1: Write failing tests in `tests/cli/commands.test.ts`**
  Add tests for `executeInitCommand` with mock prompt handler configuring OpenAI, Gemini, Anthropic, and Mock providers into `env/.env`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test`
  Expected: FAIL

- [ ] **Step 3: Update `executeInitCommand` in `src/cli/commands.ts`**
  - If interactive and promptHandler provided (or default), prompt for provider and key.
  - Write formatted `.env` containing active `LLM_PROVIDER`, API key, and model overrides.
  - Return updated status and configured provider.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add Chronodoc/packages/agent/src/cli/commands.ts Chronodoc/packages/agent/tests/cli/commands.test.ts
  git commit -m "feat(cli): wire interactive provider configuration into executeInitCommand"
  ```

---

### Task 4: CLI Wiring, Fallbacks, and End-to-End Verification

**Files:**
- Modify: `Chronodoc/packages/agent/src/cli.ts`
- Test: `Chronodoc/packages/agent/tests/cliGenerate.test.ts`

**Interfaces:**
- Consumes: `executeInitCommand`, `ClackPromptHandler`
- Exposes: `docagent init [-p <provider>] [-k <key>] [--non-interactive] [-f]`

- [ ] **Step 1: Update `docagent init` in `src/cli.ts`**
  - Pass `interactive: Boolean(process.stdin.isTTY && !cmdOptions.nonInteractive && !globalOpts.json && !cmdOptions.provider)`
  - Use `ClackPromptHandler` when interactive.
  - Support `--provider`, `--api-key`, `--non-interactive`, and `--force` flags.
  - Print masked success summary: `✔ Provider configured successfully!`

- [ ] **Step 2: Recompile and run full test suite**
  Run: `npm run build; npm test`
  Expected: 38+ passing tests, 0 failures.

- [ ] **Step 3: Verify CLI commands via terminal execution**
  Run: `node dist/cli.js init --help`
  Run: `node dist/cli.js init --non-interactive --provider mock`
  Expected: Successful configuration.

- [ ] **Step 4: Commit**
  ```bash
  git add Chronodoc/packages/agent/src/cli.ts
  git commit -m "feat(cli): wire interactive provider selection menu into docagent init CLI"
  ```
