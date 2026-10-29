import fs from "node:fs/promises";
import path from "node:path";
import { buildScanIndex } from "../scanner/scanRepository.js";
import { HybridRetriever } from "../retrieval/hybridRetriever.js";
import { buildContext } from "../context/contextBuilder.js";
import { DocumentGenerator } from "../generator/documentGenerator.js";
import { DocumentValidator } from "../validator/documentValidator.js";
import { RevisionAgent } from "./revisionAgent.js";
import { createRepositoryTools } from "../tools/repoTools.js";
import { createLLMClient } from "../llm/client.js";
import type { GeneratedDocument } from "../generator/types.js";
import type { ValidationIssue, ValidationResult } from "../validator/types.js";
import type { RepositoryScanIndex } from "../scanner/astExtractor.js";
import type { LLMClient } from "../llm/types.js";

export interface ProgressEvent {
    stage: "scanning" | "retrieval" | "context" | "generation" | "validation" | "revision" | "writing";
    status: "started" | "completed" | "failed";
    message: string;
}

export interface PipelineOptions {
    maxRevisionAttempts?: number;
    alwaysFailValidation?: boolean;
    provider?: "openai" | "gemini" | "anthropic" | "mock";
    apiKey?: string;
    model?: string;
    tokenBudget?: number;
    llmClient?: LLMClient;
    onProgress?: (event: ProgressEvent) => void;
}

export interface PipelineResult {
    status: "validated" | "unapproved";
    document: GeneratedDocument;
    revisionAttempts: number;
    validationHistory: ValidationResult[];
    unresolvedIssues?: ValidationIssue[];
    savedFilePath?: string;
}

export class PipelineOrchestrator {
    private maxRevisionAttempts: number;
    private alwaysFailValidation: boolean;
    private generator: DocumentGenerator;
    private validator: DocumentValidator;
    private revisionAgent: RevisionAgent;
    private tokenBudget: number;
    private onProgress?: (event: ProgressEvent) => void;

    constructor(options: PipelineOptions = {}) {
        this.maxRevisionAttempts = options.maxRevisionAttempts ?? 2;
        this.alwaysFailValidation = options.alwaysFailValidation ?? false;
        this.tokenBudget = options.tokenBudget ?? 8000;
        this.onProgress = options.onProgress;

        let client = options.llmClient;
        if (!client) {
            try {
                client = createLLMClient({
                    provider: options.provider ?? "mock",
                    apiKey: options.apiKey,
                    model: options.model
                });
            } catch {
                client = undefined;
            }
        }

        this.generator = new DocumentGenerator({
            provider: options.provider ?? "mock",
            apiKey: options.apiKey,
            model: options.model,
            llmClient: client
        });
        this.validator = new DocumentValidator();
        this.revisionAgent = new RevisionAgent(this.generator);
    }

