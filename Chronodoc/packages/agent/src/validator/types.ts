export interface ValidationIssue {
    sectionId: string;
    type: "symbol_not_found" | "invalid_path" | "structural_violation" | "semantic_inconsistency";
    severity: "error" | "warning";
    message: string;
    evidence?: string;
}

export interface ValidationResult {
    passed: boolean;
    issues: ValidationIssue[];
    affectedSectionIds: string[];
}
