import type { GeneratedDocument, DocumentSection } from "../generator/types.js";
import type { ValidationResult } from "../validator/types.js";
import { DocumentGenerator } from "../generator/documentGenerator.js";

export class RevisionAgent {
    private generator: DocumentGenerator;

    constructor(generator: DocumentGenerator) {
        this.generator = generator;
    }

    public async revise(
        document: GeneratedDocument,
        validation: ValidationResult,
        targetFile: string
    ): Promise<GeneratedDocument> {
        const affectedSet = new Set(validation.affectedSectionIds);
        const issuesBySection = new Map<string, string[]>();

        for (const issue of validation.issues) {
            const list = issuesBySection.get(issue.sectionId) ?? [];
            list.push(`${issue.type}: ${issue.message}`);
            issuesBySection.set(issue.sectionId, list);
        }

        const revisedSections: DocumentSection[] = [];

        for (const section of document.sections) {
            if (affectedSet.has(section.id)) {
                const feedback = issuesBySection.get(section.id)?.join("; ") ?? "Validation error";
                const revised = await this.generator.reviseSection({
                    sectionId: section.id,
                    currentContent: section.content,
                    issueFeedback: feedback,
                    targetFile
                });
                revisedSections.push(revised);
            } else {
                // Preserve unaffected sections exactly as they were
                revisedSections.push(section);
            }
        }

        const rawMarkdown = [
            `# ${document.title}`,
            "",
            ...revisedSections.map(s => `## ${s.title}\n\n${s.content}\n`)
        ].join("\n");

        return {
            ...document,
            sections: revisedSections,
            rawMarkdown,
        };
    }
}
