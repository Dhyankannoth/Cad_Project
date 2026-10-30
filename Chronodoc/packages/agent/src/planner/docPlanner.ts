import path from "node:path";
import type { RepositoryScanIndex } from "../scanner/astExtractor.js";
import type {
    DocumentationPlan,
    PlannedDocument,
    SkippedDocument,
    DatabaseDetection,
    ApiDetection
} from "./types.js";

export class DocPlanner {
    public async createPlan(params: {
        rootDir: string;
        scanIndex: RepositoryScanIndex;
        packageJson?: any;
    }): Promise<DocumentationPlan> {
        const { rootDir, scanIndex, packageJson } = params;

        const projectName = packageJson?.name ?? path.basename(path.resolve(rootDir)) ?? "Software Project";
        const description = packageJson?.description ?? "Technical documentation for repository codebase.";
        const scripts = packageJson?.scripts ?? {};
        const allDeps = {
            ...(packageJson?.dependencies ?? {}),
            ...(packageJson?.devDependencies ?? {})
        };

        // 1. Tech Stack Detection
        const techStack = this.detectTechStack(scanIndex, allDeps);

        // 2. Test Framework Detection
        const testFramework = this.detectTestFramework(scripts, allDeps);

        // 3. Database Detection
        const database = this.detectDatabase(scanIndex, allDeps);

        // 4. API Detection
        const api = this.detectApi(scanIndex, allDeps);

        // 5. Environment Variables Detection
        const envVariables = this.detectEnvVariables(scanIndex);

        // 6. Plan Documents
        const plannedDocuments: PlannedDocument[] = [];
        const skippedDocuments: SkippedDocument[] = [];

        // Main README (Always planned)
        plannedDocuments.push({
            id: "readme",
            relPath: "README.md",
            title: `${projectName} Documentation`,
            type: "readme",
            description: "Main documentation entry point with system overview, architecture introduction, and table of contents.",
            relevantFiles: scanIndex.files.slice(0, 10),
            relevantSymbols: Array.from(scanIndex.symbols.keys()).slice(0, 15),
            priority: 1
        });

        // Getting Started
        plannedDocuments.push({
            id: "getting-started",
            relPath: "getting-started.md",
            title: "Getting Started",
            type: "getting-started",
            description: "Prerequisites, installation, configuration, running the application, and test commands.",
            relevantFiles: scanIndex.files.filter(f => /package\.json|\.env|config/i.test(f)),
            relevantSymbols: [],
            priority: 2
        });

        // Architecture Overview
        plannedDocuments.push({
            id: "architecture-overview",
            relPath: "architecture/overview.md",
            title: "Architecture Overview",
            type: "architecture-overview",
            description: "System topology, architectural organization, component relationships, and Mermaid flowchart.",
            relevantFiles: scanIndex.files,
            relevantSymbols: Array.from(scanIndex.symbols.keys()),
            priority: 3
        });

        // Components Reference
        plannedDocuments.push({
            id: "components",
            relPath: "architecture/components.md",
            title: "Component Architecture",
            type: "components",
            description: "Key architectural components, their responsibilities, exported symbols, and verified dependencies.",
            relevantFiles: scanIndex.files,
            relevantSymbols: Array.from(scanIndex.symbols.keys()),
            priority: 4
        });

        // Data Flow
        plannedDocuments.push({
            id: "data-flow",
            relPath: "architecture/data-flow.md",
            title: "Data Flow & Workflows",
            type: "data-flow",
            description: "Critical execution paths, request handling, and component interaction sequences with Mermaid diagrams.",
            relevantFiles: scanIndex.files,
            relevantSymbols: Array.from(scanIndex.symbols.keys()),
            priority: 5
        });

        // Guides: Development
        plannedDocuments.push({
            id: "guides-development",
            relPath: "guides/development.md",
            title: "Development Guide",
            type: "guides-development",
            description: "Development workflow, build commands, linting, formatting, and codebase conventions.",
            relevantFiles: scanIndex.files.filter(f => /package\.json|tsconfig|\.git/i.test(f)),
            relevantSymbols: [],
            priority: 6
        });

        // Guides: Testing
        plannedDocuments.push({
            id: "guides-testing",
            relPath: "guides/testing.md",
            title: "Testing Guide",
            type: "guides-testing",
            description: "Testing methodology, framework setup, test locations, and execution instructions.",
            relevantFiles: scanIndex.files.filter(f => /test|spec/i.test(f)),
            relevantSymbols: [],
            priority: 7
        });

        // Guides: Configuration
        plannedDocuments.push({
            id: "guides-configuration",
            relPath: "guides/configuration.md",
            title: "Configuration Reference",
            type: "guides-configuration",
            description: "Environment variables, configuration parameters, and runtime settings.",
            relevantFiles: scanIndex.files.filter(f => /env|config/i.test(f)),
            relevantSymbols: [],
            priority: 8
        });

        // Reference: Dependencies
        if (Object.keys(allDeps).length > 0) {
            plannedDocuments.push({
                id: "reference-dependencies",
                relPath: "reference/dependencies.md",
                title: "Dependencies Reference",
                type: "reference-dependencies",
                description: "Verified runtime and development dependencies, their roles, and ecosystem integration.",
                relevantFiles: ["package.json"],
                relevantSymbols: [],
                priority: 9
            });
        }

        // Conditional: API Reference
        if (api.detected) {
            plannedDocuments.push({
                id: "reference-api",
                relPath: "reference/api.md",
                title: "API Reference",
                type: "reference-api",
                description: "Discovered HTTP endpoints, routing definitions, request/response models, and public interfaces.",
                relevantFiles: scanIndex.files.filter(f => /route|api|controller|endpoint/i.test(f)),
                relevantSymbols: api.interfaces,
                priority: 10
            });
        } else {
            skippedDocuments.push({
                id: "reference-api",
                relPath: "reference/api.md",
                reason: "No HTTP routes, REST endpoints, or server handlers detected in codebase."
            });
        }

        // Conditional: Database Reference
        if (database.detected) {
            plannedDocuments.push({
                id: "reference-database",
                relPath: "reference/database.md",
                title: "Database & Data Model Reference",
                type: "reference-database",
                description: "Persistence technology, data models, entity relationships, and schema definitions.",
                relevantFiles: scanIndex.files.filter(f => /schema|prisma|model|migration|entity/i.test(f)),
                relevantSymbols: database.models,
                priority: 11
            });
        } else {
            skippedDocuments.push({
                id: "reference-database",
                relPath: "reference/database.md",
                reason: "No database schemas, ORM models, migrations, or database client dependencies detected in codebase."
            });
        }

        return {
            projectName,
            description,
            techStack,
            testFramework,
            database,
            api,
            plannedDocuments,
            skippedDocuments,
            detectedScripts: scripts,
            envVariables
        };
    }

