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
}

export interface ReviseSectionOptions {
    sectionId: string;
    currentContent: string;
    issueFeedback: string;
    targetFile: string;
}
