import path from "node:path";
import fs from "node:fs/promises";
import { buildScanIndex } from "../scanner/scanRepository.js";
import { DocPlanner } from "../planner/docPlanner.js";
import { RepoDocGenerator } from "../generator/repoDocGenerator.js";
import { RepoDocValidator } from "../validator/repoDocValidator.js";
import { SafeFileWriter } from "../writer/safeFileWriter.js";
import { GenerationReportWriter } from "../report/generationReport.js";
import { createLLMClient } from "../llm/client.js";
import type { RepositoryScanIndex } from "../scanner/astExtractor.js";
import type { DocumentationPlan } from "../planner/types.js";
import type { GeneratedDocument } from "../generator/types.js";
import type { SuiteValidationResult } from "../validator/repoDocValidator.js";
import type { WriteReport } from "../writer/safeFileWriter.js";
import type { LLMClient } from "../llm/types.js";

export interface RepoDocProgressEvent {
    stage: "scanning" | "planning" | "generation" | "validation" | "writing" | "reporting";
    status: "started" | "completed" | "failed";
    message: string;
}

export interface RepositoryDocOptions {
    provider?: "openai" | "gemini" | "anthropic" | "mock";
    apiKey?: string;
    model?: string;
    tokenBudget?: number;
    maxRevisionAttempts?: number;
    llmClient?: LLMClient;
    onProgress?: (event: RepoDocProgressEvent) => void;
}

export interface RepositoryDocResult {
    status: "success" | "warning" | "error";
    plan: DocumentationPlan;
    suite: Map<string, GeneratedDocument>;
    validation: SuiteValidationResult;
    writeReport: WriteReport;
    outputDir: string;
    reportPath: string;
    durationMs: number;
}

export class RepositoryDocOrchestrator {
    private llmClient?: LLMClient;
    private onProgress?: (event: RepoDocProgressEvent) => void;

    constructor(options: RepositoryDocOptions = {}) {
        this.onProgress = options.onProgress;

        if (options.llmClient) {
            this.llmClient = options.llmClient;
        } else if (options.provider && options.provider !== "mock") {
            try {
                this.llmClient = createLLMClient({
                    provider: options.provider,
                    apiKey: options.apiKey,
                    model: options.model
                });
            } catch {
                this.llmClient = undefined;
            }
        }
    }

    public async execute(params: {
        rootDir: string;
        outputDir?: string;
        outDir?: string;
        onProgress?: (event: RepoDocProgressEvent) => void;
    }): Promise<RepositoryDocResult> {
        const startTime = Date.now();
        const rootDir = path.resolve(params.rootDir);
        const rawOut = params.outputDir ?? params.outDir ?? "docs";
        const outputDir = path.isAbsolute(rawOut) ? rawOut : path.resolve(rootDir, rawOut);
        const notify = params.onProgress ?? this.onProgress;

        // 1. Scanning
        notify?.({ stage: "scanning", status: "started", message: "Scanning repository files and AST symbols" });
        const scanIndex: RepositoryScanIndex = await buildScanIndex(rootDir);
        notify?.({
            stage: "scanning",
            status: "completed",
            message: `Scanned ${scanIndex.files.length} files (${scanIndex.symbols.size} symbols discovered)`
        });

        // 2. Reading package.json if present
        let packageJson: any = undefined;
        try {
            const rawPkg = await fs.readFile(path.join(rootDir, "package.json"), "utf-8");
            packageJson = JSON.parse(rawPkg);
        } catch {
            packageJson = undefined;
        }

        // 3. Planning
        notify?.({ stage: "planning", status: "started", message: "Analyzing project characteristics and planning documentation tree" });
        const planner = new DocPlanner();
        const plan = await planner.createPlan({
            rootDir,
            scanIndex,
            packageJson
        });
        notify?.({
            stage: "planning",
            status: "completed",
            message: `Planned ${plan.plannedDocuments.length} documents (${plan.skippedDocuments.length} skipped with reasons)`
        });

        // 4. Generation
        notify?.({ stage: "generation", status: "started", message: "Generating cohesive Markdown documentation suite" });
        const generator = new RepoDocGenerator({ llmClient: this.llmClient });
        const suite = await generator.generateSuite({
            plan,
            scanIndex,
            rootDir
        });
        notify?.({
            stage: "generation",
            status: "completed",
            message: `Generated ${suite.size} documentation files`
        });

        // 5. Validation
        notify?.({ stage: "validation", status: "started", message: "Validating cross-document internal links, symbols, and secrets" });
        const validator = new RepoDocValidator();
        const validation = await validator.validateSuite(suite, scanIndex);
        notify?.({
            stage: "validation",
            status: "completed",
            message: validation.passed
                ? `Validation passed (${validation.linksChecked} links verified)`
                : `Validation found ${validation.issues.length} issue(s)`
        });

        // 6. Safe Writing
        notify?.({ stage: "writing", status: "started", message: "Writing documentation to disk with edit preservation" });
        const writer = new SafeFileWriter({ baseDir: outputDir });
        const writeReport = await writer.writeSuite(suite);
        notify?.({
            stage: "writing",
            status: "completed",
            message: `Wrote documents: ${writeReport.created.length} created, ${writeReport.updated.length} updated, ${writeReport.unchanged.length} unchanged`
        });

        // 7. Reporting
        notify?.({ stage: "reporting", status: "started", message: "Generating machine-readable metadata report" });
        const reportWriter = new GenerationReportWriter({
            outputDir: path.join(outputDir, "metadata")
        });
        const reportPath = await reportWriter.writeReport({
            plan,
            suite,
            validation,
            writeReport,
            filesScannedCount: scanIndex.files.length,
            symbolsExtractedCount: scanIndex.symbols.size
        });
        notify?.({
            stage: "reporting",
            status: "completed",
            message: `Metadata report saved to ${path.relative(rootDir, reportPath)}`
        });

        const durationMs = Date.now() - startTime;
        const status = !validation.passed
            ? (validation.issues.some(i => i.severity === "error") ? "error" : "warning")
            : "success";

        return {
            status,
            plan,
            suite,
            validation,
            writeReport,
            outputDir,
            reportPath,
            durationMs
        };
    }
}
