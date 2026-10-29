#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { Command } from "commander";
import { scanRepository } from "./scanner/scanRepository.js";
import { PipelineOrchestrator } from "./orchestrator/pipelineOrchestrator.js";
import { loadConfig } from "./config/env.js";
import { TerminalUI } from "./cli/ui.js";
import { executeInitCommand, executeValidateCommand } from "./cli/commands.js";
import { SUPPORTED_PROVIDERS, maskApiKey } from "./cli/prompts.js";

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

const program = new Command();

program
    .name("docagent")
    .description("Your codebase, documented.")
    .version("1.0.0");

// Global options
program
    .option("--no-color", "Disable colored terminal output")
    .option("--quiet", "Suppress non-essential messages")
    .option("--verbose", "Show detailed diagnostic output")
    .option("--json", "Output results in JSON format");

// 1. Init Command
program
    .command("init")
    .alias("configure")
    .alias("config")
    .description("Initialize DocAgent environment and configure AI provider")
    .option("-r, --root <dir>", "Project root directory", ".")
    .option("-p, --provider <provider>", "AI provider: openai | anthropic | gemini | mock")
    .option("-k, --api-key <key>", "API key for the selected provider")
    .option("-f, --force", "Overwrite existing configuration", false)
    .option("--non-interactive", "Run in non-interactive mode without prompting", false)
    .action(async (cmdOptions) => {
        const globalOpts = program.opts();
        const ui = new TerminalUI({
            noColor: !globalOpts.color,
            quiet: globalOpts.quiet || globalOpts.json,
            verbose: globalOpts.verbose
        });

        const isInteractive = Boolean(
            process.stdin.isTTY &&
            !cmdOptions.nonInteractive &&
            !globalOpts.json &&
            !cmdOptions.provider
        );

        const startTime = Date.now();

        try {
            const result = await executeInitCommand({
                rootDir: cmdOptions.root,
                interactive: isInteractive,
                provider: cmdOptions.provider,
                apiKey: cmdOptions.apiKey,
                force: cmdOptions.force
            });

            if (result.cancelled) {
                process.exit(0);
            }

            const duration = Date.now() - startTime;

            if (globalOpts.json) {
                console.log(JSON.stringify({ status: "success", result, durationMs: duration }, null, 2));
                process.exit(0);
            }

            const providerMeta = SUPPORTED_PROVIDERS.find(p => p.value === result.provider);
            const providerName = providerMeta?.label ?? result.provider ?? "Gemini";

            console.log("\n" + pc.green(pc.bold("✔ Provider configured successfully!")));
            console.log(`  ${pc.dim("Provider:")}      ${pc.bold(providerName)}`);
            console.log(`  ${pc.dim("Configuration:")} ${path.join(cmdOptions.root, "env/.env")}`);
            console.log(`  ${pc.dim("Credentials:")}   ${result.provider === "mock" ? pc.dim("(Mock mode - no API key needed)") : pc.green("(Saved securely)")}`);
            console.log("\n  " + pc.bold("Next steps:"));
            console.log(`    ${pc.cyan("→")} Run 'docagent generate <file>' to generate documentation\n`);

            process.exit(0);
        } catch (err: any) {
            if (globalOpts.json) {
                console.error(JSON.stringify({ status: "error", message: err.message }, null, 2));
                process.exit(1);
            }

            ui.printError({
                operation: "Project Configuration",
                failure: "Failed to configure provider",
                reason: err.message,
                nextAction: "Verify file permissions or run with --non-interactive"
            });
            process.exit(1);
        }
    });


// 2. Scan Command
program
    .command("scan [directory]")
    .description("Scan repository files, AST symbols, and dependencies")
    .action(async (directory = ".") => {
        const globalOpts = program.opts();
        const ui = new TerminalUI({
            noColor: !globalOpts.color,
            quiet: globalOpts.quiet || globalOpts.json,
            verbose: globalOpts.verbose
        });

        const startTime = Date.now();
        const resolvedDir = path.resolve(directory);

        if (!globalOpts.json) {
            ui.printHeader({
                project: path.basename(resolvedDir),
                output: directory
            });
            ui.startStage(`Scanning repository files in ${directory}`);
        }

        try {
            const result = await scanRepository(directory);
            const duration = Date.now() - startTime;

            if (globalOpts.json) {
                console.log(JSON.stringify({ status: "success", result, durationMs: duration }, null, 2));
                process.exit(result.complete ? 0 : 1);
            }

            ui.completeStage(`Repository scanned: ${result.files.length} supported files discovered`);

            if (result.warnings.length > 0) {
                result.warnings.forEach(w => ui.printWarning(w));
            }

            ui.printSummary({
                documentsCreated: 0,
                validationStatus: result.complete ? "Passed" : "Warnings Present",
                outputDirectory: directory,
                durationMs: duration,
                nextSteps: ["Run 'docagent generate <file>' on any discovered file"]
            });

            process.exit(result.complete ? 0 : 1);
        } catch (err: any) {
            if (globalOpts.json) {
                console.error(JSON.stringify({ status: "error", message: err.message }, null, 2));
                process.exit(1);
            }

            ui.printError({
                operation: "Repository Scanning",
                failure: "Failed to scan directory",
                reason: err.message,
                nextAction: "Ensure the path exists and contains readable source files"
            });
            process.exit(1);
        }
    });

