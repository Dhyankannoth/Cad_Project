import fs from "node:fs/promises";
import path from "node:path";
import { scanRepository, buildScanIndex } from "../scanner/scanRepository.js";
import { DocumentValidator } from "../validator/documentValidator.js";
import type { GeneratedDocument, DocumentSection } from "../generator/types.js";
import type { ValidationIssue } from "../validator/types.js";
import type { InteractivePromptHandler } from "./prompts.js";
import { ClackPromptHandler, SUPPORTED_PROVIDERS } from "./prompts.js";

export interface InitOptions {
    rootDir?: string;
    interactive?: boolean;
    provider?: "gemini" | "openai" | "anthropic" | "mock";
    apiKey?: string;
    force?: boolean;
    promptHandler?: InteractivePromptHandler;
}

export interface InitResult {
    success: boolean;
    createdFiles: string[];
    alreadyExisted: string[];
    provider?: "gemini" | "openai" | "anthropic" | "mock";
    cancelled?: boolean;
}

export interface ValidateResult {
    passed: boolean;
    docPath: string;
    sectionsChecked: number;
    issues: ValidationIssue[];
    error?: string;
}

export async function executeInitCommand(options: InitOptions = {}): Promise<InitResult> {
    const root = path.resolve(options.rootDir ?? ".");
    const envDir = path.join(root, "env");
    const envFile = path.join(envDir, ".env");

    const createdFiles: string[] = [];
    const alreadyExisted: string[] = [];

    await fs.mkdir(envDir, { recursive: true });

    let provider = options.provider;
    let apiKey = options.apiKey;

    if (options.interactive) {
        const handler = options.promptHandler ?? new ClackPromptHandler();
        if (!provider) {
            const selected = await handler.selectProvider();
            if (!selected) {
                return {
                    success: false,
                    cancelled: true,
                    createdFiles: [],
                    alreadyExisted: []
                };
            }
            provider = selected;
        }

        if (provider !== "mock" && !apiKey) {
            const enteredKey = await handler.promptApiKey(provider);
            if (enteredKey === null) {
                return {
                    success: false,
                    cancelled: true,
                    createdFiles: [],
                    alreadyExisted: []
                };
            }
            apiKey = enteredKey;
        }
    }

    let fileExisted = false;
    try {
        await fs.access(envFile);
        fileExisted = true;
    } catch {
        fileExisted = false;
    }

    // Preserve existing file if non-interactive and no specific configuration was requested
    if (fileExisted && !options.force && !options.interactive && !options.provider) {
        alreadyExisted.push("env/.env");
        return {
            success: true,
            createdFiles,
            alreadyExisted,
            provider: provider ?? "gemini"
        };
    }

    const activeProvider = provider ?? "gemini";
    const meta = SUPPORTED_PROVIDERS.find(p => p.value === activeProvider);
    const defaultModel = meta?.defaultModel ?? "gemini-2.5-flash";


    const template = `# ==============================================================================
# DocAgent - Environment Configuration
# ==============================================================================

# Primary LLM Provider: "openai" | "anthropic" | "gemini" | "mock"
LLM_PROVIDER=${activeProvider}

# Provider API Credentials
${activeProvider === "gemini" ? `GEMINI_API_KEY=${apiKey ?? ""}` : "# GEMINI_API_KEY="}
${activeProvider === "openai" ? `OPENAI_API_KEY=${apiKey ?? ""}` : "# OPENAI_API_KEY="}
${activeProvider === "anthropic" ? `ANTHROPIC_API_KEY=${apiKey ?? ""}` : "# ANTHROPIC_API_KEY="}

# Model Overrides
LLM_MODEL=${defaultModel}
LLM_TEMPERATURE=0.2
`;

    await fs.writeFile(envFile, template, "utf-8");

    if (fileExisted) {
        alreadyExisted.push("env/.env");
    } else {
        createdFiles.push("env/.env");
    }

    return {
        success: true,
        createdFiles,
        alreadyExisted,
        provider: activeProvider
    };
}


export async function executeValidateCommand(options: {
    docPath: string;
    rootDir?: string;
}): Promise<ValidateResult> {
    const root = path.resolve(options.rootDir ?? ".");
    const fullDocPath = path.resolve(root, options.docPath);

    let content: string;
    try {
        content = await fs.readFile(fullDocPath, "utf-8");
    } catch (err: any) {
        return {
            passed: false,
            docPath: options.docPath,
            sectionsChecked: 0,
            issues: [],
            error: `File does not exist or cannot be read: ${err.message}`
        };
    }

    // Build scan index with AST symbols and dependencies from repository
    const scanIndex = await buildScanIndex(root);

    // Parse sections from markdown
    const rawSections = content.split(/\n(?=##\s+)/);
    const sections: DocumentSection[] = [];

    for (let i = 0; i < rawSections.length; i++) {
        const raw = rawSections[i]?.trim();
        if (!raw) continue;
        const match = raw.match(/^##\s+(.+)$/m);
        const title = match ? match[1].trim() : `Section ${i + 1}`;
        const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const body = raw.replace(/^##\s+.+\n?/, "").trim();

        // Extract potential symbol references (`symbolName`) and file paths (`path/to/file`)
        const symbolMatches = Array.from(raw.matchAll(/`([a-zA-Z0-9_\-\.\/]+)`/g)).map(m => m[1]);

        sections.push({
            id: id || `section-${i}`,
            title,
            content: body || raw,
            references: Array.from(new Set(symbolMatches)),
            status: "generated"
        });
    }

    const doc: GeneratedDocument = {
        id: `doc-validate-${Date.now()}`,
        title: path.basename(options.docPath),
        style: "developer-guide",
        sections,
        rawMarkdown: content,
        generatedAt: new Date().toISOString()
    };

    const validator = new DocumentValidator();
    const validationResult = await validator.validate(doc, scanIndex);

    return {
        passed: validationResult.passed,
        docPath: options.docPath,
        sectionsChecked: sections.length,
        issues: validationResult.issues
    };
}
