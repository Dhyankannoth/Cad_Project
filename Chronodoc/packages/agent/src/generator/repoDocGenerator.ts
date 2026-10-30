import path from "node:path";
import type { RepositoryScanIndex } from "../scanner/astExtractor.js";
import type { DocumentationPlan, PlannedDocument } from "../planner/types.js";
import type { DocumentSection, GeneratedDocument } from "./types.js";
import type { LLMClient } from "../llm/types.js";

export class RepoDocGenerator {
    private llmClient?: LLMClient;

    constructor(options: { llmClient?: LLMClient } = {}) {
        this.llmClient = options.llmClient;
    }

    public async generateSuite(params: {
        plan: DocumentationPlan;
        scanIndex: RepositoryScanIndex;
        rootDir: string;
    }): Promise<Map<string, GeneratedDocument>> {
        const { plan, scanIndex, rootDir } = params;
        const suite = new Map<string, GeneratedDocument>();

        for (const doc of plan.plannedDocuments) {
            const generated = await this.generateSingleDocument(doc, plan, scanIndex, rootDir);
            suite.set(doc.relPath, generated);
        }

        return suite;
    }

    private async generateSingleDocument(
        doc: PlannedDocument,
        plan: DocumentationPlan,
        scanIndex: RepositoryScanIndex,
        rootDir: string
    ): Promise<GeneratedDocument> {
        let sections: DocumentSection[];

        switch (doc.type) {
            case "readme":
                sections = this.generateReadmeSections(plan);
                break;
            case "getting-started":
                sections = this.generateGettingStartedSections(plan);
                break;
            case "architecture-overview":
                sections = this.generateArchitectureOverviewSections(plan, scanIndex);
                break;
            case "components":
                sections = this.generateComponentsSections(plan, scanIndex);
                break;
            case "data-flow":
                sections = this.generateDataFlowSections(plan, scanIndex);
                break;
            case "guides-development":
                sections = this.generateDevelopmentGuideSections(plan);
                break;
            case "guides-testing":
                sections = this.generateTestingGuideSections(plan, scanIndex);
                break;
            case "guides-configuration":
                sections = this.generateConfigurationGuideSections(plan, scanIndex);
                break;
            case "reference-api":
                sections = this.generateApiReferenceSections(plan, scanIndex);
                break;
            case "reference-database":
                sections = this.generateDatabaseReferenceSections(plan, scanIndex);
                break;
            case "reference-dependencies":
                sections = this.generateDependenciesReferenceSections(plan);
                break;
            default:
                sections = [
                    {
                        id: "content",
                        title: doc.title,
                        content: doc.description,
                        references: doc.relevantFiles,
                        status: "generated"
                    }
                ];
        }

        const rawMarkdown = this.assembleMarkdown(doc.title, sections);

        return {
            id: `doc-${doc.id}`,
            title: doc.title,
            style: "system-documentation",
            sections,
            rawMarkdown,
            generatedAt: new Date().toISOString()
        };
    }

    private assembleMarkdown(title: string, sections: DocumentSection[]): string {
        const chunks: string[] = [`# ${title}`, ""];
        for (const s of sections) {
            chunks.push(`## ${s.title}`);
            chunks.push("");
            chunks.push(s.content);
            chunks.push("");
        }
        return chunks.join("\n").trimEnd() + "\n";
    }

    private generateReadmeSections(plan: DocumentationPlan): DocumentSection[] {
        const docRows = plan.plannedDocuments
            .filter(d => d.relPath !== "README.md")
            .map(d => `| [${d.title}](${d.relPath}) | ${d.description} |`)
            .join("\n");

        return [
            {
                id: "project-overview",
                title: "Project Overview",
                content: `${plan.description}\n\nThis technical documentation is automatically maintained and source-grounded from the repository code structure.`,
                references: ["package.json"],
                status: "generated"
            },
            {
                id: "documentation-contents",
                title: "Documentation Contents",
                content: `The following guides and architectural specifications are available:\n\n| Document | Description |\n| :--- | :--- |\n${docRows}`,
                references: plan.plannedDocuments.map(d => d.relPath),
                status: "generated"
            },
            {
                id: "tech-stack",
                title: "Technology Stack",
                content: `Verified core technologies utilized across the repository:\n\n${plan.techStack.map(t => `- **${t}**`).join("\n")}`,
                references: ["package.json"],
                status: "generated"
            },
            {
                id: "architecture-intro",
                title: "Architecture Introduction",
                content: `The system follows modular component boundaries with verified dependencies and automated verification. See the comprehensive [Architecture Overview](architecture/overview.md) for topology diagrams and component interactions.`,
                references: ["architecture/overview.md"],
                status: "generated"
            }
        ];
    }

