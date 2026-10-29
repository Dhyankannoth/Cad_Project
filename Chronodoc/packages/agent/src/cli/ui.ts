import pc from "picocolors";
import ora, { type Ora } from "ora";

export interface UIOptions {
    noColor?: boolean;
    quiet?: boolean;
    verbose?: boolean;
}

export interface HeaderDetails {
    project: string;
    output: string;
    target?: string;
    provider?: string;
}

export interface SummaryDetails {
    documentsCreated: number;
    validationStatus: string;
    outputDirectory: string;
    durationMs: number;
    nextSteps?: string[];
}

export interface ActionableErrorDetails {
    operation: string;
    failure: string;
    reason?: string;
    nextAction: string;
}

export class TerminalUI {
    private noColor: boolean;
    private quiet: boolean;
    private verbose: boolean;
    private activeSpinner: Ora | null = null;

    constructor(options: UIOptions = {}) {
        this.noColor = options.noColor ?? false;
        this.quiet = options.quiet ?? false;
        this.verbose = options.verbose ?? false;
    }

    public isQuiet(): boolean {
        return this.quiet;
    }

    public isVerbose(): boolean {
        return this.verbose;
    }

    public formatHeader(details: HeaderDetails): string {
        const cyan = this.noColor ? (s: string) => s : pc.cyan;
        const bold = this.noColor ? (s: string) => s : pc.bold;
        const dim = this.noColor ? (s: string) => s : pc.dim;

        const lines = [
            `${cyan(bold("◆ DOCAGENT"))}`,
            `  ${dim("Your codebase, documented.")}`,
            "",
            `  ${dim("Project:")} ${bold(details.project)}`,
            `  ${dim("Output:")}  ${details.output}`
        ];

        if (details.target) {
            lines.push(`  ${dim("Target:")}  ${details.target}`);
        }
        if (details.provider) {
            lines.push(`  ${dim("Provider:")}${details.provider}`);
        }
        lines.push("");

        return lines.join("\n");
    }

    public printHeader(details: HeaderDetails): void {
        if (!this.quiet) {
            console.log(this.formatHeader(details));
        }
    }

    public startStage(message: string): void {
        if (this.quiet) return;
        this.stopSpinner();

        if (this.isInteractive()) {
            this.activeSpinner = ora({
                text: message,
                color: "cyan"
            }).start();
        } else {
            console.log(`  ${this.formatIcon("○")} ${message}...`);
        }
    }

    public completeStage(message: string): void {
        if (this.quiet) return;
        if (this.activeSpinner) {
            this.activeSpinner.succeed(message);
            this.activeSpinner = null;
        } else {
            const green = this.noColor ? (s: string) => s : pc.green;
            console.log(`  ${green("✔")} ${message}`);
        }
    }

    public failStage(message: string): void {
        if (this.quiet) return;
        if (this.activeSpinner) {
            this.activeSpinner.fail(message);
            this.activeSpinner = null;
        } else {
            const red = this.noColor ? (s: string) => s : pc.red;
            console.log(`  ${red("✖")} ${message}`);
        }
    }

    public stopSpinner(): void {
        if (this.activeSpinner) {
            this.activeSpinner.stop();
            this.activeSpinner = null;
        }
    }

    public formatSummary(details: SummaryDetails): string {
        const green = this.noColor ? (s: string) => s : pc.green;
        const bold = this.noColor ? (s: string) => s : pc.bold;
        const dim = this.noColor ? (s: string) => s : pc.dim;

        const durationSec = (details.durationMs / 1000).toFixed(1);

        const lines = [
            `${green(bold("✔ Documentation generated successfully"))}`,
            "",
            `  ${dim("Documents created:")} ${bold(String(details.documentsCreated))}`,
            `  ${dim("Validation:")}        ${details.validationStatus === "Passed" ? green(details.validationStatus) : details.validationStatus}`,
            `  ${dim("Output directory:")}  ${details.outputDirectory}`,
            `  ${dim("Duration:")}          ${durationSec}s`
        ];

        if (details.nextSteps && details.nextSteps.length > 0) {
            lines.push("", `  ${bold("Next steps:")}`);
            for (const step of details.nextSteps) {
                lines.push(`    ${pc.cyan("→")} ${step}`);
            }
        }

        return lines.join("\n");
    }

    public printSummary(details: SummaryDetails): void {
        if (!this.quiet) {
            console.log("\n" + this.formatSummary(details) + "\n");
        }
    }

    public formatActionableError(details: ActionableErrorDetails): string {
        const red = this.noColor ? (s: string) => s : pc.red;
        const bold = this.noColor ? (s: string) => s : pc.bold;
        const dim = this.noColor ? (s: string) => s : pc.dim;
        const yellow = this.noColor ? (s: string) => s : pc.yellow;

        const lines = [
            `${red(bold("✖ Error: " + details.operation))}`,
            `  ${bold(details.failure)}`
        ];

        if (details.reason) {
            lines.push(`  ${dim("Reason:")} ${details.reason}`);
        }

        lines.push(`  ${yellow("→ Next action:")} ${details.nextAction}`);
        return lines.join("\n");
    }

    public printError(details: ActionableErrorDetails): void {
        this.stopSpinner();
        console.error("\n" + this.formatActionableError(details) + "\n");
    }

    public printWarning(message: string): void {
        if (this.quiet) return;
        const yellow = this.noColor ? (s: string) => s : pc.yellow;
        console.warn(`  ${yellow("▲")} ${message}`);
    }

    public printDiagnostic(message: string): void {
        if (!this.verbose || this.quiet) return;
        const dim = this.noColor ? (s: string) => s : pc.dim;
        console.error(`  ${dim("[diag]")} ${message}`);
    }

    private formatIcon(symbol: string): string {
        const cyan = this.noColor ? (s: string) => s : pc.cyan;
        return cyan(symbol);
    }

    private isInteractive(): boolean {
        return Boolean(process.stdout.isTTY && !process.env.CI);
    }
}
