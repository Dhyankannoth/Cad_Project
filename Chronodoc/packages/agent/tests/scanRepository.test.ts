
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readdir } from "node:fs/promises";

import { scanRepository } from "../src/scanner/scanRepository.js";

test("discovers supported files and ignores unsupported files", async () => {
    const root = await mkdtemp(
        path.join(os.tmpdir(), "docagent-test-")
    );

    try {
        await mkdir(path.join(root, "src"));

        await writeFile(
            path.join(root, "src", "app.ts"),
            "export const app = true;"
        );

        await writeFile(
            path.join(root, "README.md"),
            "# My project"
        );

        await writeFile(
            path.join(root, "logo.png"),
            "fake image"
        );

        const result = await scanRepository(root);

        assert.deepEqual(
            [...result.files].sort(),
            ["README.md", path.join("src", "app.ts")].sort()
        );

        assert.equal(result.complete, true);
        assert.deepEqual(result.warnings, []);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});


test("ignores default and user-configured directories", async () => {
    const root = await mkdtemp(
        path.join(os.tmpdir(), "docagent-test-")
    );

    try {
        await mkdir(path.join(root, "src"));
        await mkdir(path.join(root, "node_modules"));
        await mkdir(path.join(root, "generated"));

        await writeFile(
            path.join(root, "src", "app.ts"),
            "export const app = true;"
        );

        await writeFile(
            path.join(root, "node_modules", "dependency.js"),
            "module.exports = {};"
        );

        await writeFile(
            path.join(root, "generated", "output.ts"),
            "export const generated = true;"
        );

        const result = await scanRepository(root, {
            ignore: ["generated"],
        });

        assert.deepEqual(result.files, [
            path.join("src", "app.ts"),
        ]);

        assert.equal(result.complete, true);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});


// test 3 : Fail-fast: an inaccessible nested directory causes the scan to reject.

import type { Dirent } from "node:fs";

test("fails when a nested directory cannot be read", async () => {
    const root = await mkdtemp(
        path.join(os.tmpdir(), "docagent-test-")
    );

    const realReadDirectory = async (directory: string) =>
        readdir(directory, { withFileTypes: true });

    try {
        await mkdir(path.join(root, "src"));

        const reader = async (directory: string): Promise<Dirent[]> => {
            if (directory === path.join(root, "src")) {
                throw new Error("Simulated permission error");
            }

            return realReadDirectory(directory);
        };

        await assert.rejects(
            scanRepository(root, { readDirectory: reader }),
            /Failed to scan directory/
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});