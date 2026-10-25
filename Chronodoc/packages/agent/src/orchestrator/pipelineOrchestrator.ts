import { buildScanIndex } from "../scanner/scanRepository.js";
import { HybridRetriever } from "../retrieval/hybridRetriever.js";
import { buildContext } from "../context/contextBuilder.js";
import { DocumentGenerator } from "../generator/documentGenerator.js";
import { DocumentValidator } from "../validator/documentValidator.js";
import { RevisionAgent } from "./revisionAgent.js";
import type { GeneratedDocument } from "../generator/types.js";
import type { ValidationIssue, ValidationResult } from "../validator/types.js";
import type { RepositoryScanIndex } from "../scanner/astExtractor.js";

export interface PipelineOptions {
    maxRevisionAttempts?: number;
    alwaysFailValidation?: boolean;
    provider?: "openai" | "gemini" | "anthropic" | "mock";
    tokenBudget?: number;
}

export interface PipelineResult {
    status: "validated" | "unapproved";
    document: GeneratedDocument;
    revisionAttempts: number;
    validationHistory: ValidationResult[];
    unresolvedIssues?: ValidationIssue[];
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
        this.generator = new DocumentGenerator({ provider: options.provider ?? "mock" });
        this.validator = new DocumentValidator();
        this.revisionAgent = new RevisionAgent(this.generator);
    }

    public async execute(params: {
        target: string;
        rootDir: string;
        style?: "api-reference" | "architecture-overview" | "developer-guide";
    }): Promise<PipelineResult> {
        const { target, rootDir, style } = params;

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

        // 4. Initial Document Generation
        let currentDoc = await this.generator.generate(assembledContext, { style });
        const validationHistory: ValidationResult[] = [];
        let attempts = 0;

        // 5. Validation and Targeted Revision Loop
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
                // Final Document-Level Validation: mark all sections approved
                currentDoc.sections.forEach(s => s.status = "approved");
                return {
                    status: "validated",
                    document: currentDoc,
                    revisionAttempts: attempts,
                    validationHistory,
                };
            }

            if (attempts >= this.maxRevisionAttempts) {
                // Retry limit reached: retain as unapproved draft with report
                currentDoc.sections.forEach(s => s.status = "unapproved");
                return {
                    status: "unapproved",
                    document: currentDoc,
                    revisionAttempts: attempts,
                    validationHistory,
                    unresolvedIssues: validation.issues
                };
            }

            // Perform targeted revision on affected sections only
            attempts++;
            currentDoc = await this.revisionAgent.revise(currentDoc, validation, target);
        }

        // Fallback safety
        currentDoc.sections.forEach(s => s.status = "unapproved");
        return {
            status: "unapproved",
            document: currentDoc,
            revisionAttempts: attempts,
            validationHistory,
            unresolvedIssues: validationHistory[validationHistory.length - 1]?.issues
        };
    }
}
