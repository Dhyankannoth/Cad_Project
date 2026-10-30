import type { RepositoryScanIndex } from "../scanner/astExtractor.js";

export type DocumentType =
    | "readme"
    | "getting-started"
    | "architecture-overview"
    | "components"
    | "data-flow"
    | "guides-development"
    | "guides-testing"
    | "guides-configuration"
    | "reference-api"
    | "reference-database"
    | "reference-dependencies";

export interface PlannedDocument {
    id: string;
    relPath: string;
    title: string;
    type: DocumentType;
    description: string;
    relevantFiles: string[];
    relevantSymbols: string[];
    priority: number;
}

export interface SkippedDocument {
    id: string;
    relPath: string;
    reason: string;
}

export interface DatabaseDetection {
    detected: boolean;
    technology?: string;
    models: string[];
}

export interface ApiDetection {
    detected: boolean;
    endpointsCount: number;
    interfaces: string[];
}

export interface DocumentationPlan {
    projectName: string;
    description: string;
    techStack: string[];
    testFramework: string | null;
    database: DatabaseDetection;
    api: ApiDetection;
    plannedDocuments: PlannedDocument[];
    skippedDocuments: SkippedDocument[];
    detectedScripts: Record<string, string>;
    envVariables: string[];
}
