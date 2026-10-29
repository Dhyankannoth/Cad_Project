# ADR-002: Agent Architecture Runtime, Tool Usage, and LangChain Feasibility Analysis

## Status
Accepted / Recommended

## Context & Problem Statement

The Chronodoc agent architecture was initially designed and implemented as a 7-stage deterministic and semi-autonomous pipeline in TypeScript ([docs/architecture/agent-architecture.md](file:///c:/Users/Dhyan%20Kannoth/OneDrive/Documents/Cad_Project/docs/architecture/agent-architecture.md)):
1. Repository Scanning (AST symbol discovery & dependency extraction)
2. Hybrid RAG (Structural + BM25 Lexical + Cosine Semantic Retrieval)
3. Context Building (Deduplication, Token Budget enforcement)
4. Document Generation (Agent 1: Section-based Markdown output)
5. Document Validation (Agent 2: Deterministic AST & path verification + Semantic LLM evaluation)
6. Bounded Targeted Revision (Max 2 attempts on affected sections only)
7. Final Validation & Output (`ValidatedDocumentation` or `UnapprovedDraft`)

As the system evolves to support dynamic **tool calling** (e.g., allowing the generation and validation agents to query symbols on-demand, inspect file slices, execute linters, or run tests), we evaluated whether to:
1. Migrate the architecture to **Python LangChain** and attempt to package/distribute it via **npm**.
2. Migrate to **LangChain.js / LangGraph.js** within the native Node.js/TypeScript ecosystem.
3. Maintain the **Pure TypeScript architecture** and introduce **Native LLM Tool Calling** directly into the existing modules.

This document analyzes the technical feasibility, trade-offs, packaging implications, and architectural recommendations.

---

## Part 1: Feasibility of Deploying a Python Architecture via npm

The question was raised: *Is it feasible to rewrite the agent in Python (using Python LangChain) and deploy it as an npm package?*

### Technical Feasibility: Technically Possible, Practically Fragile
Publishing an npm package that wraps a Python application can be done through a few mechanisms, but each introduces severe compromises:

| Packaging Mechanism | How it works | Disadvantages & Operational Hazards |
| :--- | :--- | :--- |
| **Wrapper Shell / Child Process (`python -m ...`)** | The npm package installs a tiny JS CLI wrapper that invokes the host's `python3` command and manages a virtual environment or `pip install`. | **Fatal DX Flaw:** Relies on the user having Python (and matching version >= 3.10) installed. Breaks in CI environments, Docker Node-only images, and Windows environments with path conflicts or execution policy restrictions. |
| **Self-Contained PyInstaller / PyOxidizer Binaries** | Build native compiled executable binaries for each OS/architecture (macOS x64/arm64, Linux x64/arm64, Windows x64) and distribute via platform-specific npm optional dependencies. | Package size explodes (100MB+ per target), cross-compilation pipeline is complex, and dynamic security scanners often flag generated PyInstaller binaries as suspicious. |
| **WebAssembly (Pyodide)** | Run the Python runtime inside Node.js via WASM. | Cannot run heavy native C-extensions or network-heavy LLM libraries easily; unacceptable startup latency and memory overhead. |

### Conclusion on Python + npm
If the primary distribution channel is **npm** (for front-end/full-stack developers and Node.js toolchains), **writing the agent in Python is an anti-pattern**. It fractures the developer experience, destroys cold-start speed, and creates massive cross-platform support debt.

---

## Part 2: Trade-Off Analysis: TypeScript vs. LangChain

Evaluating the three concrete architectural choices:

### Approach 1: Python LangChain + PyPI Distribution (Drop npm)
* **Pros:** Access to Python's extensive AI/ML ecosystem, broad community plugins, rich LangChain/LangGraph documentation.
* **Cons:** Cannot easily be consumed as an npm package. Chronodoc would lose its native TypeScript Compiler API integration (`typescript` AST parsing), requiring third-party tools like `tree-sitter` or `pyright`.

### Approach 2: LangChain.js / LangGraph.js in Native TypeScript
* **Pros:** 
  - Stays 100% within the Node/TypeScript ecosystem (native npm publishing).
  - Standardized abstractions for tools (`DynamicStructuredTool`), agent loops, and prompt templates.
  - Native integration with LangSmith for enterprise trace telemetry if needed.
* **Cons:**
  - **Dependency Bloat:** Introduces dozens of transitive dependencies and significant package size.
  - **Fast-Moving Abstractions & Churn:** LangChain.js experiences frequent breaking API changes between major/minor releases.
  - **Framework Overhead:** Adds abstraction layers over simple tasks (like formatting JSON or invoking an API endpoint).
  - **Loss of Pipeline Transparency:** Chronodoc’s deterministic checks (symbol validation against AST maps) must be coerced into LangChain chains or graph nodes.

### Approach 3: Pure TypeScript + Native LLM Tool Calling (Recommended)
* **Pros:**
  - **Preserves Deterministic Design:** Chronodoc's pipeline guarantees (fast AST validation *before* LLM calls, max 2 revisions, strict token budgeting) remain clear and unencumbered by framework magic.
  - **Lean & Zero-Bloat:** Only depends on official provider SDKs (`@google/genai` or `openai`), keeping `@chronodoc/agent` lightweight, fast, and easy to audit.
  - **First-Class Typing:** Standard OpenAI / Gemini function calling definitions in TypeScript provide full compile-time safety.
  - **Ultra-Fast Testing:** Unit tests run in milliseconds using Node's built-in test runner without mocking complex framework runtimes.
* **Cons:**
  - No automatic out-of-the-box UI/telemetry like LangSmith (though custom JSON logging or OpenTelemetry can be plugged in easily).
  - Creating new tools requires writing a lightweight JSON schema and execution handler directly.

---

## Detailed Comparison Matrix

| Evaluation Criteria | Approach 1: Python LangChain | Approach 2: LangChain.js (TS) | Approach 3: Pure TS + Native Tools |
| :--- | :--- | :--- | :--- |
| **npm Distribution Fit** | ❌ Very Poor (Host Python / Fat Binaries) | ✅ Excellent (Native npm module) | ✅ Excellent (Lightweight native npm module) |
| **AST Extraction Fidelity** | ⚠️ Complex (Tree-Sitter / External CLI) | ✅ Native TS Compiler API | ✅ Native TS Compiler API |
| **Tool Calling Flexibility** | ✅ High (Python LangChain tools) | ✅ High (LangChain.js tools) | ✅ High (Native Model Function Calling) |
| **Pipeline Determinism** | ⚠️ LLM-driven graph routing | ⚠️ LLM-driven graph routing | ✅ Strict bounded programmatic stages |
| **Startup / Execution Latency** | ⚠️ High (Python cold boot / imports) | ⚠️ Moderate (Large module graph) | ⚡ Fast (Near-zero runtime overhead) |
| **Maintenance & Dependency Churn** | ⚠️ High (polyglot repository) | ⚠️ High (LangChain dependency churn) | 🟢 Low (Controlled native dependencies) |
| **Testability** | ⚠️ Requires Python pytest & Node bridge | ⚠️ Requires mocking LangChain internals | 🟢 Clean, fast Node test runner (`node:test`) |

---

## Decision

We will **retain the native TypeScript architecture (Approach 3)** and extend it with **Native Tool Calling**.

### Why Not LangChain?
LangChain provides significant value when an application requires an open-ended conversational agent that must randomly pick from dozens of disparate third-party web tools (search engines, databases, SaaS APIs). 

However, Chronodoc is an **engineering-grade, deterministic documentation compiler**:
- It requires **strict token budgets**.
- It requires **strict bounded revision loops** (max 2 attempts).
- It relies on **authoritative AST compiler data** rather than speculative LLM tool loops.
- It must be distributed as a frictionless, high-speed CLI tool and npm library (`@chronodoc/agent`).

Native LLM tool calling (via Gemini / OpenAI function calling) delivers the exact same agentic tool usage capabilities without any framework overhead, bloated dependencies, or polyglot runtime friction.

---

## Implementation Roadmap for Native Tool Calling in TypeScript

When adding tool capabilities to `@chronodoc/agent`, implement them via the following clean architectural pattern:

### 1. Tool Definition Contract (`src/tools/types.ts`)
```ts
export interface AgentTool<TInput = any, TOutput = any> {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
  execute: (args: TInput, context: ToolContext) => Promise<TOutput>;
}
```

### 2. Core Repository Tools
- `astLookupTool`: Queries the AST repository index for a specific symbol's declaration, parameters, and return types.
- `fileSliceTool`: Reads a specific line range of a source file when the generator or validator needs more context.
- `dependencyGraphTool`: Queries callers or callees of a specific module.
- `syntaxCheckTool`: Deterministically validates that Markdown code blocks compile or parse without errors.

### 3. Generator & Validator Integration
- Allow `DocumentGenerator` and `DocumentValidator` to declare an optional `tools` registry.
- When querying the model (e.g., Gemini or OpenAI), pass tool definitions in the API request payload.
- If the model returns a `tool_calls` request, execute the tool locally against the scanned repository data and send the result back to the model before generating the final section text.

---

## Consequences

### Positive
- Zero external runtime requirements for end users (no Python installation or environment issues).
- Retains instant test execution and compilation speeds.
- Full type safety between tools, AST data structures, and validation outputs.
- Keeps npm package size small and publication frictionless.

### Negative / Trade-Offs
- If enterprise tracing (like LangSmith) is requested later, an OpenTelemetry exporter or custom tracer must be hooked into the pipeline orchestrator.
- New tool schemas must be authored directly using standard JSON Schema rather than relying on LangChain's tool catalog.
