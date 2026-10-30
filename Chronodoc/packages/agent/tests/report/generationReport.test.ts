import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { GenerationReportWriter } from "../../src/report/generationReport.js";
import type { DocumentationPlan } from "../../src/planner/types.js";
import type { GeneratedDocument } from "../../src/generator/types.js";
import type { SuiteValidationResult } from "../../src/validator/repoDocValidator.js";
import type { WriteReport } from "../../src/writer/safeFileWriter.js";

const testMetadataDir = path.resolve("./tests-temp-report-output");

test("GenerationReportWriter generates detailed generation-report.json omitting all secrets", async () => {
    await fs.rm(testMetadataDir, { recursive: true, force: true });
    await fs.mkdir(testMetadataDir, { recursive: true });

    const writer = new GenerationReportWriter({ outputDir: testMetadataDir });

    const mockPlan: DocumentationPlan = {
        projectName: "sample-service",
        description: "Test service description",
        techStack: ["TypeScript", "Node.js"],
        testFramework: "tsx/node:test",
        database: { detected: false, models: [] },
        api: { detected: true, endpointsCount: 1, interfaces: ["getHandler"] },
        plannedDocuments: [
            {
                id: "readme",
                relPath: "README.md",
                title: "Sample Docs",
                type: "readme",
                description: "Main entry point",
                relevantFiles: ["src/index.ts"],
                relevantSymbols: ["getHandler"],
                priority: 1
            }
        ],
        skippedDocuments: [
            {
                id: "reference-database",
                relPath: "reference/database.md",
                reason: "No database models detected"
            }
        ],
        detectedScripts: { test: "npm test" },
        envVariables: []
    };

    const mockSuite = new Map<string, GeneratedDocument>([
        ["README.md", {
            id: "doc-readme",
            title: "Sample Docs",
            style: "system-documentation",
            sections: [
                { id: "intro", title: "Intro", content: "Some content", references: ["src/index.ts"], status: "generated" }
            ],
            rawMarkdown: "# Sample Docs\n\n## Intro\nSome content",
            generatedAt: new Date().toISOString()
        }]
    ]);

    const mockValidation: SuiteValidationResult = {
        passed: true,
        issues: [
            {
                docRelPath: "README.md",
                type: "unknown_symbol",
                severity: "warning",
                message: "Minor symbol notice"
            }
        ],
        documentsValidated: 1,
        linksChecked: 1
    };

    const mockWriteReport: WriteReport = {
        created: ["README.md"],
        updated: [],
        unchanged: [],
        preservedEdits: []
    };

    const reportPath = await writer.writeReport({
        plan: mockPlan,
        suite: mockSuite,
        validation: mockValidation,
        writeReport: mockWriteReport,
        filesScannedCount: 12,
        symbolsExtractedCount: 25
    });

    assert.ok(reportPath.endsWith("generation-report.json"));
    const content = JSON.parse(await fs.readFile(reportPath, "utf-8"));

    assert.equal(content.generator, "docagent");
    assert.equal(content.schemaVersion, "1.0.0");
    assert.equal(content.targetRepository, "sample-service");
    assert.equal(content.statistics.filesScanned, 12);
    assert.equal(content.statistics.symbolsExtracted, 25);
    assert.equal(content.statistics.documentsCreated, 1);
    assert.equal(content.statistics.documentsGenerated, 1);

    // Verify skipped docs list
    assert.equal(content.skipped.length, 1);
    assert.equal(content.skipped[0].relPath, "reference/database.md");
    assert.equal(content.skipped[0].reason, "No database models detected");

    // Verify validation summary
    assert.equal(content.validation.passed, true);
    assert.equal(content.validation.blockingErrors, 0);
    assert.equal(content.validation.warnings, 1);

    // Verify no secret leak
    const rawString = JSON.stringify(content);
    assert.ok(!rawString.includes("AIzaSy"));
    assert.ok(!rawString.includes("sk-"));

    await fs.rm(testMetadataDir, { recursive: true, force: true });
});
