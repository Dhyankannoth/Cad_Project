import path from "node:path";
import type { GeneratedDocument } from "../generator/types.js";
import type { RepositoryScanIndex } from "../scanner/astExtractor.js";

export interface SuiteValidationIssue {
    docRelPath: string;
    sectionId?: string;
    type: "broken_internal_link" | "invalid_source_path" | "unknown_symbol" | "secret_detected" | "invalid_mermaid" | "structural_violation";
    severity: "error" | "warning";
    message: string;
    target?: string;
}

export interface SuiteValidationResult {
    passed: boolean;
    issues: SuiteValidationIssue[];
    documentsValidated: number;
    linksChecked: number;
}

export class RepoDocValidator {
    public async validateSuite(
        suite: Map<string, GeneratedDocument>,
        scanIndex: RepositoryScanIndex
    ): Promise<SuiteValidationResult> {
        const issues: SuiteValidationIssue[] = [];
        let linksChecked = 0;

        const knownDocPaths = new Set(Array.from(suite.keys()).map(p => this.normalizePosix(p)));
        const knownRepoFiles = new Set(scanIndex.files.map(f => this.normalizePosix(f)));
        const knownSymbols = scanIndex.symbols;

        for (const [relPath, doc] of suite.entries()) {
            const normalizedDocPath = this.normalizePosix(relPath);
            const docDir = path.posix.dirname(normalizedDocPath);

            // 1. Structural Checks
            if (!doc.rawMarkdown.startsWith("# ")) {
                issues.push({
                    docRelPath: relPath,
                    type: "structural_violation",
                    severity: "error",
                    message: "Document must begin with a single top-level '# ' heading"
                });
            }

            // 2. Secret Redaction / Leak Detection
            const secrets = this.detectSecrets(doc.rawMarkdown);
            for (const secret of secrets) {
                issues.push({
                    docRelPath: relPath,
                    type: "secret_detected",
                    severity: "error",
                    message: `Potentially exposed credential or secret detected: "${secret.match}"`,
                    target: secret.match
                });
            }

            // 3. Mermaid Block Syntax
            const mermaidBlocks = this.extractMermaidBlocks(doc.rawMarkdown);
            for (const mb of mermaidBlocks) {
                if (!this.isValidMermaidHeader(mb)) {
                    issues.push({
                        docRelPath: relPath,
                        type: "invalid_mermaid",
                        severity: "error",
                        message: "Mermaid diagram missing valid diagram type (flowchart, sequenceDiagram, erDiagram, etc.)"
                    });
                }
            }

            // 4. Internal Link Resolution
            const markdownLinks = this.extractMarkdownLinks(doc.rawMarkdown);
            for (const link of markdownLinks) {
                if (link.startsWith("http://") || link.startsWith("https://") || link.startsWith("mailto:") || link.startsWith("#")) {
                    continue; // Skip external and anchor-only links
                }

                linksChecked++;
                const linkWithoutAnchor = link.split("#")[0].trim();
                if (!linkWithoutAnchor) continue;

                const targetPosix = path.posix.normalize(path.posix.join(docDir, linkWithoutAnchor));
                if (!knownDocPaths.has(targetPosix)) {
                    issues.push({
                        docRelPath: relPath,
                        type: "broken_internal_link",
                        severity: "error",
                        message: `Internal link "${link}" in "${relPath}" resolves to non-existent document "${targetPosix}"`,
                        target: link
                    });
                }
            }

            // 5. Source File and AST Symbol References in Sections
            for (const section of doc.sections) {
                if (!section.references || !Array.isArray(section.references)) continue;
                for (const ref of section.references) {
                    if (!ref || typeof ref !== "string") continue;
                    const normRef = this.normalizePosix(ref);
                    const looksLikeFile = normRef.includes("/") || /\.[a-z0-9]+$/i.test(normRef);

                    if (looksLikeFile) {
                        // Allow references to other docs or repo files
                        const isKnownDoc = knownDocPaths.has(normRef) || knownDocPaths.has(path.posix.normalize(path.posix.join(docDir, normRef)));
                        const isKnownRepoFile = knownRepoFiles.has(normRef) || scanIndex.files.some(f => f.endsWith(normRef)) || normRef === "package.json" || normRef === "tsconfig.json";

                        if (!isKnownDoc && !isKnownRepoFile) {
                            issues.push({
                                docRelPath: relPath,
                                sectionId: section.id,
                                type: "invalid_source_path",
                                severity: "warning",
                                message: `Referenced file path "${ref}" not found in scanned repository`,
                                target: ref
                            });
                        }
                    } else if (ref.length > 2 && !ref.includes(" ") && !ref.includes("-") && /^[a-zA-Z]/.test(ref)) {
                        // Symbol reference
                        if (!knownSymbols.has(ref) && !["Node", "TypeScript", "JavaScript", "Client", "Server"].includes(ref)) {
                            // Non-blocking warning for symbol references
                            issues.push({
                                docRelPath: relPath,
                                sectionId: section.id,
                                type: "unknown_symbol",
                                severity: "warning",
                                message: `Referenced symbol "${ref}" not found in scanned AST index`,
                                target: ref
                            });
                        }
                    }
                }
            }
        }

        const blockingIssues = issues.filter(i => i.severity === "error");

        return {
            passed: blockingIssues.length === 0,
            issues,
            documentsValidated: suite.size,
            linksChecked
        };
    }