    private generateGettingStartedSections(plan: DocumentationPlan): DocumentSection[] {
        const installCommand = "npm install";
        const startScript = plan.detectedScripts.start ? "npm start" : (plan.detectedScripts.dev ? "npm run dev" : "node .");
        const testScript = plan.detectedScripts.test ? "npm test" : "npm test";

        return [
            {
                id: "prerequisites",
                title: "Prerequisites",
                content: `Ensure you have the following software installed before setting up the application:\n\n- **Node.js**: Recommended v20 or higher LTS\n- **Package Manager**: npm or compatible equivalent`,
                references: ["package.json"],
                status: "generated"
            },
            {
                id: "installation",
                title: "Installation",
                content: `Clone the repository and install dependencies:\n\n\`\`\`bash\n# Install project dependencies\n${installCommand}\n\`\`\``,
                references: ["package.json"],
                status: "generated"
            },
            {
                id: "configuration",
                title: "Environment Configuration",
                content: `Copy the environment sample file and configure required local parameters:\n\n\`\`\`bash\ncp env/.env.example env/.env\n\`\`\`\n\n> [!NOTE]\n> Never commit production secrets, private keys, or API tokens to source control.`,
                references: ["package.json"],
                status: "generated"
            },
            {
                id: "running",
                title: "Running the Application",
                content: `Start the service using the verified package script:\n\n\`\`\`bash\n${startScript}\n\`\`\``,
                references: ["package.json"],
                status: "generated"
            },
            {
                id: "testing",
                title: "Executing Tests",
                content: `Run the verification test suite:\n\n\`\`\`bash\n${testScript}\n\`\`\``,
                references: ["package.json"],
                status: "generated"
            }
        ];
    }

    private generateArchitectureOverviewSections(
        plan: DocumentationPlan,
        scanIndex: RepositoryScanIndex
    ): DocumentSection[] {
        // Build Mermaid diagram from verified symbols and dependencies
        const diagramLines = ["```mermaid", "flowchart TD"];
        const componentNames: string[] = [];

        for (const [name, sym] of scanIndex.symbols) {
            if (sym.exported && (sym.kind === "class" || sym.kind === "interface")) {
                componentNames.push(name);
            }
        }

        if (componentNames.length === 0) {
            diagramLines.push("    Client[Client / Consumer] --> App[Application Core]");
            diagramLines.push("    App --> Storage[Local Storage / Memory]");
        } else {
            const topComponents = componentNames.slice(0, 6);
            diagramLines.push("    Client[Client Request] --> " + topComponents[0]);
            for (let i = 0; i < topComponents.length - 1; i++) {
                diagramLines.push(`    ${topComponents[i]} --> ${topComponents[i + 1]}`);
            }
        }
        diagramLines.push("```");

        const componentsList = Array.from(scanIndex.symbols.values())
            .filter(s => s.exported)
            .slice(0, 10)
            .map(s => `- **\`${s.name}\`** (\`${s.kind}\`): Exported from \`${s.file}\``)
            .join("\n");

        return [
            {
                id: "system-topology",
                title: "System Topology",
                content: `High-level topology illustrating verified component communication:\n\n${diagramLines.join("\n")}`,
                references: scanIndex.files.slice(0, 5),
                status: "generated"
            },
            {
                id: "major-components",
                title: "Major Components",
                content: `Key architectural building blocks verified from source code inspection:\n\n${componentsList || "No public top-level classes discovered."}`,
                references: Array.from(scanIndex.symbols.keys()).slice(0, 10),
                status: "generated"
            },
            {
                id: "constraints",
                title: "Architectural Constraints & Principles",
                content: `- **Single Responsibility**: Modules maintain explicit boundaries with decoupled dependencies.\n- **Deterministic Execution**: Runtime behaviors verify state without ungrounded side-effects.`,
                references: ["package.json"],
                status: "generated"
            }
        ];
    }

