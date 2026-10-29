import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { executeInitCommand, executeValidateCommand } from "../../src/cli/commands.js";

test("executeInitCommand creates starter .env template if not present", async () => {
    const tempDir = path.resolve("./tests-temp-init");
    await fs.mkdir(tempDir, { recursive: true });

    const result = await executeInitCommand({ rootDir: tempDir });
    assert.equal(result.success, true);
    assert.ok(result.createdFiles.includes("env/.env"));

    const content = await fs.readFile(path.join(tempDir, "env/.env"), "utf-8");
    assert.ok(content.includes("LLM_PROVIDER="));

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
});

test("executeValidateCommand validates existing markdown documentation against scanned codebase", async () => {
    // Validate an existing doc
    const result = await executeValidateCommand({
        docPath: "docs/generated/scanRepository_ts.md",
        rootDir: "."
    });

    assert.equal(typeof result.passed, "boolean");
    assert.ok(Array.isArray(result.issues));
});

test("executeValidateCommand fails cleanly when docPath does not exist", async () => {
    const result = await executeValidateCommand({
        docPath: "docs/non-existent.md",
        rootDir: "."
    });

    assert.equal(result.passed, false);
    assert.ok(result.error?.includes("File does not exist"));
});
