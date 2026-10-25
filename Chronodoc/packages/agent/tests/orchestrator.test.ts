import { test } from "node:test";
import assert from "node:assert/strict";
import { PipelineOrchestrator } from "../src/orchestrator/pipelineOrchestrator.js";

test("PipelineOrchestrator enforces max 2 revision attempts and outputs unapproved draft on persistent failure", async () => {
    const orchestrator = new PipelineOrchestrator({
        maxRevisionAttempts: 2,
        alwaysFailValidation: true
    });

    const result = await orchestrator.execute({ target: "src/config/env.ts", rootDir: "." });
    assert.equal(result.status, "unapproved");
    assert.equal(result.revisionAttempts, 2);
    assert.ok(result.unresolvedIssues && result.unresolvedIssues.length > 0);
    assert.ok(result.document.sections.every(s => s.status === "unapproved"));
});

test("PipelineOrchestrator marks document validated and approves sections when validation passes", async () => {
    const orchestrator = new PipelineOrchestrator({
        maxRevisionAttempts: 2,
        alwaysFailValidation: false
    });

    // Use a real file that exists in the scanned repository
    const result = await orchestrator.execute({ target: "src/config/env.ts", rootDir: "." });
    assert.equal(result.status, "validated");
    assert.ok(result.document.sections.every(s => s.status === "approved"));
    assert.equal(result.unresolvedIssues, undefined);
});
