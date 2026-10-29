import { test } from "node:test";
import assert from "node:assert/strict";
import {
    validateApiKey,
    maskApiKey,
    SUPPORTED_PROVIDERS,
    type InteractivePromptHandler
} from "../../src/cli/prompts.js";

test("SUPPORTED_PROVIDERS contains all supported providers", () => {
    const keys = SUPPORTED_PROVIDERS.map(p => p.value);
    assert.deepEqual(keys, ["openai", "anthropic", "gemini", "mock"]);

    const openai = SUPPORTED_PROVIDERS.find(p => p.value === "openai");
    assert.equal(openai?.label, "OpenAI");
    assert.equal(openai?.envKey, "OPENAI_API_KEY");

    const anthropic = SUPPORTED_PROVIDERS.find(p => p.value === "anthropic");
    assert.equal(anthropic?.label, "Anthropic");
    assert.equal(anthropic?.envKey, "ANTHROPIC_API_KEY");

    const gemini = SUPPORTED_PROVIDERS.find(p => p.value === "gemini");
    assert.equal(gemini?.label, "Google Gemini");
    assert.equal(gemini?.envKey, "GEMINI_API_KEY");
});

test("validateApiKey rejects empty, undefined, or whitespace keys", () => {
    assert.equal(validateApiKey("openai", ""), "API key cannot be empty");
    assert.equal(validateApiKey("openai", "   "), "API key cannot be empty");
    assert.equal(validateApiKey("gemini", "\t\n"), "API key cannot be empty");
});

test("validateApiKey enforces reasonable minimum length for real providers", () => {
    assert.equal(validateApiKey("openai", "short"), "API key is too short. Please provide a valid key.");
    assert.equal(validateApiKey("anthropic", "1234"), "API key is too short. Please provide a valid key.");
});

test("validateApiKey allows valid API keys", () => {
    assert.equal(validateApiKey("openai", "sk-proj-1234567890abcdef"), undefined);
    assert.equal(validateApiKey("anthropic", "sk-ant-api03-1234567890abcdef"), undefined);
    assert.equal(validateApiKey("gemini", "AIzaSyTestApiKey1234567890"), undefined);
});

test("validateApiKey allows empty key for mock provider", () => {
    assert.equal(validateApiKey("mock", ""), undefined);
});

test("maskApiKey securely hides secret contents", () => {
    assert.equal(maskApiKey(""), "(none)");
    assert.equal(maskApiKey("short"), "•••••");
    const masked = maskApiKey("sk-proj-1234567890abcdefghijk");
    assert.ok(masked.startsWith("sk-proj-"));
    assert.ok(masked.endsWith("hijk"));
    assert.ok(masked.includes("••••"));
    assert.ok(!masked.includes("1234567890"));
});

test("MockPromptHandler can simulate interactive user choices", async () => {
    class MockPromptHandler implements InteractivePromptHandler {
        constructor(
            private selected: "gemini" | "openai" | "anthropic" | "mock" | null,
            private key: string | null
        ) {}

        async selectProvider() {
            return this.selected;
        }

        async promptApiKey() {
            return this.key;
        }
    }

    const handler = new MockPromptHandler("openai", "sk-test-key-12345");
    const provider = await handler.selectProvider();
    const key = await handler.promptApiKey("openai");

    assert.equal(provider, "openai");
    assert.equal(key, "sk-test-key-12345");
});
