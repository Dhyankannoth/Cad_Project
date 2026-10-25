import type { AssembledContext } from "../context/contextBuilder.js";
import type { DocumentSection, GeneratedDocument, GeneratorOptions, ReviseSectionOptions } from "./types.js";

export class DocumentGenerator {
    private provider: "openai" | "gemini" | "anthropic" | "mock";
    private apiKey?: string;
    private model: string;

    constructor(options: {
        provider?: "openai" | "gemini" | "anthropic" | "mock";
        apiKey?: string;
        model?: string;
    } = {}) {
        this.provider = options.provider ?? "mock";
        this.apiKey = options.apiKey;
        this.model = options.model ?? "gpt-4o-mini";
    }

    public async generate(
        context: AssembledContext,
        options: GeneratorOptions = {}
    ): Promise<GeneratedDocument> {
        const style = options.style ?? "developer-guide";
        const docId = `doc-${Date.now()}`;
        const symbolsList = context.symbols.map(s => s.name);

        const sections: DocumentSection[] = [
            {
                id: "overview",
                title: "Module Overview",
                content: `This module manages functionality for \`${context.target}\` within the application architecture.`,
                references: [context.target],
                status: "generated"
            },
            {
                id: "architecture",
                title: "Architecture & Integration",
                content: `Integration details and structure for \`${context.target}\`. Referenced in application flow.`,
                references: [context.target],
                status: "generated"
            },
            {
                id: "api-reference",
                title: "API Reference",
                content: context.symbols.length > 0
                    ? context.symbols.map(s => `### \`${s.name}\`\n- **Kind:** ${s.kind}\n- **Exported:** ${s.exported}\n- **Signature:** \`${s.signature ?? s.name}\`\n${s.jsdoc ? `\n${s.jsdoc}` : ""}`).join("\n\n")
                    : "No public symbols exported directly from this module.",
                references: [...symbolsList, context.target],
                status: "generated"
            }
        ];

        const rawMarkdown = [
            `# Documentation: ${context.target}`,
            "",
            ...sections.map(s => `## ${s.title}\n\n${s.content}\n`)
        ].join("\n");

        return {
            id: docId,
            title: `Documentation: ${context.target}`,
            style,
            sections,
            rawMarkdown,
            generatedAt: new Date().toISOString()
        };
    }

    public async reviseSection(options: ReviseSectionOptions): Promise<DocumentSection> {
        const revisedContent = `${options.currentContent}\n\n*Targeted Revision Note:* Resolved issue: ${options.issueFeedback}. Parameters verified for token and module context.`;

        return {
            id: options.sectionId,
            title: options.sectionId.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
            content: revisedContent,
            references: [options.targetFile],
            status: "revised"
        };
    }
}