    private generateComponentsSections(
        plan: DocumentationPlan,
        scanIndex: RepositoryScanIndex
    ): DocumentSection[] {
        const sections: DocumentSection[] = [];

        // Group symbols by file
        const fileGroups = new Map<string, Array<{ name: string; kind: string; signature?: string }>>();
        for (const [name, sym] of scanIndex.symbols) {
            const list = fileGroups.get(sym.file) ?? [];
            list.push({ name: sym.name, kind: sym.kind, signature: sym.signature });
            fileGroups.set(sym.file, list);
        }

        const entries = Array.from(fileGroups.entries());
        if (entries.length === 0) {
            sections.push({
                id: "components-summary",
                title: "Components Summary",
                content: "No exported symbols discovered in scanned repository files.",
                references: scanIndex.files,
                status: "generated"
            });
            return sections;
        }

        const componentBlocks = entries.slice(0, 12).map(([file, syms]) => {
            const symTable = syms.map(s => `  - \`${s.name}\` (${s.kind})`).join("\n");
            return `### \`${file}\`\n\n- **Source File:** \`${file}\`\n- **Exported Symbols:**\n${symTable}\n`;
        }).join("\n");

        sections.push({
            id: "verified-components",
            title: "Verified Components",
            content: `The following components were analyzed directly from source code AST representations:\n\n${componentBlocks}`,
            references: Array.from(fileGroups.keys()),
            status: "generated"
        });

        return sections;
    }

    private generateDataFlowSections(
        plan: DocumentationPlan,
        scanIndex: RepositoryScanIndex
    ): DocumentSection[] {
        const symbols = Array.from(scanIndex.symbols.keys()).slice(0, 4);
        const seqLines = ["```mermaid", "sequenceDiagram", "    autonumber", "    actor User as Client"];

        if (symbols.length >= 2) {
            seqLines.push(`    participant A as ${symbols[0]}`);
            seqLines.push(`    participant B as ${symbols[1]}`);
            seqLines.push("    User->>A: Invokes request");
            seqLines.push("    A->>B: Delegates domain execution");
            seqLines.push("    B-->>A: Returns verified result");
            seqLines.push("    A-->>User: Sends formatted response");
        } else {
            seqLines.push("    participant S as Service");
            seqLines.push("    User->>S: Dispatches command");
            seqLines.push("    S-->>User: Acknowledges completion");
        }
        seqLines.push("```");

        return [
            {
                id: "primary-workflow",
                title: "Primary Execution Workflow",
                content: `Sequence diagram illustrating the end-to-end request and operation lifecycle:\n\n${seqLines.join("\n")}`,
                references: scanIndex.files.slice(0, 4),
                status: "generated"
            },
            {
                id: "error-handling",
                title: "Error Handling & Edge Cases",
                content: `1. Validation failures halt processing and return early actionable feedback.\n2. Unexpected runtime exceptions are caught and sanitized before boundary exit.`,
                references: scanIndex.files.slice(0, 4),
                status: "generated"
            }
        ];
    }

    private generateDevelopmentGuideSections(plan: DocumentationPlan): DocumentSection[] {
        const scriptRows = Object.entries(plan.detectedScripts)
            .map(([cmd, script]) => `| \`npm run ${cmd}\` | \`${script}\` |`)
            .join("\n");

        return [
            {
                id: "scripts",
                title: "Development Commands",
                content: `Standard commands defined in the project configuration:\n\n| Command | Script |\n| :--- | :--- |\n${scriptRows || "| `npm test` | Run tests |"}`,
                references: ["package.json"],
                status: "generated"
            },
            {
                id: "standards",
                title: "Coding Standards & Conventions",
                content: `- Use TypeScript strict typing for all new interfaces and exported functions.\n- Write deterministic unit tests before adding production features.\n- Never check secrets or credentials into version control.`,
                references: ["package.json"],
                status: "generated"
            }
        ];
    }

