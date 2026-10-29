import { test } from "node:test";
import assert from "node:assert/strict";
import { createLLMClient, MockLLMClient, AnthropicLLMClient } from "../src/llm/client.js";

test("MockLLMClient responds with preconfigured responses and records tool calls", async () => {
    const mock = new MockLLMClient({
        turns: [
            {
                content: "Generated overview",
                toolCalls: [{ id: "call_1", name: "astLookup", arguments: { name: "scanRepository" } }]
            }
        ]
    });

    const response = await mock.chat([{ role: "user", content: "Document scanRepository" }]);
    assert.equal(response.content, "Generated overview");
    assert.equal(response.toolCalls?.length, 1);
    assert.equal(response.toolCalls?.[0].name, "astLookup");
});

test("createLLMClient throws descriptive error when required API key is missing for provider", () => {
    assert.throws(() => {
        createLLMClient({ provider: "openai", apiKey: "" });
    }, /OpenAI API key is missing/);

    assert.throws(() => {
        createLLMClient({ provider: "gemini", apiKey: "" });
    }, /Gemini API key is missing/);

    assert.throws(() => {
        createLLMClient({ provider: "anthropic", apiKey: "" });
    }, /Anthropic API key is missing/);
});

test("createLLMClient successfully instantiates mock client", () => {
    const client = createLLMClient({ provider: "mock" });
    assert.ok(client instanceof MockLLMClient);
});

test("createLLMClient successfully instantiates Anthropic client", () => {
    const client = createLLMClient({ provider: "anthropic", apiKey: "sk-ant-test-key-12345" });
    assert.ok(client instanceof AnthropicLLMClient);
});

