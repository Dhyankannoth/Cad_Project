import test from "node:test";
import assert from "node:assert/strict";
import { RepoDocGenerator } from "../../src/generator/repoDocGenerator.js";
import { DocPlanner } from "../../src/planner/docPlanner.js";
import type { RepositoryScanIndex } from "../../src/scanner/astExtractor.js";

const mockScanIndex: RepositoryScanIndex = {
    files: [
        "package.json",
        "src/index.ts",
        "src/services/orderService.ts",
        "src/services/paymentService.ts",
        "src/routes/api.ts",
        "tests/orderService.test.ts"
    ],
    symbols: new Map([
        ["OrderService", {
            name: "OrderService",
            kind: "class",
            file: "src/services/orderService.ts",
            exported: true,
            startLine: 1,
            endLine: 40
        }],
        ["PaymentService", {
            name: "PaymentService",
            kind: "class",
            file: "src/services/paymentService.ts",
            exported: true,
            startLine: 1,
            endLine: 35
        }],
        ["createOrderHandler", {
            name: "createOrderHandler",
            kind: "function",
            file: "src/routes/api.ts",
            exported: true,
            startLine: 1,
            endLine: 20
        }]
    ]),
    dependencies: [
        { source: "src/routes/api.ts", specifier: "../services/orderService.js", resolved: "src/services/orderService.ts" },
        { source: "src/services/orderService.ts", specifier: "./paymentService.js", resolved: "src/services/paymentService.ts" }
    ],
    warnings: [],
    complete: true
};

const mockPackageJson = {
    name: "ecommerce-core",
    version: "2.1.0",
    description: "Core order and payment processing engine",
    scripts: {
        build: "tsc",
        test: "tsx --test tests/**/*.test.ts",
        start: "node dist/index.js"
    },
    dependencies: {
        express: "^4.19.0",
        picocolors: "^1.0.0"
    },
    devDependencies: {
        typescript: "^5.4.0",
        tsx: "^4.7.0"
    }
};

test("RepoDocGenerator produces interconnected documentation suite adhering to design system", async () => {
    const planner = new DocPlanner();
    const plan = await planner.createPlan({
        rootDir: ".",
        scanIndex: mockScanIndex,
        packageJson: mockPackageJson
    });

    const generator = new RepoDocGenerator();
    const suite = await generator.generateSuite({
        plan,
        scanIndex: mockScanIndex,
        rootDir: "."
    });

    assert.ok(suite.has("README.md"), "Should generate README.md");
    assert.ok(suite.has("getting-started.md"), "Should generate getting-started.md");
    assert.ok(suite.has("architecture/overview.md"), "Should generate architecture/overview.md");
    assert.ok(suite.has("architecture/components.md"), "Should generate architecture/components.md");
    assert.ok(suite.has("architecture/data-flow.md"), "Should generate architecture/data-flow.md");
    assert.ok(suite.has("guides/development.md"), "Should generate guides/development.md");
    assert.ok(suite.has("guides/testing.md"), "Should generate guides/testing.md");
    assert.ok(suite.has("reference/api.md"), "Should generate reference/api.md when API detected");
    assert.ok(suite.has("reference/dependencies.md"), "Should generate reference/dependencies.md");

    // 1. Validate README formatting and relative links
    const readme = suite.get("README.md")!;
    assert.ok(readme.rawMarkdown.startsWith("# "), "README must begin with single top-level heading");
    assert.ok(readme.rawMarkdown.includes("[Getting Started](getting-started.md)"));
    assert.ok(readme.rawMarkdown.includes("[Architecture Overview](architecture/overview.md)"));
    assert.ok(readme.rawMarkdown.includes("ecommerce-core"));

    // 2. Validate Getting Started instructions
    const gettingStarted = suite.get("getting-started.md")!;
    assert.ok(gettingStarted.rawMarkdown.includes("npm install"));
    assert.ok(gettingStarted.rawMarkdown.includes("npm test"));

    // 3. Validate Architecture Overview Mermaid diagram
    const archOverview = suite.get("architecture/overview.md")!;
    assert.ok(archOverview.rawMarkdown.includes("```mermaid\nflowchart TD"));
    assert.ok(archOverview.rawMarkdown.includes("OrderService"));

    // 4. Validate Components document lists verified symbols and source files
    const components = suite.get("architecture/components.md")!;
    assert.ok(components.rawMarkdown.includes("`src/services/orderService.ts`"));
    assert.ok(components.rawMarkdown.includes("OrderService"));

    // 5. Validate Data Flow document has sequence or workflow diagram
    const dataFlow = suite.get("architecture/data-flow.md")!;
    assert.ok(dataFlow.rawMarkdown.includes("```mermaid"));

    // 6. Validate API Reference document
    const apiDoc = suite.get("reference/api.md")!;
    assert.ok(apiDoc.rawMarkdown.includes("createOrderHandler"));
    assert.ok(apiDoc.rawMarkdown.includes("`src/routes/api.ts`"));
});
