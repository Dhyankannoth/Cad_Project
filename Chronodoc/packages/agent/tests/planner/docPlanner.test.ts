import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { DocPlanner } from "../../src/planner/docPlanner.js";
import type { RepositoryScanIndex } from "../../src/scanner/astExtractor.js";

test("DocPlanner detects project stack and plans standard documentation suite", async () => {
    const mockScanIndex: RepositoryScanIndex = {
        files: [
            "src/index.ts",
            "src/service.ts",
            "src/util.ts",
            "tests/service.test.ts"
        ],
        symbols: new Map([
            ["UserService", {
                name: "UserService",
                kind: "class",
                file: "src/service.ts",
                exported: true,
                startLine: 1,
                endLine: 20
            }],
            ["formatUser", {
                name: "formatUser",
                kind: "function",
                file: "src/util.ts",
                exported: true,
                startLine: 1,
                endLine: 10
            }]
        ]),
        dependencies: [
            { source: "src/service.ts", specifier: "./util.js", resolved: "src/util.ts" }
        ],
        warnings: [],
        complete: true
    };

    const mockPackageJson = {
        name: "test-app",
        version: "1.0.0",
        description: "A test application for documentation planning",
        scripts: {
            build: "tsc",
            test: "tsx --test tests/*.test.ts",
            start: "node dist/index.js"
        },
        dependencies: {
            picocolors: "^1.0.0"
        },
        devDependencies: {
            typescript: "^5.0.0",
            tsx: "^4.0.0"
        }
    };

    const planner = new DocPlanner();
    const plan = await planner.createPlan({
        rootDir: ".",
        scanIndex: mockScanIndex,
        packageJson: mockPackageJson
    });

    assert.equal(plan.projectName, "test-app");
    assert.equal(plan.description, "A test application for documentation planning");
    assert.ok(plan.techStack.includes("TypeScript"));
    assert.ok(plan.techStack.includes("Node.js"));
    assert.equal(plan.testFramework, "tsx/node:test");

    // Must plan core documents
    const relPaths = plan.plannedDocuments.map(d => d.relPath);
    assert.ok(relPaths.includes("README.md"));
    assert.ok(relPaths.includes("getting-started.md"));
    assert.ok(relPaths.includes("architecture/overview.md"));
    assert.ok(relPaths.includes("architecture/components.md"));
    assert.ok(relPaths.includes("architecture/data-flow.md"));
    assert.ok(relPaths.includes("guides/development.md"));
    assert.ok(relPaths.includes("guides/testing.md"));
    assert.ok(relPaths.includes("reference/dependencies.md"));

    // Database should be skipped because no DB models or dependencies were found
    assert.ok(!relPaths.includes("reference/database.md"));
    const dbSkip = plan.skippedDocuments.find(d => d.relPath === "reference/database.md");
    assert.ok(dbSkip, "Expected database reference to be skipped");
    assert.ok(dbSkip.reason.includes("No database"));
});

test("DocPlanner conditionally plans API reference when HTTP or API interfaces are detected", async () => {
    const mockScanIndex: RepositoryScanIndex = {
        files: ["src/routes/api.ts", "src/server.ts"],
        symbols: new Map([
            ["getUserRoute", {
                name: "getUserRoute",
                kind: "function",
                file: "src/routes/api.ts",
                exported: true,
                startLine: 1,
                endLine: 15
            }]
        ]),
        dependencies: [],
        warnings: [],
        complete: true
    };

    const mockPackageJson = {
        name: "api-service",
        dependencies: {
            express: "^4.18.0"
        }
    };

    const planner = new DocPlanner();
    const plan = await planner.createPlan({
        rootDir: ".",
        scanIndex: mockScanIndex,
        packageJson: mockPackageJson
    });

    assert.equal(plan.api.detected, true);
    const relPaths = plan.plannedDocuments.map(d => d.relPath);
    assert.ok(relPaths.includes("reference/api.md"));
});

test("DocPlanner conditionally plans database reference when ORM or schema models are detected", async () => {
    const mockScanIndex: RepositoryScanIndex = {
        files: ["prisma/schema.prisma", "src/models/User.ts"],
        symbols: new Map([
            ["UserModel", {
                name: "UserModel",
                kind: "interface",
                file: "src/models/User.ts",
                exported: true,
                startLine: 1,
                endLine: 25
            }]
        ]),
        dependencies: [],
        warnings: [],
        complete: true
    };

    const mockPackageJson = {
        name: "db-service",
        dependencies: {
            "@prisma/client": "^5.0.0"
        }
    };

    const planner = new DocPlanner();
    const plan = await planner.createPlan({
        rootDir: ".",
        scanIndex: mockScanIndex,
        packageJson: mockPackageJson
    });

    assert.equal(plan.database.detected, true);
    const relPaths = plan.plannedDocuments.map(d => d.relPath);
    assert.ok(relPaths.includes("reference/database.md"));
});
