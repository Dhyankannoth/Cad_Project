import test from "node:test";
import assert from "node:assert/strict";
import { RepoDocValidator } from "../../src/validator/repoDocValidator.js";
import type { GeneratedDocument } from "../../src/generator/types.js";
import type { RepositoryScanIndex } from "../../src/scanner/astExtractor.js";

const mockScanIndex: RepositoryScanIndex = {
    files: ["package.json", "src/index.ts", "src/auth.ts"],
    symbols: new Map([
        ["authenticateUser", {
            name: "authenticateUser",
            kind: "function",
            file: "src/auth.ts",
            exported: true,
            startLine: 1,
            endLine: 20
        }]
    ]),
    dependencies: [],
    warnings: [],
    complete: true
};

test("RepoDocValidator passes when internal links, symbols, and formatting are valid", async () => {
    const suite = new Map<string, GeneratedDocument>();

    suite.set("README.md", {
        id: "readme",
        title: "Test Project Documentation",
        style: "system-documentation",
        sections: [
            {
                id: "overview",
                title: "Overview",
                content: "See [Getting Started](getting-started.md) and [Architecture](architecture/overview.md). Uses `authenticateUser` from `src/auth.ts`.",
                references: ["getting-started.md", "architecture/overview.md", "authenticateUser", "src/auth.ts"],
                status: "generated"
            }
        ],
        rawMarkdown: "# Test Project Documentation\n\n## Overview\n\nSee [Getting Started](getting-started.md) and [Architecture](architecture/overview.md). Uses `authenticateUser` from `src/auth.ts`.",
        generatedAt: new Date().toISOString()
    });

    suite.set("getting-started.md", {
        id: "getting-started",
        title: "Getting Started",
        style: "system-documentation",
        sections: [
            {
                id: "install",
                title: "Installation",
                content: "Run `npm install`.",
                references: ["package.json"],
                status: "generated"
            }
        ],
        rawMarkdown: "# Getting Started\n\n## Installation\n\nRun `npm install`.",
        generatedAt: new Date().toISOString()
    });

    suite.set("architecture/overview.md", {
        id: "arch-overview",
        title: "Architecture Overview",
        style: "system-documentation",
        sections: [
            {
                id: "diag",
                title: "Topology",
                content: "```mermaid\nflowchart TD\n  Client --> Server\n```\nBack to [Documentation](../README.md).",
                references: ["src/index.ts"],
                status: "generated"
            }
        ],
        rawMarkdown: "# Architecture Overview\n\n## Topology\n\n```mermaid\nflowchart TD\n  Client --> Server\n```\nBack to [Documentation](../README.md).",
        generatedAt: new Date().toISOString()
    });

    const validator = new RepoDocValidator();
    const result = await validator.validateSuite(suite, mockScanIndex);

    assert.equal(result.passed, true);
    assert.equal(result.issues.length, 0);
});

test("RepoDocValidator detects broken relative internal links across document directories", async () => {
    const suite = new Map<string, GeneratedDocument>();

    suite.set("README.md", {
        id: "readme",
        title: "Documentation",
        style: "system-documentation",
        sections: [
            {
                id: "overview",
                title: "Overview",
                content: "See [Broken Reference](non-existent-guide.md) and [Missing Arch](architecture/missing.md).",
                references: ["non-existent-guide.md"],
                status: "generated"
            }
        ],
        rawMarkdown: "# Documentation\n\n## Overview\n\nSee [Broken Reference](non-existent-guide.md) and [Missing Arch](architecture/missing.md).",
        generatedAt: new Date().toISOString()
    });

    const validator = new RepoDocValidator();
    const result = await validator.validateSuite(suite, mockScanIndex);

    assert.equal(result.passed, false);
    const brokenLinks = result.issues.filter(i => i.type === "broken_internal_link");
    assert.equal(brokenLinks.length, 2);
    assert.ok(brokenLinks.some(i => i.message.includes("non-existent-guide.md")));
    assert.ok(brokenLinks.some(i => i.message.includes("architecture/missing.md")));
});

test("RepoDocValidator detects accidentally exposed secrets or API keys", async () => {
    const suite = new Map<string, GeneratedDocument>();

    suite.set("guides/configuration.md", {
        id: "config",
        title: "Configuration",
        style: "system-documentation",
        sections: [
            {
                id: "secrets",
                title: "Secrets",
                content: "Use Google key: AIzaSyD12345678901234567890123456789012 or OpenAI key: sk-abcdefghijklmnopqrstuvwxyz1234567890",
                references: [],
                status: "generated"
            }
        ],
        rawMarkdown: "# Configuration\n\n## Secrets\n\nUse Google key: AIzaSyD12345678901234567890123456789012 or OpenAI key: sk-abcdefghijklmnopqrstuvwxyz1234567890",
        generatedAt: new Date().toISOString()
    });

    const validator = new RepoDocValidator();
    const result = await validator.validateSuite(suite, mockScanIndex);

    assert.equal(result.passed, false);
    const secretIssues = result.issues.filter(i => i.type === "secret_detected");
    assert.ok(secretIssues.length >= 2, "Expected detection of exposed API keys");
    assert.equal(secretIssues[0].severity, "error");
});

test("RepoDocValidator detects invalid Mermaid syntax blocks", async () => {
    const suite = new Map<string, GeneratedDocument>();

    suite.set("architecture/data-flow.md", {
        id: "flow",
        title: "Data Flow",
        style: "system-documentation",
        sections: [
            {
                id: "flow",
                title: "Flow",
                content: "```mermaid\ninvalid_diagram_directive\nA --> B\n```",
                references: [],
                status: "generated"
            }
        ],
        rawMarkdown: "# Data Flow\n\n## Flow\n\n```mermaid\ninvalid_diagram_directive\nA --> B\n```",
        generatedAt: new Date().toISOString()
    });

    const validator = new RepoDocValidator();
    const result = await validator.validateSuite(suite, mockScanIndex);

    assert.equal(result.passed, false);
    const mermaidIssues = result.issues.filter(i => i.type === "invalid_mermaid");
    assert.ok(mermaidIssues.length >= 1);
});
