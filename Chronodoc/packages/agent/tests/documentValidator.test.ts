import { test } from "node:test";
import assert from "node:assert/strict";
import { DocumentValidator } from "../src/validator/documentValidator.js";
import type { RepositoryScanIndex } from "../src/scanner/astExtractor.js";
import type { GeneratedDocument } from "../src/generator/types.js";

test("DocumentValidator detects hallucinated symbols and non-existent file paths", async () => {
    const validator = new DocumentValidator();
    const mockIndex: RepositoryScanIndex = {
        files: ["src/realFile.ts"],
        symbols: new Map([
            ["realFunction", [{
                name: "realFunction",
                kind: "function",
                exported: true,
                filePath: "src/realFile.ts",
                line: 1
            }]]
        ]),
        dependencies: [],
        warnings: [],
        complete: true
    };

    const invalidDoc: GeneratedDocument = {
        id: "doc-1",
        title: "Test Documentation",
        style: "api-reference",
        generatedAt: new Date().toISOString(),
        rawMarkdown: "",
        sections: [
            {
                id: "overview",
                title: "Overview",
                content: "Valid overview",
                references: ["src/realFile.ts", "realFunction"],
                status: "generated"
            },
            {
                id: "api-broken",
                title: "Broken API",
                content: "Calls fakeFunction in missingPath.ts",
                references: ["fakeFunction", "src/missingPath.ts"],
                status: "generated"
            }
        ]
    };

    const result = await validator.validate(invalidDoc, mockIndex);
    assert.equal(result.passed, false);
    assert.ok(result.issues.some(i => i.type === "symbol_not_found"));
    assert.ok(result.issues.some(i => i.type === "invalid_path"));
    assert.deepEqual(result.affectedSectionIds, ["api-broken"]);
});

test("DocumentValidator passes when all references and markdown structures are valid", async () => {
    const validator = new DocumentValidator();
    const mockIndex: RepositoryScanIndex = {
        files: ["src/auth.ts"],
        symbols: new Map([
            ["login", [{
                name: "login",
                kind: "function",
                exported: true,
                filePath: "src/auth.ts",
                line: 1
            }]]
        ]),
        dependencies: [],
        warnings: [],
        complete: true
    };

    const validDoc: GeneratedDocument = {
        id: "doc-2",
        title: "Auth Documentation",
        style: "api-reference",
        generatedAt: new Date().toISOString(),
        rawMarkdown: "",
        sections: [
            {
                id: "overview",
                title: "Overview",
                content: "Valid overview text.",
                references: ["src/auth.ts", "login"],
                status: "generated"
            }
        ]
    };

    const result = await validator.validate(validDoc, mockIndex);
    assert.equal(result.passed, true);
    assert.equal(result.issues.length, 0);
    assert.deepEqual(result.affectedSectionIds, []);
});
