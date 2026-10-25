import type { RetrievedItem } from "../retrieval/hybridRetriever.js";
import type { CodeSymbol } from "../scanner/astExtractor.js";

export interface AssembledContext {
    target: string;
    estimatedTokens: number;
    files: Array<{ path: string; snippet: string }>;
    symbols: CodeSymbol[];
    documentationSnippets: string[];
    formattedPromptContext: string;
}

export interface ContextOptions {
    tokenBudget: number;
    docStyle?: "api-reference" | "architecture-overview" | "developer-guide";
}

export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

export function buildContext(
    target: string,
    items: RetrievedItem[],
    options: ContextOptions
): AssembledContext {
    const budget = options.tokenBudget ?? 8000;
    const docStyle = options.docStyle ?? "developer-guide";

    const basePromptHeader = [
        `Target: ${target}`,
        `Documentation Style: ${docStyle}`,
        "Context Evidence from Repository Scan:",
        ""
    ].join("\n");

    let currentTokens = estimateTokens(basePromptHeader);
    const includedFiles: Array<{ path: string; snippet: string }> = [];
    const docSnippets: string[] = [];
    const symbols: CodeSymbol[] = [];
    const promptSections: string[] = [basePromptHeader];

    // Sort items by score descending
    const sortedItems = [...items].sort((a, b) => b.score - a.score);

    for (const item of sortedItems) {
        if (currentTokens >= budget) break;

        const isDoc = item.filePath.endsWith(".md");
        const remainingBudget = budget - currentTokens;
        const maxChars = remainingBudget * 4;

        if (maxChars < 40) break; // Not enough room for meaningful context

        let snippet = item.snippet;
        if (snippet.length > maxChars) {
            snippet = snippet.slice(0, maxChars - 3) + "...";
        }

        const itemTokenCost = estimateTokens(snippet) + 15; // allowance for headers
        if (currentTokens + itemTokenCost > budget) {
            // Trim down to fit exact budget
            const allowedLength = Math.max(0, (budget - currentTokens - 15) * 4);
            if (allowedLength > 30) {
                snippet = snippet.slice(0, allowedLength - 3) + "...";
            } else {
                continue;
            }
        }

        currentTokens += estimateTokens(snippet) + 15;

        if (isDoc) {
            docSnippets.push(snippet);
            promptSections.push(`### Documentation: ${item.filePath}\n${snippet}\n`);
        } else {
            includedFiles.push({ path: item.filePath, snippet });
            promptSections.push(`### Code File: ${item.filePath}\n\`\`\`typescript\n${snippet}\n\`\`\`\n`);
        }

        if (item.symbolName) {
            symbols.push({
                name: item.symbolName,
                kind: "function",
                exported: true,
                filePath: item.filePath,
                line: 1
            });
        }
    }

    const formattedPromptContext = promptSections.join("\n");

    return {
        target,
        estimatedTokens: estimateTokens(formattedPromptContext),
        files: includedFiles,
        symbols,
        documentationSnippets: docSnippets,
        formattedPromptContext,
    };
}
