import { test } from "node:test";
import assert from "node:assert/strict";
import { DocumentGenerator } from "../src/generator/documentGenerator.js";
import { MockLLMClient } from "../src/llm/client.js";

test("DocumentGenerator handles tool call loop and integrates tool observations", async () => {
    let toolExecuted = false;
    const client = new MockLLMClient({
        turns: [
            {
                content: "",
                toolCalls: [{ id: "c1", name: "astLookup", arguments: { name: "testFn" } }]
            },
            {
                content: "## Module Overview\n\nOverview after tool execution.\n\n## API Reference\n\nAPI details for testFn.",
                toolCalls: []
            }
        ]
    });

    const generator = new DocumentGenerator({ llmClient: client });
    const doc = await generator.generate({
        target: "src/sample.ts",
        files: ["src/sample.ts"],
        symbols: [{ name: "testFn", kind: "function", filePath: "src/sample.ts", exported: true }],
        dependencies: [],
        tokenBudget: 4000
    }, {
        toolExecutor: async (name) => {
            if (name === "astLookup") toolExecuted = true;
            return JSON.stringify({ found: true, symbol: "testFn" });
        }
    });

    assert.equal(toolExecuted, true);
    assert.ok(doc.sections.length > 0);
    assert.ok(doc.sections.some(s => s.content.includes("Overview after tool execution")));
});

test("DocumentGenerator halts tool loop when cycle limit is reached", async () => {
    // LLM keeps requesting tools repeatedly
    const infiniteToolTurns = Array.from({ length: 10 }, (_, i) => ({
        content: `Loop turn ${i}`,
        toolCalls: [{ id: `call_${i}`, name: "astLookup", arguments: { name: "loopSym" } }]
    }));

    const client = new MockLLMClient({ turns: infiniteToolTurns });
    let executionCount = 0;
    const generator = new DocumentGenerator({ llmClient: client });

    const doc = await generator.generate({
        target: "src/sample.ts",
        files: ["src/sample.ts"],
        symbols: [],
        dependencies: [],
        tokenBudget: 4000
    }, {
        toolExecutor: async () => {
            executionCount++;
            return JSON.stringify({ ok: true });
        }
    });

    // Hard limit should cap executions at 5
    assert.ok(executionCount <= 5);
    assert.ok(doc.sections.length > 0);
});
