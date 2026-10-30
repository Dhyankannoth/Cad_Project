import path from "node:path";
import fs from "node:fs/promises";
import type { GeneratedDocument } from "../generator/types.js";

export interface WriteReport {
    created: string[];
    updated: string[];
    unchanged: string[];
    preservedEdits: string[];
}

export class SafeFileWriter {
    private baseDir: string;

    constructor(options: { baseDir: string }) {
        this.baseDir = path.resolve(options.baseDir);
    }

    public async writeSuite(suite: Map<string, GeneratedDocument>): Promise<WriteReport> {
        const report: WriteReport = {
            created: [],
            updated: [],
            unchanged: [],
            preservedEdits: []
        };

        await fs.mkdir(this.baseDir, { recursive: true });

        for (const [relPath, doc] of suite.entries()) {
            const targetPath = path.resolve(this.baseDir, relPath);
            const relativeCheck = path.relative(this.baseDir, targetPath);

            if (relativeCheck.startsWith("..") || path.isAbsolute(relativeCheck)) {
                throw new Error(`Path traversal detected: "${relPath}" resolves outside "${this.baseDir}"`);
            }

            // Ensure destination directory exists
            await fs.mkdir(path.dirname(targetPath), { recursive: true });

            let existingContent: string | null = null;
            try {
                existingContent = await fs.readFile(targetPath, "utf-8");
            } catch {
                existingContent = null;
            }

            let finalContent = doc.rawMarkdown.trimEnd() + "\n";

            if (existingContent !== null) {
                // Extract and preserve manual edit blocks from existing file
                const manualBlocks = this.extractManualBlocks(existingContent);
                let preservedCount = 0;

                for (const block of manualBlocks) {
                    if (!finalContent.includes(block.fullText)) {
                        finalContent = `${finalContent.trimEnd()}\n\n${block.fullText}\n`;
                        preservedCount++;
                    }
                }

                if (preservedCount > 0) {
                    report.preservedEdits.push(relPath);
                }

                if (existingContent === finalContent) {
                    report.unchanged.push(relPath);
                    continue;
                }

                // Write atomically via temporary file
                await this.writeAtomically(targetPath, finalContent);
                report.updated.push(relPath);
            } else {
                await this.writeAtomically(targetPath, finalContent);
                report.created.push(relPath);
            }
        }

        return report;
    }

    private async writeAtomically(targetPath: string, content: string): Promise<void> {
        const tempPath = `${targetPath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;
        await fs.writeFile(tempPath, content, "utf-8");
        await fs.rename(tempPath, targetPath);
    }

    private extractManualBlocks(content: string): Array<{ id?: string; fullText: string; innerText: string }> {
        const blocks: Array<{ id?: string; fullText: string; innerText: string }> = [];
        const regex = /<!--\s*docagent:manual-start(?::([a-zA-Z0-9_-]+))?\s*-->([\s\S]*?)<!--\s*docagent:manual-end(?::\1)?\s*-->/g;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(content)) !== null) {
            blocks.push({
                id: match[1],
                fullText: match[0].trim(),
                innerText: match[2].trim()
            });
        }

        return blocks;
    }
}