    private detectTechStack(scanIndex: RepositoryScanIndex, deps: Record<string, string>): string[] {
        const stack = new Set<string>();

        const hasTs = scanIndex.files.some(f => f.endsWith(".ts") || f.endsWith(".tsx")) || "typescript" in deps;
        if (hasTs) stack.add("TypeScript");

        const hasJs = scanIndex.files.some(f => f.endsWith(".js") || f.endsWith(".jsx") || f.endsWith(".mjs"));
        if (hasJs || !hasTs) stack.add("JavaScript");

        stack.add("Node.js");

        if ("express" in deps) stack.add("Express");
        if ("fastify" in deps) stack.add("Fastify");
        if ("koa" in deps) stack.add("Koa");
        if ("@nestjs/core" in deps) stack.add("NestJS");
        if ("react" in deps) stack.add("React");
        if ("vue" in deps) stack.add("Vue");
        if ("next" in deps) stack.add("Next.js");
        if ("commander" in deps) stack.add("Commander CLI");
        if ("@clack/prompts" in deps) stack.add("Clack Prompts");
        if ("prisma" in deps || "@prisma/client" in deps) stack.add("Prisma ORM");
        if ("typeorm" in deps) stack.add("TypeORM");
        if ("mongoose" in deps) stack.add("Mongoose");

        return Array.from(stack);
    }

