import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { PipelineOrchestrator } from "../src/orchestrator/pipelineOrchestrator.js";

test("PipelineOrchestrator runs end-to-end with tools enabled and writes output", async () => {
    const orchestrator = new PipelineOrchestrator({
        provider: "mock",
        tokenBudget: 4000
    });

    const result = await orchestrator.execute({
        target: "package.json",
        rootDir: "."
    });

    assert.ok(result.status === "validated" || result.status === "unapproved");
    assert.ok(result.document.rawMarkdown.length > 0);
    assert.ok(result.document.sections.length > 0);
});

test("PipelineOrchestrator handles outDir by saving generated markdown file", async () => {
    const outDir = path.resolve("./tests-temp-out");
    const orchestrator = new PipelineOrchestrator({
        provider: "mock",
        tokenBudget: 4000
    });

    const result = await orchestrator.execute({
        target: "package.json",
        rootDir: ".",
        outDir
    });

    assert.ok(result.savedFilePath);
    const content = await fs.readFile(result.savedFilePath, "utf-8");
    assert.ok(content.includes("# Documentation:"));

    // Cleanup
    await fs.rm(outDir, { recursive: true, force: true });
});
