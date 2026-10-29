import fs from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "../llm/types.js";
import type { RepositoryScanIndex } from "../scanner/astExtractor.js";

export function createRepositoryTools(rootDir: string, scanIndex: RepositoryScanIndex): {
    tools: ToolDefinition[];
    executeTool: (name: string, args: Record<string, any>) => Promise<string>;
} {
    const tools: ToolDefinition[] = [
        {
            name: "astLookup",
            description: "Looks up AST symbol information (signature, docstring, file location, parameters) by name in the codebase.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "The symbol name to lookup" }
                },
                required: ["name"]
            }
        },
        {
            name: "readFileSlice",
            description: "Reads a specific slice of lines from a source file to inspect implementation logic and error handling.",
            parameters: {
                type: "object",
                properties: {
                    filePath: { type: "string", description: "Path to the file relative to repository root" },
                    startLine: { type: "number", description: "1-based starting line number" },
                    endLine: { type: "number", description: "1-based ending line number" }
                },
                required: ["filePath", "startLine", "endLine"]
            }
        },
        {
            name: "findReferences",
            description: "Finds import and export references and dependencies for a given module path or symbol.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "File path or symbol to check dependencies for" }
                },
                required: ["query"]
            }
        }
    ];

    const executeTool = async (name: string, args: Record<string, any>): Promise<string> => {
        if (name === "astLookup") {
            const symName = args.name;
            const found = scanIndex.symbols.get(symName);
            if (!found || found.length === 0) {
                return JSON.stringify({ found: false, error: `Symbol "${symName}" not found in scanned AST index` });
            }
            return JSON.stringify({
                found: true,
                symbols: found.map(s => ({
                    name: s.name,
                    kind: s.kind,
                    filePath: s.filePath,
                    signature: s.signature,
                    jsdoc: s.jsdoc,
                    exported: s.exported
                }))
            });
        }

        if (name === "readFileSlice") {
            const targetPath = path.resolve(rootDir, args.filePath);
            try {
                const content = await fs.readFile(targetPath, "utf-8");
                const lines = content.split("\n");
                const start = Math.max(1, args.startLine || 1);
                const end = Math.min(lines.length, args.endLine || lines.length);
                const slice = lines.slice(start - 1, end).join("\n");
                return JSON.stringify({
                    success: true,
                    filePath: args.filePath,
                    totalLines: lines.length,
                    startLine: start,
                    endLine: end,
                    content: slice
                });
            } catch (err: any) {
                return JSON.stringify({
                    success: false,
                    filePath: args.filePath,
                    error: `Unable to read file: ${err.message}`
                });
            }
        }

        if (name === "findReferences") {
            const q = args.query;
            const matchedDeps = scanIndex.dependencies.filter(
                d => d.sourceFile.includes(q) || d.moduleSpecifier.includes(q) || d.importedSymbols.includes(q)
            );
            return JSON.stringify({
                query: q,
                count: matchedDeps.length,
                references: matchedDeps
            });
        }

        return JSON.stringify({ error: `Unknown tool: "${name}"` });
    };

    return { tools, executeTool };
}
