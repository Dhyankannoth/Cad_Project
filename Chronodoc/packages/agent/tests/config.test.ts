import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config/env.js";

test("loadConfig returns default configuration when no env is provided", () => {
    const config = loadConfig({});
    assert.equal(config.maxRevisionAttempts, 2);
    assert.equal(config.tokenBudget, 8000);
    assert.equal(config.llmProvider, "openai");
    assert.equal(config.llmModel, "gpt-4o-mini");
    assert.equal(config.llmTemperature, 0.2);
});

test("loadConfig respects custom overrides", () => {
    const config = loadConfig({
        maxRevisionAttempts: 1,
        llmProvider: "mock",
        tokenBudget: 4000
    });
    assert.equal(config.maxRevisionAttempts, 1);
    assert.equal(config.llmProvider, "mock");
    assert.equal(config.tokenBudget, 4000);
});
