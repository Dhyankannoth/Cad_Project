import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { SafeFileWriter } from "../../src/writer/safeFileWriter.js";
import type { GeneratedDocument } from "../../src/generator/types.js";

const testDocsDir = path.join(os.tmpdir(), "docagent-temp-docs-output-" + Date.now());

test("SafeFileWriter writes documents atomically and skips unchanged files on regeneration", async () => {
    await fs.rm(testDocsDir, { recursive: true, force: true });
    await fs.mkdir(testDocsDir, { recursive: true });

    const writer = new SafeFileWriter({ baseDir: testDocsDir });

    const suite = new Map<string, GeneratedDocument>();
    suite.set("README.md", {
        id: "readme",
        title: "Main Docs",
        style: "system-documentation",
        sections: [{ id: "intro", title: "Intro", content: "Initial content", references: [], status: "generated" }],
        rawMarkdown: "# Main Docs\n\n## Intro\n\nInitial content",
        generatedAt: new Date().toISOString()
    });
    suite.set("architecture/overview.md", {
        id: "arch",
        title: "Arch",
        style: "system-documentation",
        sections: [{ id: "arch", title: "Arch", content: "Arch content", references: [], status: "generated" }],
        rawMarkdown: "# Arch\n\n## Arch\n\nArch content",
        generatedAt: new Date().toISOString()
    });

    // First write: both files are created
    const firstReport = await writer.writeSuite(suite);
    assert.equal(firstReport.created.length, 2);
    assert.equal(firstReport.updated.length, 0);
    assert.equal(firstReport.unchanged.length, 0);

    const readmeContent = await fs.readFile(path.join(testDocsDir, "README.md"), "utf-8");
    assert.equal(readmeContent, "# Main Docs\n\n## Intro\n\nInitial content\n");

    // Second write with identical content: both files should be marked unchanged and skipped
    const secondReport = await writer.writeSuite(suite);
    assert.equal(secondReport.created.length, 0);
    assert.equal(secondReport.updated.length, 0);
    assert.equal(secondReport.unchanged.length, 2);

    await fs.rm(testDocsDir, { recursive: true, force: true });
});

test("SafeFileWriter preserves manual user edits marked with docagent tags across regeneration", async () => {
    await fs.rm(testDocsDir, { recursive: true, force: true });
    await fs.mkdir(testDocsDir, { recursive: true });

    const writer = new SafeFileWriter({ baseDir: testDocsDir });

    const initialDoc: GeneratedDocument = {
        id: "readme",
        title: "Main Docs",
        style: "system-documentation",
        sections: [{ id: "intro", title: "Intro", content: "Initial content", references: [], status: "generated" }],
        rawMarkdown: "# Main Docs\n\n## Intro\n\nInitial content",
        generatedAt: new Date().toISOString()
    };

    const suite1 = new Map<string, GeneratedDocument>([["README.md", initialDoc]]);
    await writer.writeSuite(suite1);

    // Simulate user editing the file and adding manual annotations
    const userEditedMarkdown = `# Main Docs\n\n## Intro\n\nInitial content\n\n<!-- docagent:manual-start:notes -->\n### Custom Engineer Notes\nThis is a manually maintained operational note that must not be deleted.\n<!-- docagent:manual-end:notes -->\n`;
    await fs.writeFile(path.join(testDocsDir, "README.md"), userEditedMarkdown, "utf-8");

    // Now regenerate with updated generator content
    const updatedDoc: GeneratedDocument = {
        id: "readme",
        title: "Main Docs",
        style: "system-documentation",
        sections: [{ id: "intro", title: "Intro", content: "Updated content from code changes", references: [], status: "generated" }],
        rawMarkdown: "# Main Docs\n\n## Intro\n\nUpdated content from code changes",
        generatedAt: new Date().toISOString()
    };

    const suite2 = new Map<string, GeneratedDocument>([["README.md", updatedDoc]]);
    const report2 = await writer.writeSuite(suite2);

    assert.equal(report2.updated.length, 1);
    assert.equal(report2.preservedEdits.length, 1);

    const preservedContent = await fs.readFile(path.join(testDocsDir, "README.md"), "utf-8");
    assert.ok(preservedContent.includes("Updated content from code changes"));
    assert.ok(preservedContent.includes("Custom Engineer Notes"));
    assert.ok(preservedContent.includes("This is a manually maintained operational note"));

    await fs.rm(testDocsDir, { recursive: true, force: true });
});

test("SafeFileWriter blocks directory traversal outside designated base directory", async () => {
    await fs.rm(testDocsDir, { recursive: true, force: true });
    await fs.mkdir(testDocsDir, { recursive: true });

    const writer = new SafeFileWriter({ baseDir: testDocsDir });

    const maliciousSuite = new Map<string, GeneratedDocument>();
    maliciousSuite.set("../../outside.md", {
        id: "hack",
        title: "Hack",
        style: "system-documentation",
        sections: [],
        rawMarkdown: "Malicious write attempt",
        generatedAt: new Date().toISOString()
    });

    await assert.rejects(
        async () => await writer.writeSuite(maliciousSuite),
        /Path traversal detected/
    );

    await fs.rm(testDocsDir, { recursive: true, force: true });
});
