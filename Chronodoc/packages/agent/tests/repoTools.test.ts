import { test } from "node:test";
import assert from "node:assert/strict";
import { createRepositoryTools } from "../src/tools/repoTools.js";
import type { RepositoryScanIndex } from "../src/scanner/astExtractor.js";

test("astLookup tool returns symbol information when symbol exists", async () => {
    const mockIndex: RepositoryScanIndex = {
        files: ["src/index.ts"],
        symbols: new Map([
            ["myFunction", [{ name: "myFunction", kind: "function", filePath: "src/index.ts", exported: true, signature: "() => void" }]]
        ]),
        dependencies: [],
        warnings: [],
        complete: true
    };

    const { tools, executeTool } = createRepositoryTools(".", mockIndex);
    assert.ok(tools.some(t => t.name === "astLookup"));

    const resultStr = await executeTool("astLookup", { name: "myFunction" });
    const result = JSON.parse(resultStr);
    assert.equal(result.found, true);
    assert.equal(result.symbols[0].name, "myFunction");
});

test("astLookup tool returns not found payload when symbol is absent", async () => {
    const mockIndex: RepositoryScanIndex = {
        files: ["src/index.ts"],
        symbols: new Map(),
        dependencies: [],
        warnings: [],
        complete: true
    };

    const { executeTool } = createRepositoryTools(".", mockIndex);
    const resultStr = await executeTool("astLookup", { name: "nonExistent" });
    const result = JSON.parse(resultStr);
    assert.equal(result.found, false);
});

test("readFileSlice tool returns lines from file safely", async () => {
    const mockIndex: RepositoryScanIndex = {
        files: ["package.json"],
        symbols: new Map(),
        dependencies: [],
        warnings: [],
        complete: true
    };
    const { executeTool } = createRepositoryTools(".", mockIndex);
    const resultStr = await executeTool("readFileSlice", { filePath: "package.json", startLine: 1, endLine: 4 });
    const result = JSON.parse(resultStr);
    assert.equal(result.success, true);
    assert.ok(result.content.includes("name"));
});

test("readFileSlice tool handles missing files safely without throwing", async () => {
    const mockIndex: RepositoryScanIndex = {
        files: [],
        symbols: new Map(),
        dependencies: [],
        warnings: [],
        complete: true
    };
    const { executeTool } = createRepositoryTools(".", mockIndex);
    const resultStr = await executeTool("readFileSlice", { filePath: "does-not-exist.ts", startLine: 1, endLine: 10 });
    const result = JSON.parse(resultStr);
    assert.equal(result.success, false);
    assert.ok(result.error);
});
