import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContext } from "../src/context/contextBuilder.js";
import type { RetrievedItem } from "../src/retrieval/hybridRetriever.js";

test("buildContext formats context and strictly enforces token budget", () => {
    const items: RetrievedItem[] = [
        {
            id: "1",
            filePath: "src/user.ts",
            snippet: "export class User { id: string; name: string; }",
            score: 0.95,
            source: "structural",
            symbolName: "User"
        },
        {
            id: "2",
            filePath: "docs/user.md",
            snippet: "# User Guide\nThis guide explains the User entity.",
            score: 0.82,
            source: "keyword"
        },
        {
            id: "3",
            filePath: "src/large.ts",
            snippet: "A".repeat(4000), // Huge snippet that would blow a small token budget
            score: 0.2,
            source: "semantic"
        }
    ];

    const budget = 300; // Small token budget
    const context = buildContext("src/user.ts", items, { tokenBudget: budget });

    assert.equal(context.target, "src/user.ts");
    assert.ok(context.estimatedTokens <= budget);
    assert.ok(context.formattedPromptContext.includes("User"));
    // The low scoring huge snippet should have been pruned or truncated
    assert.ok(context.estimatedTokens < 350);
});

test("buildContext handles empty retrieval without crashing", () => {
    const context = buildContext("src/empty.ts", [], { tokenBudget: 500 });
    assert.equal(context.files.length, 0);
    assert.ok(context.formattedPromptContext.includes("Target: src/empty.ts"));
    assert.ok(context.estimatedTokens > 0);
});