    private detectTestFramework(scripts: Record<string, string>, deps: Record<string, string>): string | null {
        if ("vitest" in deps || Object.values(scripts).some(s => s.includes("vitest"))) {
            return "Vitest";
        }
        if ("jest" in deps || Object.values(scripts).some(s => s.includes("jest"))) {
            return "Jest";
        }
        if ("mocha" in deps || Object.values(scripts).some(s => s.includes("mocha"))) {
            return "Mocha";
        }
        if (Object.values(scripts).some(s => s.includes("--test"))) {
            return "tsx/node:test";
        }
        return null;
    }

    private detectDatabase(scanIndex: RepositoryScanIndex, deps: Record<string, string>): DatabaseDetection {
        const dbDeps = ["prisma", "@prisma/client", "typeorm", "mongoose", "sequelize", "knex", "pg", "mysql2", "sqlite3", "better-sqlite3"];
        const foundDep = dbDeps.find(d => d in deps);

        const hasDbFiles = scanIndex.files.some(f =>
            /schema\.prisma|\.sql|migrations?\/|models?\/|entities\//i.test(f)
        );

        const models: string[] = [];
        for (const [name, symVal] of scanIndex.symbols) {
            const symList = Array.isArray(symVal) ? symVal : [symVal];
            for (const sym of symList) {
                const fPath = sym.filePath ?? (sym as any).file ?? "";
                if (/model|entity|schema|table/i.test(name) || /models?\/|entities\//i.test(fPath)) {
                    models.push(name);
                    break;
                }
            }
        }

        const detected = Boolean(foundDep || hasDbFiles || models.length > 0);
        let technology: string | undefined;
        if (foundDep?.includes("prisma") || scanIndex.files.some(f => f.endsWith(".prisma"))) {
            technology = "Prisma ORM";
        } else if (foundDep?.includes("typeorm")) {
            technology = "TypeORM";
        } else if (foundDep?.includes("mongoose")) {
            technology = "MongoDB (Mongoose)";
        } else if (foundDep) {
            technology = foundDep;
        }

        return {
            detected,
            technology,
            models
        };
    }

    private detectApi(scanIndex: RepositoryScanIndex, deps: Record<string, string>): ApiDetection {
        const apiDeps = ["express", "fastify", "koa", "@nestjs/core", "hono"];
        const hasApiDep = apiDeps.some(d => d in deps);

        const hasApiFiles = scanIndex.files.some(f =>
            /routes?\/|controllers?\/|endpoints?\/|api\//i.test(f)
        );

        const interfaces: string[] = [];
        for (const [name, symVal] of scanIndex.symbols) {
            const symList = Array.isArray(symVal) ? symVal : [symVal];
            for (const sym of symList) {
                const fPath = sym.filePath ?? (sym as any).file ?? "";
                if (sym.exported && (/route|controller|handler|endpoint|api/i.test(name) || /routes?\/|controllers?\/|api\//i.test(fPath))) {
                    interfaces.push(name);
                    break;
                }
            }
        }

        return {
            detected: hasApiDep || hasApiFiles || interfaces.length > 0,
            endpointsCount: interfaces.length,
            interfaces
        };
    }

    private detectEnvVariables(scanIndex: RepositoryScanIndex): string[] {
        // Collect recognized environment variable patterns
        const vars = new Set<string>();
        for (const f of scanIndex.files) {
            if (/\.env/i.test(f)) {
                vars.add("PORT");
                vars.add("NODE_ENV");
            }
        }
        return Array.from(vars);
    }
}
