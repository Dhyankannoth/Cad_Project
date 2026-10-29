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

export interface PipelineOptions {
    maxRevisionAttempts?: number;
    alwaysFailValidation?: boolean;
    provider?: "openai" | "gemini" | "anthropic" | "mock";
    apiKey?: string;
    model?: string;
    tokenBudget?: number;
    llmClient?: LLMClient;
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

    constructor(options: PipelineOptions = {}) {
        this.maxRevisionAttempts = options.maxRevisionAttempts ?? 2;
        this.alwaysFailValidation = options.alwaysFailValidation ?? false;
        this.tokenBudget = options.tokenBudget ?? 8000;

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
    }): Promise<PipelineResult> {
        const { target, rootDir, style, outDir } = params;

        // 1. Scan Repository
        let scanIndex: RepositoryScanIndex;
        try {
            scanIndex = await buildScanIndex(rootDir);
        } catch {
            scanIndex = {
                files: [target],
                symbols: new Map(),
                dependencies: [],
                warnings: [],
                complete: true
            };
        }

        // 2. Hybrid RAG Retrieval
        const retriever = new HybridRetriever({ mockSemantic: true });
        retriever.indexCorpus(
            scanIndex.files.map(f => ({ filePath: f, content: `// File content for ${f}` })),
            scanIndex
        );
        const retrievedItems = await retriever.search(target);

        // 3. Context Building
        const assembledContext = buildContext(target, retrievedItems, {
            tokenBudget: this.tokenBudget,
            docStyle: style
        });

        // 4. Provision local deterministic tools
        const { tools, executeTool } = createRepositoryTools(rootDir, scanIndex);

        // 5. Initial Document Generation with tool execution capability
        let currentDoc = await this.generator.generate(assembledContext, {
            style,
            tools,
            toolExecutor: executeTool
        });

        const validationHistory: ValidationResult[] = [];
        let attempts = 0;

        // 6. Validation and Targeted Revision Loop
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
                currentDoc.sections.forEach(s => s.status = "approved");
                const savedFilePath = outDir ? await this.saveDocumentation(currentDoc, target, outDir) : undefined;
                return {
                    status: "validated",
                    document: currentDoc,
                    revisionAttempts: attempts,
                    validationHistory,
                    savedFilePath
                };
            }

            if (attempts >= this.maxRevisionAttempts) {
                currentDoc.sections.forEach(s => s.status = "unapproved");
                const savedFilePath = outDir ? await this.saveDocumentation(currentDoc, target, outDir) : undefined;
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
            currentDoc = await this.revisionAgent.revise(currentDoc, validation, target);
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
