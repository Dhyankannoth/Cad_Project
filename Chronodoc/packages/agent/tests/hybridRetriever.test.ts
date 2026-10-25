import { test } from "node:test";
import assert from "node:assert/strict";
import { HybridRetriever } from "../src/retrieval/hybridRetriever.js";
import type { RepositoryScanIndex } from "../src/scanner/astExtractor.js";

test("HybridRetriever indexes corpus and ranks items combining structural, lexical and semantic matching", async () => {
    const retriever = new HybridRetriever({ mockSemantic: true });

    const mockIndex: RepositoryScanIndex = {
        files: ["src/auth.ts", "docs/auth.md", "src/database.ts"],
        symbols: new Map([
            ["authenticateUser", [{
                name: "authenticateUser",
                kind: "function",
                exported: true,
                filePath: "src/auth.ts",
                line: 10,
                signature: "export function authenticateUser(token: string)"
            }]]
        ]),
        dependencies: [
            { fromFile: "src/auth.ts", toFileOrModule: "src/database.ts", importedSymbols: ["query"] }
        ],
        warnings: [],
        complete: true
    };

    const corpus = [
        { filePath: "src/auth.ts", content: "export function authenticateUser(token: string) { return verify(token); }" },
        { filePath: "docs/auth.md", content: "# Authentication Guide\nUse authenticateUser to log into the system with a valid token." },
        { filePath: "src/database.ts", content: "export function query(sql: string) { return db.execute(sql); }" }
    ];

    retriever.indexCorpus(corpus, mockIndex);

    const results = await retriever.search("authenticateUser token");
    assert.ok(results.length >= 2);

    // Matches should be deduplicated and sorted by score descending
    assert.equal(results[0]?.filePath, "src/auth.ts");
    assert.ok(results[0]?.score! >= (results[1]?.score ?? 0));
    assert.ok(results.some(r => r.source === "structural" || r.source === "keyword"));
});

test("HybridRetriever handles queries with zero matches gracefully", async () => {
    const retriever = new HybridRetriever({ mockSemantic: true });
    retriever.indexCorpus([], {
        files: [],
        symbols: new Map(),
        dependencies: [],
        warnings: [],
        complete: true
    });

    const results = await retriever.search("nonExistentSymbol");
    assert.deepEqual(results, []);
});
