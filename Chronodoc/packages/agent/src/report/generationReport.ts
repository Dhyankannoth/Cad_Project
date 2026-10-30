import path from "node:path";
import fs from "node:fs/promises";
import type { DocumentationPlan } from "../planner/types.js";
import type { GeneratedDocument } from "../generator/types.js";
import type { SuiteValidationResult } from "../validator/repoDocValidator.js";
import type { WriteReport } from "../writer/safeFileWriter.js";

export interface GenerationReportOptions {
    outputDir: string;
    version?: string;
}

export interface GenerationReportParams {
    plan: DocumentationPlan;
    suite: Map<string, GeneratedDocument>;
    validation: SuiteValidationResult;
    writeReport: WriteReport;
    filesScannedCount: number;
    symbolsExtractedCount: number;
}

export class GenerationReportWriter {
    private outputDir: string;
    private version: string;

    constructor(options: GenerationReportOptions) {
        this.outputDir = path.resolve(options.outputDir);
        this.version = options.version ?? "1.0.0";
    }

    public async writeReport(params: {
        plan: DocumentationPlan;
        suite: Map<string, GeneratedDocument>;
        validation: SuiteValidationResult;
        writeReport: WriteReport;
        filesScannedCount: number;
        symbolsExtractedCount: number;
    }): Promise<string> {
        const { plan, suite, validation, writeReport, filesScannedCount, symbolsExtractedCount } = params;

        const destFile = this.outputDir.endsWith(".json")
            ? this.outputDir
            : path.join(this.outputDir, "generation-report.json");

        await fs.mkdir(path.dirname(destFile), { recursive: true });

        const documents = Array.from(suite.entries()).map(([relPath, doc]) => {
            let status: "created" | "updated" | "unchanged" = "created";
            if (writeReport.updated.includes(relPath)) {
                status = "updated";
            } else if (writeReport.unchanged.includes(relPath)) {
                status = "unchanged";
            }

            const totalRefs = doc.sections.reduce((acc, s) => acc + s.references.length, 0);

            return {
                relPath,
                title: doc.title,
                status,
                sectionsCount: doc.sections.length,
                referencesCount: totalRefs
            };
        });

        const blockingIssues = validation.issues.filter(i => i.severity === "error");
        const warningIssues = validation.issues.filter(i => i.severity === "warning");

        const sanitizedIssues = validation.issues.map(i => ({
            docRelPath: i.docRelPath,
            type: i.type,
            severity: i.severity,
            message: this.sanitizeSecret(i.message)
        }));

        const reportData = {
            generator: "docagent",
            generatorVersion: this.version,
            schemaVersion: "1.0.0",
            generatedAt: new Date().toISOString(),
            targetRepository: plan.projectName,
            statistics: {
                filesScanned: filesScannedCount,
                symbolsExtracted: symbolsExtractedCount,
                documentsPlanned: plan.plannedDocuments.length,
                documentsGenerated: suite.size,
                documentsCreated: writeReport.created.length,
                documentsUpdated: writeReport.updated.length,
                documentsUnchanged: writeReport.unchanged.length,
                preservedEdits: writeReport.preservedEdits.length
            },
            documents,
            skipped: plan.skippedDocuments.map(s => ({
                relPath: s.relPath,
                reason: s.reason
            })),
            validation: {
                passed: validation.passed,
                blockingErrors: blockingIssues.length,
                warnings: warningIssues.length,
                issues: sanitizedIssues
            }
        };

        const jsonContent = JSON.stringify(reportData, null, 2);
        await fs.writeFile(destFile, jsonContent, "utf-8");

        return destFile;
    }

    private sanitizeSecret(str: string): string {
        return str
            .replace(/AIzaSy[A-Za-z0-9_-]{33}/g, "AIzaSy[REDACTED]")
            .replace(/sk-[a-zA-Z0-9_\-]{20,}/g, "sk-[REDACTED]")
            .replace(/gh[pousr]_[A-Za-z0-9_]{36,}/g, "ghp_[REDACTED]")
            .replace(/AKIA[0-9A-Z]{16}/g, "AKIA[REDACTED]");
    }
}
