import { test } from "node:test";
import assert from "node:assert/strict";
import { DocumentGenerator } from "../src/generator/documentGenerator.js";
import type { AssembledContext } from "../src/context/contextBuilder.js";

test("DocumentGenerator produces structured section-based document with mock LLM", async () => {
    const generator = new DocumentGenerator({ provider: "mock" });
    const mockContext: AssembledContext = {
        target: "src/auth.ts",
        estimatedTokens: 120,
        files: [{ path: "src/auth.ts", snippet: "export function authenticateUser(token: string) {}" }],
        symbols: [{
            name: "authenticateUser",
            kind: "function",
            exported: true,
            filePath: "src/auth.ts",
            line: 1
        }],
        documentationSnippets: ["# Auth Doc\nExisting docs."],
        formattedPromptContext: "Target: src/auth.ts\nSymbols: authenticateUser"
    };

    const doc = await generator.generate(mockContext, { style: "api-reference" });

    assert.ok(doc.id.length > 0);
    assert.equal(doc.style, "api-reference");
    assert.ok(doc.sections.length >= 2);

    const overview = doc.sections.find(s => s.id === "overview");
    assert.ok(overview);
    assert.equal(overview?.status, "generated");
    assert.ok(overview?.content.length! > 0);

    const apiRef = doc.sections.find(s => s.id === "api-reference");
    assert.ok(apiRef);
    assert.ok(apiRef?.references.includes("authenticateUser"));

    assert.ok(doc.rawMarkdown.includes("# "));
});

test("DocumentGenerator supports custom section revision", async () => {
    const generator = new DocumentGenerator({ provider: "mock" });
    const revisedSection = await generator.reviseSection({
        sectionId: "api-reference",
        currentContent: "Old inaccurate content",
        issueFeedback: "Missing parameter documentation for token",
        targetFile: "src/auth.ts"
    });

    assert.equal(revisedSection.id, "api-reference");
    assert.equal(revisedSection.status, "revised");
    assert.ok(revisedSection.content.includes("token"));
});
