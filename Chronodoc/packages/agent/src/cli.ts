#!/usr/bin/env node
import { parseArgs } from "node:util";
import { scanRepository } from "./scanner/scanRepository.js";
import { PipelineOrchestrator } from "./orchestrator/pipelineOrchestrator.js";
import { loadConfig } from "./config/env.js";

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === "--help" || command === "-h") {
        console.log(`
Chronodoc AI Agent CLI
Usage:
  chronodoc-agent scan [directory]
  chronodoc-agent generate <file> [--root <dir>] [--style <style>] [--provider <provider>]
  chronodoc-agent --version
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
        if (!targetFile) {
            console.error("Error: target file required. Example: chronodoc-agent generate src/app.ts");
            process.exit(1);
        }

        const config = loadConfig();
        const orchestrator = new PipelineOrchestrator({
            provider: config.llmProvider,
            tokenBudget: config.tokenBudget,
            maxRevisionAttempts: config.maxRevisionAttempts
        });

        console.log(`Generating documentation for ${targetFile}...`);
        const result = await orchestrator.execute({
            target: targetFile,
            rootDir: "."
        });

        console.log(`\nPipeline status: ${result.status.toUpperCase()}`);
        console.log(`Revision attempts: ${result.revisionAttempts}`);
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
