import { readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import {
    extractSymbols,
    extractDependencies,
    type CodeSymbol,
    type DependencyLink,
    type RepositoryScanIndex
} from "./astExtractor.js";

const DEFAULT_IGNORED_DIRECTORIES = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".superpowers"
];

const SUPPORTED_EXTENSIONS = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".md",
]);

export type DirectoryReader = (directory: string) => Promise<Dirent[]>;

export type ScanOptions = {
    ignore?: string[];
    allowPartial?: boolean;
    readDirectory?: DirectoryReader;
};

export type ScanResult = {
    files: string[];
    warnings: string[];
    complete: boolean;
};

export async function scanRepository(
    rootDirectory: string,
    options: ScanOptions = {}
): Promise<ScanResult> {
    const absoluteRoot = path.resolve(rootDirectory);

    const ignoredDirectories = new Set([
        ...DEFAULT_IGNORED_DIRECTORIES,
        ...(options.ignore ?? []),
    ]);

    const readDir: DirectoryReader = options.readDirectory ??
        ((dir: string) => readdir(dir, { withFileTypes: true }));

    const discoveredFiles: string[] = [];
    const warnings: string[] = [];

    let rootEntries: Dirent[];
    try {
        rootEntries = await readDir(absoluteRoot);
    } catch (error) {
        throw new Error(
            `Failed to scan root directory "${absoluteRoot}"`,
            { cause: error }
        );
    }

    async function traverse(
        currentDirectory: string,
        entries?: Dirent[]
    ): Promise<void> {
        let directoryEntries: Dirent[];

        try {
            directoryEntries =
                entries ??
                (await readDir(currentDirectory));
        } catch (error) {
            if (!options.allowPartial) {
                throw new Error(
                    `Failed to scan directory "${currentDirectory}"`,
                    { cause: error }
                );
            }

            warnings.push(
                `Skipped inaccessible directory: ${currentDirectory}`
            );
            return;
        }

        for (const entry of directoryEntries) {
            const fullPath = path.join(currentDirectory, entry.name);

            if (entry.isDirectory()) {
                if (ignoredDirectories.has(entry.name) || entry.name.startsWith("tests-temp")) {
                    continue;
                }

                await traverse(fullPath);
                continue;
            }

            if (!entry.isFile()) {
                continue;
            }

            const extension = path.extname(entry.name);

            if (SUPPORTED_EXTENSIONS.has(extension)) {
                discoveredFiles.push(
                    path.relative(absoluteRoot, fullPath)
                );
            }
        }
    }

    await traverse(absoluteRoot, rootEntries);

    return {
        files: discoveredFiles,
        warnings,
        complete: warnings.length === 0,
    };
}

export async function buildScanIndex(
    rootDirectory: string,
    options: ScanOptions = {}
): Promise<RepositoryScanIndex> {
    const absoluteRoot = path.resolve(rootDirectory);
    const scan = await scanRepository(absoluteRoot, options);

    const symbols = new Map<string, CodeSymbol[]>();
    const allDependencies: DependencyLink[] = [];

    for (const relativeFile of scan.files) {
        const ext = path.extname(relativeFile);
        if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx") {
            try {
                const fullPath = path.join(absoluteRoot, relativeFile);
                const source = await readFile(fullPath, "utf-8");
                const fileSymbols = extractSymbols(relativeFile, source);
                const fileDeps = extractDependencies(relativeFile, source);

                for (const sym of fileSymbols) {
                    const existing = symbols.get(sym.name) ?? [];
                    existing.push(sym);
                    symbols.set(sym.name, existing);
                }

                allDependencies.push(...fileDeps);
            } catch (err) {
                scan.warnings.push(`Failed to parse AST for ${relativeFile}: ${(err as Error).message}`);
            }
        }
    }

    return {
        files: scan.files,
        symbols,
        dependencies: allDependencies,
        warnings: scan.warnings,
        complete: scan.warnings.length === 0,
    };
}
