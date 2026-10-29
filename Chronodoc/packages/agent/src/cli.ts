#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { scanRepository } from "./scanner/scanRepository.js";
import { PipelineOrchestrator } from "./orchestrator/pipelineOrchestrator.js";
import { loadConfig } from "./config/env.js";

// Auto-discover local env file if present
function tryLoadEnv() {
    const candidates = [
        path.resolve(process.cwd(), "env/.env"),
        path.resolve(process.cwd(), ".env"),
        path.resolve(process.cwd(), "../../env/.env")
    ];

    for (const envPath of candidates) {
        if (fs.existsSync(envPath)) {
            try {
                const content = fs.readFileSync(envPath, "utf-8");
                for (const line of content.split("\n")) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith("#")) continue;
                    const eqIdx = trimmed.indexOf("=");
                    if (eqIdx !== -1) {
                        const key = trimmed.slice(0, eqIdx).trim();
                        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
                        if (!process.env[key]) {
                            process.env[key] = val;
                        }
                    }
                }
                break;
            } catch {
                // ignore
            }
        }
    }
}

tryLoadEnv();

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === "--help" || command === "-h") {
        console.log(`
Chronodoc AI Agent CLI
Usage:
  chronodoc-agent scan [directory]
  chronodoc-agent generate <file> [--root <dir>] [--style <style>] [--provider <provider>] [--out <dir>]
  chronodoc-agent --version

Examples:
  npx @chronodoc/agent scan .
  npx @chronodoc/agent generate src/index.ts --out docs/generated
        `);
        process.exit(0);
    }

    if (command === "--version" || command === "-v") {
        console.log("1.0.0");
        process.exit(0);
    }

    if (command === "scan") {
        const rootDir = args[1] || ".";
        console.log(`Scanning repository at: ${rootDir}...`);
        const result = await scanRepository(rootDir);
        console.log(`Discovered ${result.files.length} supported files.`);
        if (result.warnings.length > 0) {
            console.warn(`Warnings encountered:`, result.warnings);
        }
        process.exit(result.complete ? 0 : 1);
    }

    if (command === "generate") {
        const targetFile = args[1];
        if (!targetFile || targetFile.startsWith("--")) {
            console.error("Error: target file required. Example: chronodoc-agent generate src/app.ts");
            process.exit(1);
        }

        // Parse optional CLI flags
        let rootDir = ".";
        let outDir: string | undefined = undefined;
        let provider: "openai" | "gemini" | "anthropic" | "mock" | undefined = undefined;
        let style: "api-reference" | "architecture-overview" | "developer-guide" | undefined = undefined;

        for (let i = 2; i < args.length; i++) {
            if (args[i] === "--root" && args[i + 1]) rootDir = args[++i];
            if (args[i] === "--out" && args[i + 1]) outDir = args[++i];
            if (args[i] === "--provider" && args[i + 1]) provider = args[++i] as any;
            if (args[i] === "--style" && args[i + 1]) style = args[++i] as any;
        }

        const config = loadConfig(provider ? { llmProvider: provider } : {});
        const activeApiKey = config.llmProvider === "gemini" 
            ? config.geminiApiKey 
            : (config.llmProvider === "openai" ? config.openaiApiKey : undefined);

        const orchestrator = new PipelineOrchestrator({
            provider: config.llmProvider,
            apiKey: activeApiKey,
            model: config.llmModel,
            tokenBudget: config.tokenBudget,
            maxRevisionAttempts: config.maxRevisionAttempts
        });

        console.log(`Generating documentation for ${targetFile} [Provider: ${config.llmProvider}]...`);
        const result = await orchestrator.execute({
            target: targetFile,
            rootDir,
            style,
            outDir
        });

        console.log(`\nPipeline status: ${result.status.toUpperCase()}`);
        console.log(`Revision attempts: ${result.revisionAttempts}`);
        if (result.savedFilePath) {
            console.log(`Documentation saved to: ${result.savedFilePath}`);
        }
        console.log(`\nGenerated Output:\n-------------------\n`);
        console.log(result.document.rawMarkdown);

        if (result.status === "unapproved" && result.unresolvedIssues) {
            console.warn("\nUnresolved Issues:");
            result.unresolvedIssues.forEach(i => console.warn(`- [${i.sectionId}] ${i.type}: ${i.message}`));
        }

        process.exit(result.status === "validated" ? 0 : 2);
    }

    console.error(`Unknown command: ${command}. Run "chronodoc-agent --help" for options.`);
    process.exit(1);
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