    private normalizePosix(filePath: string): string {
        if (!filePath) return "";
        return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
    }

    private extractMarkdownLinks(markdown: string): string[] {
        const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
        const links: string[] = [];
        let match: RegExpExecArray | null;

        while ((match = linkRegex.exec(markdown)) !== null) {
            if (match[1]) {
                links.push(match[1].trim());
            }
        }
        return links;
    }

    private extractMermaidBlocks(markdown: string): string[] {
        const blocks: string[] = [];
        const regex = /```mermaid\s+([\s\S]*?)```/g;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(markdown)) !== null) {
            if (match[1]) {
                blocks.push(match[1].trim());
            }
        }
        return blocks;
    }

    private isValidMermaidHeader(content: string): boolean {
        const firstLine = content.split("\n")[0]?.trim() || "";
        const validTypes = ["flowchart", "sequenceDiagram", "erDiagram", "graph", "classDiagram", "stateDiagram", "pie", "gantt"];
        return validTypes.some(vt => firstLine.startsWith(vt));
    }

    private detectSecrets(content: string): Array<{ type: string; match: string }> {
        const secrets: Array<{ type: string; match: string }> = [];

        // Google API Key
        const googleRegex = /AIzaSy[A-Za-z0-9_-]{33}/g;
        let gMatch: RegExpExecArray | null;
        while ((gMatch = googleRegex.exec(content)) !== null) {
            secrets.push({ type: "google_api_key", match: gMatch[0] });
        }

        // OpenAI / Anthropic Key
        const openaiRegex = /sk-(?:live|test|proj)?[a-zA-Z0-9_\-]{20,}/g;
        let oMatch: RegExpExecArray | null;
        while ((oMatch = openaiRegex.exec(content)) !== null) {
            secrets.push({ type: "openai_anthropic_key", match: oMatch[0] });
        }

        // GitHub token
        const ghRegex = /gh[pousr]_[A-Za-z0-9_]{36,}/g;
        let ghMatch: RegExpExecArray | null;
        while ((ghMatch = ghRegex.exec(content)) !== null) {
            secrets.push({ type: "github_token", match: ghMatch[0] });
        }

        // AWS Access Key
        const awsRegex = /AKIA[0-9A-Z]{16}/g;
        let awsMatch: RegExpExecArray | null;
        while ((awsMatch = awsRegex.exec(content)) !== null) {
            secrets.push({ type: "aws_access_key", match: awsMatch[0] });
        }

        return secrets;
    }
}
