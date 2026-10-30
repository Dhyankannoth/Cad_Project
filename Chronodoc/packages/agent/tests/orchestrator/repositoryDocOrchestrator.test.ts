import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { RepositoryDocOrchestrator } from "../../src/orchestrator/repositoryDocOrchestrator.js";

const testRepoDir = path.join(os.tmpdir(), "docagent-temp-repo-orchestrator-" + Date.now());
const testDocsOutputDir = path.join(testRepoDir, "docs");

test("RepositoryDocOrchestrator executes full end-to-end repository documentation pipeline", async () => {
    await fs.rm(testRepoDir, { recursive: true, force: true });
    await fs.mkdir(path.join(testRepoDir, "src"), { recursive: true });

    // Setup sample repository files
    await fs.writeFile(
        path.join(testRepoDir, "package.json"),
        JSON.stringify({
            name: "sample-microservice",
            version: "1.0.0",
            description: "High-performance processing microservice",
            scripts: {
                start: "node src/index.js",
                test: "node --test tests/*.test.js"
            },
            dependencies: {
                picocolors: "^1.0.0"
            }
        }, null, 2)
    );

    await fs.writeFile(
        path.join(testRepoDir, "src", "index.ts"),
        `export class OrderProcessor {\n    public processOrder(id: string): boolean {\n        return true;\n    }\n}\n`
    );

    const orchestrator = new RepositoryDocOrchestrator({
        provider: "mock"
    });

    const progressStages: string[] = [];
    const result = await orchestrator.execute({
        rootDir: testRepoDir,
        outputDir: testDocsOutputDir,
        onProgress: (evt) => {
            if (evt.status === "completed") {
                progressStages.push(evt.stage);
            }
        }
    });

    assert.equal(result.status, "success");
    assert.equal(result.validation.passed, true);
    assert.ok(result.writeReport.created.length >= 7, "Expected core docs to be created");

    // Check files on disk
    const readmeExists = await fs.stat(path.join(testDocsOutputDir, "README.md")).then(() => true).catch(() => false);
    const archExists = await fs.stat(path.join(testDocsOutputDir, "architecture", "overview.md")).then(() => true).catch(() => false);
    const reportExists = await fs.stat(path.join(testDocsOutputDir, "metadata", "generation-report.json")).then(() => true).catch(() => false);

    assert.ok(readmeExists, "README.md must exist on disk");
    assert.ok(archExists, "architecture/overview.md must exist on disk");
    assert.ok(reportExists, "metadata/generation-report.json must exist on disk");

    // Verify report contents
    const reportContent = JSON.parse(await fs.readFile(path.join(testDocsOutputDir, "metadata", "generation-report.json"), "utf-8"));
    assert.equal(reportContent.targetRepository, "sample-microservice");
    assert.ok(reportContent.statistics.documentsCreated >= 7);

    // Verify progress events
    assert.ok(progressStages.includes("planning"));
    assert.ok(progressStages.includes("generation"));
    assert.ok(progressStages.includes("validation"));
    assert.ok(progressStages.includes("writing"));

    await fs.rm(testRepoDir, { recursive: true, force: true });
});