    public async execute(params: {
        target: string;
        rootDir: string;
        style?: "api-reference" | "architecture-overview" | "developer-guide";
        outDir?: string;
        onProgress?: (event: ProgressEvent) => void;
    }): Promise<PipelineResult> {
        const { target, rootDir, style, outDir } = params;
        const notify = params.onProgress ?? this.onProgress;

        // 1. Scan Repository
        notify?.({ stage: "scanning", status: "started", message: "Repository scanning" });
        let scanIndex: RepositoryScanIndex;
        try {
            scanIndex = await buildScanIndex(rootDir);
            notify?.({ stage: "scanning", status: "completed", message: `Repository scanning: ${scanIndex.files.length} files discovered` });
        } catch {
            scanIndex = {
                files: [target],
                symbols: new Map(),
                dependencies: [],
                warnings: [],
                complete: true
            };
            notify?.({ stage: "scanning", status: "completed", message: "Repository scanning (single target fallback)" });
        }

        // 2. Hybrid RAG Retrieval
        notify?.({ stage: "retrieval", status: "started", message: "Hybrid retrieval (AST + Lexical + Semantic)" });
        const retriever = new HybridRetriever({ mockSemantic: true });
        retriever.indexCorpus(
            scanIndex.files.map(f => ({ filePath: f, content: `// File content for ${f}` })),
            scanIndex
        );
        const retrievedItems = await retriever.search(target);
        notify?.({ stage: "retrieval", status: "completed", message: `Hybrid retrieval: ${retrievedItems.length} context items retrieved` });

        // 3. Context Building
        notify?.({ stage: "context", status: "started", message: "Context preparation & token budgeting" });
        const assembledContext = buildContext(target, retrievedItems, {
            tokenBudget: this.tokenBudget,
            docStyle: style
        });
        notify?.({ stage: "context", status: "completed", message: `Context preparation: ${assembledContext.symbols.length} symbols indexed` });

        // 4. Provision local deterministic tools
        const { tools, executeTool } = createRepositoryTools(rootDir, scanIndex);

        // 5. Initial Document Generation with tool execution capability
        notify?.({ stage: "generation", status: "started", message: "Document generation" });
        let currentDoc = await this.generator.generate(assembledContext, {
            style,
            tools,
            toolExecutor: executeTool
        });
        notify?.({ stage: "generation", status: "completed", message: `Document generation: ${currentDoc.sections.length} sections generated` });

        const validationHistory: ValidationResult[] = [];
        let attempts = 0;

        // 6. Validation and Targeted Revision Loop
        notify?.({ stage: "validation", status: "started", message: "Document validation (Deterministic AST & References)" });
        while (attempts <= this.maxRevisionAttempts) {
            let validation: ValidationResult;

            if (this.alwaysFailValidation) {
                validation = {
                    passed: false,
                    issues: [{
                        sectionId: "overview",
                        type: "semantic_inconsistency",
                        severity: "error",
                        message: "Inconsistency detected in generated documentation"
                    }],
                    affectedSectionIds: ["overview"]
                };
            } else {
                validation = await this.validator.validate(currentDoc, scanIndex);
            }

            validationHistory.push(validation);

            if (validation.passed) {
                notify?.({ stage: "validation", status: "completed", message: "Document validation passed" });
                currentDoc.sections.forEach(s => s.status = "approved");
                
                let savedFilePath: string | undefined;
                if (outDir) {
                    notify?.({ stage: "writing", status: "started", message: "Writing documentation to output directory" });
                    savedFilePath = await this.saveDocumentation(currentDoc, target, outDir);
                    notify?.({ stage: "writing", status: "completed", message: `Documentation saved to ${savedFilePath}` });
                }

                return {
                    status: "validated",
                    document: currentDoc,
                    revisionAttempts: attempts,
                    validationHistory,
                    savedFilePath
                };
            }

            if (attempts >= this.maxRevisionAttempts) {
                notify?.({ stage: "validation", status: "failed", message: `Document validation unresolved after ${attempts} attempts` });
                currentDoc.sections.forEach(s => s.status = "unapproved");
                
                let savedFilePath: string | undefined;
                if (outDir) {
                    savedFilePath = await this.saveDocumentation(currentDoc, target, outDir);
                }

                return {
                    status: "unapproved",
                    document: currentDoc,
                    revisionAttempts: attempts,
                    validationHistory,
                    unresolvedIssues: validation.issues,
                    savedFilePath
                };
            }

            // Perform targeted revision on affected sections only
            attempts++;
            notify?.({ stage: "revision", status: "started", message: `Targeted revision attempt ${attempts}/${this.maxRevisionAttempts}` });
            currentDoc = await this.revisionAgent.revise(currentDoc, validation, target);
            notify?.({ stage: "revision", status: "completed", message: `Targeted revision complete (${validation.affectedSectionIds.length} sections updated)` });
        }


        // Fallback safety
        currentDoc.sections.forEach(s => s.status = "unapproved");
        const savedFilePath = outDir ? await this.saveDocumentation(currentDoc, target, outDir) : undefined;
        return {
            status: "unapproved",
            document: currentDoc,
            revisionAttempts: attempts,
            validationHistory,
            unresolvedIssues: validationHistory[validationHistory.length - 1]?.issues,
            savedFilePath
        };
    }

    private async saveDocumentation(doc: GeneratedDocument, target: string, outDir: string): Promise<string> {
        await fs.mkdir(outDir, { recursive: true });
        const cleanName = path.basename(target).replace(/[^a-zA-Z0-9_-]/g, "_");
        const destPath = path.join(outDir, `${cleanName}.md`);
        await fs.writeFile(destPath, doc.rawMarkdown, "utf-8");
        return destPath;
    }
}
