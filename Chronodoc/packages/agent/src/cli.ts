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
    const firstArg = args[0];

    if (!firstArg || firstArg === "--help" || firstArg === "-h") {
        console.log(`
⚡ Chronodoc - Instant Codebase Documentation

Simple Usage:
  doc <file>                        Generate docs (saved to docs/generated/)
  doc <file> -p mock                Test offline without API key
  doc scan                          Scan files and symbols in current folder

Full Options:
  doc <file> [-o <outDir>] [-p <provider>] [-s <style>] [-r <rootDir>]

Flags:
  -o, --out       Destination directory (default: docs/generated)
  -p, --provider  LLM provider: gemini | openai | mock (default: from .env)
  -s, --style     Style: developer-guide | api-reference | architecture-overview
  -r, --root      Root directory to scan (default: .)
  -h, --help      Show help
  -v, --version   Show version

Examples:
  doc src/index.ts
  doc src/server.ts -o docs/api
  doc src/app.ts -p gemini
        `);
        process.exit(0);
    }

    if (firstArg === "--version" || firstArg === "-v") {
        console.log("1.0.0");
        process.exit(0);
    }

    if (firstArg === "scan") {
        const rootDir = args[1] || ".";
        console.log(`Scanning repository at: ${rootDir}...`);
        const result = await scanRepository(rootDir);
        console.log(`Discovered ${result.files.length} supported files.`);
        if (result.warnings.length > 0) {
            console.warn(`Warnings encountered:`, result.warnings);
        }
        process.exit(result.complete ? 0 : 1);
    }

    // Determine target file: user can type "doc generate <file>" or simply "doc <file>"
    let targetFile = firstArg === "generate" ? args[1] : firstArg;
    const startIndex = firstArg === "generate" ? 2 : 1;

    if (!targetFile || targetFile.startsWith("-")) {
        console.error("Error: target file required. Example: doc src/app.ts");
        process.exit(1);
    }

    // Default out directory to docs/generated so users don't need to specify it
    let outDir: string = "docs/generated";
    let rootDir: string = ".";
    let provider: "openai" | "gemini" | "anthropic" | "mock" | undefined = undefined;
    let style: "api-reference" | "architecture-overview" | "developer-guide" | undefined = undefined;

    for (let i = startIndex; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];

        if ((arg === "--root" || arg === "-r") && next) {
            rootDir = next;
            i++;
        } else if ((arg === "--out" || arg === "-o") && next) {
            outDir = next;
            i++;
        } else if ((arg === "--provider" || arg === "-p") && next) {
            provider = next as any;
            i++;
        } else if ((arg === "--style" || arg === "-s") && next) {
            style = next as any;
            i++;
        }
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

    console.log(`\n📄 Documenting: ${targetFile} [Provider: ${config.llmProvider}]`);
    const result = await orchestrator.execute({
        target: targetFile,
        rootDir,
        style,
        outDir
    });

    console.log(`✔ Pipeline Status: ${result.status.toUpperCase()}`);
    console.log(`✔ Revision Attempts: ${result.revisionAttempts}`);
    if (result.savedFilePath) {
        console.log(`📁 Saved to: ${result.savedFilePath}`);
    }
    console.log(`\n----------------- PREVIEW -----------------\n`);
    console.log(result.document.rawMarkdown);
    console.log(`-------------------------------------------\n`);

    if (result.status === "unapproved" && result.unresolvedIssues) {
        console.warn("\n⚠️ Unresolved Issues:");
        result.unresolvedIssues.forEach(issue => console.warn(`- [${issue.sectionId}] ${issue.type}: ${issue.message}`));
    }

    process.exit(result.status === "validated" ? 0 : 2);
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