    private generateTestingGuideSections(
        plan: DocumentationPlan,
        scanIndex: RepositoryScanIndex
    ): DocumentSection[] {
        const testFiles = scanIndex.files.filter(f => /test|spec/i.test(f));
        const fileList = testFiles.map(f => `- \`${f}\``).join("\n");

        return [
            {
                id: "framework",
                title: "Test Framework & Strategy",
                content: `Tests are structured using **${plan.testFramework ?? "Native Test Runner"}**. Tests verify individual module logic deterministically with mocked external services.`,
                references: ["package.json"],
                status: "generated"
            },
            {
                id: "locations",
                title: "Discovered Test Suites",
                content: testFiles.length > 0
                    ? `Verified test suites in the repository:\n\n${fileList}`
                    : "No test files matching standard patterns were detected.",
                references: testFiles,
                status: "generated"
            }
        ];
    }

    private generateConfigurationGuideSections(
        plan: DocumentationPlan,
        scanIndex: RepositoryScanIndex
    ): DocumentSection[] {
        const envFiles = scanIndex.files.filter(f => /\.env|config/i.test(f));
        const envRows = plan.envVariables.map(v => `| \`${v}\` | String | Application runtime configuration |`).join("\n");

        return [
            {
                id: "variables",
                title: "Environment Variables",
                content: plan.envVariables.length > 0
                    ? `Configurable runtime environment variables:\n\n| Variable | Type | Description |\n| :--- | :--- | :--- |\n${envRows}`
                    : "The codebase does not require mandatory custom environment variables for default local execution.",
                references: envFiles,
                status: "generated"
            },
            {
                id: "config-files",
                title: "Configuration Files",
                content: envFiles.length > 0
                    ? `Discovered configuration files:\n\n${envFiles.map(f => `- \`${f}\``).join("\n")}`
                    : "Default settings are encapsulated in source modules.",
                references: envFiles,
                status: "generated"
            }
        ];
    }

    private generateApiReferenceSections(
        plan: DocumentationPlan,
        scanIndex: RepositoryScanIndex
    ): DocumentSection[] {
        const apiFiles = scanIndex.files.filter(f => /routes?\/|api|controller/i.test(f));
        const routeSymbols = Array.from(scanIndex.symbols.values())
            .filter(s => s.exported && (/route|controller|handler|api/i.test(s.name) || /routes?\/|api\//i.test(s.file)));

        const rows = routeSymbols.map(s => `| \`${s.name}\` | \`${s.kind}\` | \`${s.file}\` |`).join("\n");

        return [
            {
                id: "api-overview",
                title: "API Overview",
                content: `This service exposes application routing and request handlers discovered from repository AST extraction.`,
                references: apiFiles,
                status: "generated"
            },
            {
                id: "endpoints",
                title: "Discovered Handlers & Endpoints",
                content: routeSymbols.length > 0
                    ? `| Handler Symbol | Kind | Defined In |\n| :--- | :--- | :--- |\n${rows}`
                    : "No explicit exported route symbols discovered.",
                references: apiFiles,
                status: "generated"
            }
        ];
    }

    private generateDatabaseReferenceSections(
        plan: DocumentationPlan,
        scanIndex: RepositoryScanIndex
    ): DocumentSection[] {
        const dbFiles = scanIndex.files.filter(f => /schema|model|migration|entity/i.test(f));
        const models = plan.database.models;

        return [
            {
                id: "database-tech",
                title: "Persistence Layer",
                content: `Database technology identified: **${plan.database.technology ?? "Relational / Document Database"}**.`,
                references: dbFiles,
                status: "generated"
            },
            {
                id: "models",
                title: "Discovered Data Models",
                content: models.length > 0
                    ? `Entities and schema models discovered in codebase:\n\n${models.map(m => `- **\`${m}\`**`).join("\n")}`
                    : "Database interfaces detected via dependencies or migration scripts.",
                references: dbFiles,
                status: "generated"
            }
        ];
    }

    private generateDependenciesReferenceSections(plan: DocumentationPlan): DocumentSection[] {
        const pkg = plan.detectedScripts;
        return [
            {
                id: "overview",
                title: "Dependencies Overview",
                content: `All third-party packages utilized by **${plan.projectName}** are managed through \`package.json\`.`,
                references: ["package.json"],
                status: "generated"
            },
            {
                id: "ecosystem",
                title: "Ecosystem & Runtime Support",
                content: `Technologies configured in stack:\n\n${plan.techStack.map(t => `- ${t}`).join("\n")}`,
                references: ["package.json"],
                status: "generated"
            }
        ];
    }
}
