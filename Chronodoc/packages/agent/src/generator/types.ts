import type { ToolDefinition } from "../llm/types.js";

export interface DocumentSection {
    id: string;
    title: string;
    content: string;
    references: string[];
    status: "generated" | "revised" | "approved" | "unapproved";
}

export interface GeneratedDocument {
    id: string;
    title: string;
    style: string;
    sections: DocumentSection[];
    rawMarkdown: string;
    generatedAt: string;
}

export interface GeneratorOptions {
    style?: "api-reference" | "architecture-overview" | "developer-guide";
    tools?: ToolDefinition[];
    toolExecutor?: (name: string, args: Record<string, any>) => Promise<string>;
}

export interface ReviseSectionOptions {
    sectionId: string;
    currentContent: string;
    issueFeedback: string;
    targetFile: string;
}
