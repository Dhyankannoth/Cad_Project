import type { GeneratedDocument, DocumentSection } from "../generator/types.js";
import type { RepositoryScanIndex } from "../scanner/astExtractor.js";
import type { ValidationIssue, ValidationResult } from "./types.js";

export class DocumentValidator {
    public async validate(
        doc: GeneratedDocument,
        index: RepositoryScanIndex
    ): Promise<ValidationResult> {
        const issues: ValidationIssue[] = [];
        const affectedSections = new Set<string>();

        const knownFiles = new Set(index.files.map(f => f.replace(/\\/g, "/")));

        for (const section of doc.sections) {
            // 1. Structural checks
            if (!section.title || section.title.trim().length === 0) {
                issues.push({
                    sectionId: section.id,
                    type: "structural_violation",
                    severity: "error",
                    message: "Section title is empty"
                });
                affectedSections.add(section.id);
            }

            if (!section.content || section.content.trim().length === 0) {
                issues.push({
                    sectionId: section.id,
                    type: "structural_violation",
                    severity: "error",
                    message: "Section content is empty"
                });
                affectedSections.add(section.id);
            }

            // 2. Reference checks (Deterministic)
            for (const ref of section.references) {
                const normalizedRef = ref.replace(/\\/g, "/");
                const isPath = normalizedRef.includes("/") || /\.[a-z0-9]+$/i.test(normalizedRef);

                if (isPath) {
                    if (!knownFiles.has(normalizedRef) && !index.files.some(f => f.endsWith(normalizedRef))) {
                        issues.push({
                            sectionId: section.id,
                            type: "invalid_path",
                            severity: "error",
                            message: `Referenced file path "${ref}" does not exist in repository`,
                            evidence: ref
                        });
                        affectedSections.add(section.id);
                    }
                } else {
                    // Symbol reference
                    if (!index.symbols.has(ref)) {
                        issues.push({
                            sectionId: section.id,
                            type: "symbol_not_found",
                            severity: "error",
                            message: `Referenced code symbol "${ref}" not found in scanned AST index`,
                            evidence: ref
                        });
                        affectedSections.add(section.id);
                    }
                }
            }
        }

        return {
            passed: issues.length === 0,
            issues,
            affectedSectionIds: Array.from(affectedSections)
        };
    }
}
