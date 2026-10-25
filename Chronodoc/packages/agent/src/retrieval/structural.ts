import type { RepositoryScanIndex, CodeSymbol } from "../scanner/astExtractor.js";

export interface StructuralMatch {
    filePath: string;
    symbol?: CodeSymbol;
    score: number;
    relationship: "direct_symbol" | "dependency" | "file_match";
}

export class StructuralRetriever {
    private index: RepositoryScanIndex = {
        files: [],
        symbols: new Map(),
        dependencies: [],
        warnings: [],
        complete: true,
    };

    public updateIndex(index: RepositoryScanIndex): void {
        this.index = index;
    }

    public search(query: string): StructuralMatch[] {
        const matches: StructuralMatch[] = [];
        const queryLower = query.toLowerCase();

        for (const [symbolName, symbols] of this.index.symbols.entries()) {
            if (queryLower.includes(symbolName.toLowerCase()) || symbolName.toLowerCase().includes(queryLower)) {
                for (const sym of symbols) {
                    matches.push({
                        filePath: sym.filePath,
                        symbol: sym,
                        score: 1.0,
                        relationship: "direct_symbol",
                    });
                }
            }
        }

        const directFiles = new Set(matches.map(m => m.filePath));
        for (const dep of this.index.dependencies) {
            if (directFiles.has(dep.fromFile)) {
                matches.push({
                    filePath: dep.toFileOrModule,
                    score: 0.6,
                    relationship: "dependency",
                });
            }
        }

        return matches;
    }
}