// 3. Validate Command
program
    .command("validate <docFile>")
    .description("Validate an existing documentation file against repository AST symbols and paths")
    .option("-r, --root <dir>", "Project root directory", ".")
    .action(async (docFile, cmdOptions) => {
        const globalOpts = program.opts();
        const ui = new TerminalUI({
            noColor: !globalOpts.color,
            quiet: globalOpts.quiet || globalOpts.json,
            verbose: globalOpts.verbose
        });

        const startTime = Date.now();
        if (!globalOpts.json) {
            ui.printHeader({
                project: path.basename(path.resolve(cmdOptions.root)),
                output: docFile
            });
            ui.startStage(`Validating ${docFile} against codebase AST`);
        }

        try {
            const result = await executeValidateCommand({
                docPath: docFile,
                rootDir: cmdOptions.root
            });

            const duration = Date.now() - startTime;

            if (globalOpts.json) {
                console.log(JSON.stringify({ status: result.passed ? "passed" : "failed", result, durationMs: duration }, null, 2));
                process.exit(result.passed ? 0 : 2);
            }

            if (!result.passed) {
                ui.failStage(`Validation failed for ${docFile}`);
                if (result.issues.length > 0) {
                    result.issues.forEach(issue => {
                        ui.printWarning(`[${issue.sectionId}] ${issue.type}: ${issue.message} ${issue.evidence ? `(${issue.evidence})` : ""}`);
                    });
                }
                if (result.error) {
                    ui.printError({
                        operation: "Document Validation",
                        failure: "File could not be validated",
                        reason: result.error,
                        nextAction: "Check that the document path is correct"
                    });
                }
                process.exit(2);
            }

            ui.completeStage(`Validation passed (${result.sectionsChecked} sections verified)`);
            ui.printSummary({
                documentsCreated: 0,
                validationStatus: "Passed",
                outputDirectory: docFile,
                durationMs: duration,
                nextSteps: ["All references and AST symbols verified accurately."]
            });

            process.exit(0);
        } catch (err: any) {
            if (globalOpts.json) {
                console.error(JSON.stringify({ status: "error", message: err.message }, null, 2));
                process.exit(1);
            }

            ui.printError({
                operation: "Document Validation",
                failure: "Unexpected validation crash",
                reason: err.message,
                nextAction: "Review verbose output with --verbose"
            });
            process.exit(1);
        }
    });

// 4. Generate Command (also default fallback)
program
    .command("generate <file>", { isDefault: true })
    .description("Generate verified, grounded technical documentation for a target file")
    .option("-r, --root <dir>", "Repository root directory", ".")
    .option("-o, --out <dir>", "Destination directory", "docs/generated")
    .option("-p, --provider <provider>", "LLM provider: gemini | openai | anthropic | mock")
    .option("-s, --style <style>", "Documentation style: developer-guide | api-reference | architecture-overview")
    .action(async (file, cmdOptions) => {
        const globalOpts = program.opts();
        const ui = new TerminalUI({
            noColor: !globalOpts.color,
            quiet: globalOpts.quiet || globalOpts.json,
            verbose: globalOpts.verbose
        });

        const startTime = Date.now();
        const resolvedRoot = path.resolve(cmdOptions.root);
        const config = loadConfig(cmdOptions.provider ? { llmProvider: cmdOptions.provider } : {});

        const activeApiKey = config.llmProvider === "gemini"
            ? config.geminiApiKey
            : (config.llmProvider === "openai"
                ? config.openaiApiKey
                : (config.llmProvider === "anthropic" ? config.anthropicApiKey : undefined));

        if (!globalOpts.json) {
            ui.printHeader({
                project: path.basename(resolvedRoot),
                output: cmdOptions.out,
                target: file,
                provider: config.llmProvider
            });
        }

        const orchestrator = new PipelineOrchestrator({
            provider: config.llmProvider,
            apiKey: activeApiKey,
            model: config.llmModel,
            tokenBudget: config.tokenBudget,
            maxRevisionAttempts: config.maxRevisionAttempts,
            onProgress: (event) => {
                if (globalOpts.json) return;
                if (event.status === "started") {
                    ui.startStage(event.message);
                } else if (event.status === "completed") {
                    ui.completeStage(event.message);
                } else if (event.status === "failed") {
                    ui.failStage(event.message);
                }
            }
        });

        try {
            const result = await orchestrator.execute({
                target: file,
                rootDir: cmdOptions.root,
                style: cmdOptions.style,
                outDir: cmdOptions.out
            });

            const duration = Date.now() - startTime;

            if (globalOpts.json) {
                console.log(JSON.stringify({ status: result.status, result, durationMs: duration }, null, 2));
                process.exit(result.status === "validated" ? 0 : 2);
            }

            ui.stopSpinner();

            if (result.status === "unapproved" && result.unresolvedIssues) {
                result.unresolvedIssues.forEach(i => {
                    ui.printWarning(`[${i.sectionId}] ${i.type}: ${i.message}`);
                });
            }

            ui.printSummary({
                documentsCreated: result.savedFilePath ? 1 : 0,
                validationStatus: result.status === "validated" ? "Passed" : "Unapproved Draft",
                outputDirectory: result.savedFilePath ?? cmdOptions.out,
                durationMs: duration,
                nextSteps: result.savedFilePath ? [`Review ${result.savedFilePath}`] : undefined
            });

            process.exit(result.status === "validated" ? 0 : 2);
        } catch (err: any) {
            ui.stopSpinner();
            const duration = Date.now() - startTime;

            if (globalOpts.json) {
                console.error(JSON.stringify({ status: "error", message: err.message, durationMs: duration }, null, 2));
                process.exit(1);
            }

            let nextAction = "Verify target file exists and check configuration";
            if (err.message.includes("API key")) {
                nextAction = `Set ${config.llmProvider.toUpperCase()}_API_KEY in your env/.env file or run with -p mock`;
            }

            ui.printError({
                operation: "Document Generation",
                failure: "Documentation pipeline failed",
                reason: err.message,
                nextAction
            });

            if (globalOpts.verbose && err.stack) {
                ui.printDiagnostic(err.stack);
            }

            process.exit(1);
        }
    });

program.parse(process.argv);
