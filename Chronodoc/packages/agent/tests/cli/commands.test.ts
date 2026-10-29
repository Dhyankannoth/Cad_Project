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

test("executeInitCommand configures OpenAI via interactive prompt handler", async () => {
    const tempDir = path.resolve("./tests-temp-init-openai");
    await fs.mkdir(tempDir, { recursive: true });

    const mockHandler = {
        async selectProvider() {
            return "openai" as const;
        },
        async promptApiKey() {
            return "sk-proj-test-1234567890";
        }
    };

    const result = await executeInitCommand({
        rootDir: tempDir,
        interactive: true,
        promptHandler: mockHandler
    });

    assert.equal(result.success, true);
    assert.equal(result.provider, "openai");

    const content = await fs.readFile(path.join(tempDir, "env/.env"), "utf-8");
    assert.ok(content.includes("LLM_PROVIDER=openai"));
    assert.ok(content.includes("OPENAI_API_KEY=sk-proj-test-1234567890"));
    assert.ok(content.includes("LLM_MODEL=gpt-4o-mini"));

    await fs.rm(tempDir, { recursive: true, force: true });
});

test("executeInitCommand configures Google Gemini via interactive prompt handler", async () => {
    const tempDir = path.resolve("./tests-temp-init-gemini");
    await fs.mkdir(tempDir, { recursive: true });

    const mockHandler = {
        async selectProvider() {
            return "gemini" as const;
        },
        async promptApiKey() {
            return "AIzaSyTestKey12345678";
        }
    };

    const result = await executeInitCommand({
        rootDir: tempDir,
        interactive: true,
        promptHandler: mockHandler
    });

    assert.equal(result.success, true);
    assert.equal(result.provider, "gemini");

    const content = await fs.readFile(path.join(tempDir, "env/.env"), "utf-8");
    assert.ok(content.includes("LLM_PROVIDER=gemini"));
    assert.ok(content.includes("GEMINI_API_KEY=AIzaSyTestKey12345678"));
    assert.ok(content.includes("LLM_MODEL=gemini-1.5-flash"));

    await fs.rm(tempDir, { recursive: true, force: true });
});

test("executeInitCommand configures Mock provider without requiring API key", async () => {
    const tempDir = path.resolve("./tests-temp-init-mock");
    await fs.mkdir(tempDir, { recursive: true });

    let keyPromptCalled = false;
    const mockHandler = {
        async selectProvider() {
            return "mock" as const;
        },
        async promptApiKey() {
            keyPromptCalled = true;
            return "";
        }
    };

    const result = await executeInitCommand({
        rootDir: tempDir,
        interactive: true,
        promptHandler: mockHandler
    });

    assert.equal(result.success, true);
    assert.equal(result.provider, "mock");
    assert.equal(keyPromptCalled, false);

    const content = await fs.readFile(path.join(tempDir, "env/.env"), "utf-8");
    assert.ok(content.includes("LLM_PROVIDER=mock"));

    await fs.rm(tempDir, { recursive: true, force: true });
});

test("executeInitCommand handles prompt cancellation cleanly", async () => {
    const tempDir = path.resolve("./tests-temp-init-cancel");
    await fs.mkdir(tempDir, { recursive: true });

    const cancelHandler = {
        async selectProvider() {
            return null;
        },
        async promptApiKey() {
            return null;
        }
    };

    const result = await executeInitCommand({
        rootDir: tempDir,
        interactive: true,
        promptHandler: cancelHandler
    });

    assert.equal(result.success, false);
    assert.equal(result.cancelled, true);

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
