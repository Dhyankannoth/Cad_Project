import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveProjectRoot } from "../src/scanner/projectRoot.js";

test("resolveProjectRoot discovers main directory with .git when executed from deep subfolder", async () => {
    const tempRoot = path.resolve("./tests-temp-root-git");
    const subDir = path.join(tempRoot, "src", "nested", "subfolder");
    await fs.mkdir(path.join(tempRoot, ".git"), { recursive: true });
    await fs.mkdir(subDir, { recursive: true });

    const resolved = resolveProjectRoot({ cwd: subDir });
    assert.equal(resolved, tempRoot);

    await fs.rm(tempRoot, { recursive: true, force: true });
});

test("resolveProjectRoot discovers monorepo root with workspaces", async () => {
    const tempRoot = path.resolve("./tests-temp-root-workspaces");
    const subPackage = path.join(tempRoot, "packages", "agent");
    await fs.mkdir(subPackage, { recursive: true });

    await fs.writeFile(
        path.join(tempRoot, "package.json"),
        JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
        "utf-8"
    );
    await fs.writeFile(
        path.join(subPackage, "package.json"),
        JSON.stringify({ name: "agent" }),
        "utf-8"
    );

    const resolved = resolveProjectRoot({ cwd: subPackage });
    assert.equal(resolved, tempRoot);

    await fs.rm(tempRoot, { recursive: true, force: true });
});

test("resolveProjectRoot respects explicitRoot when explicitly provided", () => {
    const explicit = path.resolve("./custom-dir");
    const resolved = resolveProjectRoot({ cwd: process.cwd(), explicitRoot: "./custom-dir" });
    assert.equal(resolved, explicit);
});

test("resolveProjectRoot falls back to cwd when no git or package.json marker exists", async () => {
    const tempDir = path.resolve("./tests-temp-isolated-dir");
    await fs.mkdir(tempDir, { recursive: true });

    const resolved = resolveProjectRoot({ cwd: tempDir, stopAt: tempDir });
    assert.equal(resolved, tempDir);

    await fs.rm(tempDir, { recursive: true, force: true });
});

