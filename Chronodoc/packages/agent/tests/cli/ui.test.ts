import { test } from "node:test";
import assert from "node:assert/strict";
import { TerminalUI } from "../../src/cli/ui.js";

test("TerminalUI renders header with DocAgent branding", () => {
    const ui = new TerminalUI({ noColor: true, quiet: false });
    const header = ui.formatHeader({ project: "my-app", output: "./docs" });
    assert.ok(header.includes("DOCAGENT"));
    assert.ok(header.includes("Your codebase, documented."));
    assert.ok(header.includes("my-app"));
    assert.ok(header.includes("./docs"));
});

test("TerminalUI formats summary report with actual durations and counts", () => {
    const ui = new TerminalUI({ noColor: true, quiet: false });
    const summary = ui.formatSummary({
        documentsCreated: 3,
        validationStatus: "Passed",
        outputDirectory: "./docs",
        durationMs: 1250,
        nextSteps: ["Review ./docs/README.md"]
    });
    assert.ok(summary.includes("Documents created: 3"));
    assert.ok(summary.includes("Validation:        Passed"));
    assert.ok(summary.includes("1.3s") || summary.includes("1.25s"));
    assert.ok(summary.includes("Review ./docs/README.md"));
});

test("TerminalUI formats actionable errors clearly", () => {
    const ui = new TerminalUI({ noColor: true, quiet: false });
    const err = ui.formatActionableError({
        operation: "API Credential Verification",
        failure: "Missing Gemini API Key",
        reason: "GEMINI_API_KEY environment variable is not defined",
        nextAction: "Add GEMINI_API_KEY to your env/.env file or export it in your shell"
    });
    assert.ok(err.includes("Error: API Credential Verification"));
    assert.ok(err.includes("Missing Gemini API Key"));
    assert.ok(err.includes("GEMINI_API_KEY"));
});

test("TerminalUI suppresses non-essential logs in quiet mode", () => {
    const ui = new TerminalUI({ quiet: true });
    assert.equal(ui.isQuiet(), true);
});
