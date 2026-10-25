import { BM25Retriever } from "./bm25.js";
import { StructuralRetriever } from "./structural.js";
import { SemanticRetriever } from "./semantic.js";
import type { RepositoryScanIndex } from "../scanner/astExtractor.js";

export interface RetrievedItem {
    id: string;
    filePath: string;
    snippet: string;
    score: number;
    source: "structural" | "keyword" | "semantic";
    symbolName?: string;
}

export interface HybridRetrieverOptions {
    mockSemantic?: boolean;
    topK?: number;
    rrfK?: number;
}

export class HybridRetriever {
    private bm25: BM25Retriever = new BM25Retriever();
    private structural: StructuralRetriever = new StructuralRetriever();
    private semantic: SemanticRetriever = new SemanticRetriever();
    private options: HybridRetrieverOptions;
    private rawCorpus: Map<string, string> = new Map();

    constructor(options: HybridRetrieverOptions = {}) {
        this.options = {
            mockSemantic: true,
            topK: 10,
            rrfK: 60,
            ...options,
        };
    }

    public indexCorpus(
        corpus: Array<{ filePath: string; content: string }>,
        index: RepositoryScanIndex
    ): void {
        this.rawCorpus.clear();
        const bm25Docs: Array<{ id: string; filePath: string; content: string }> = [];
        const semanticItems: Array<{ id: string; filePath: string; vector: number[] }> = [];

        corpus.forEach((doc, idx) => {
            const id = `doc-${idx}`;
            this.rawCorpus.set(doc.filePath, doc.content);
            bm25Docs.push({ id, filePath: doc.filePath, content: doc.content });

            // Generate mock embedding vector based on hash for deterministic offline search
            const vector: number[] = new Array(8).fill(0);
            for (let i = 0; i < doc.content.length; i++) {
                vector[i % 8] += doc.content.charCodeAt(i);
            }
            semanticItems.push({ id, filePath: doc.filePath, vector });
        });

        this.bm25.index(bm25Docs);
        this.structural.updateIndex(index);
        this.semantic.index(semanticItems);
    }

    public async search(query: string): Promise<RetrievedItem[]> {
        const topK = this.options.topK ?? 10;
        const rrfK = this.options.rrfK ?? 60;

        // 1. Run structural retrieval
        const structuralMatches = this.structural.search(query);

        // 2. Run BM25 lexical retrieval
        const bm25Matches = this.bm25.search(query, topK);

        // 3. Run semantic retrieval
        const queryVector = new Array(8).fill(0);
        for (let i = 0; i < query.length; i++) {
            queryVector[i % 8] += query.charCodeAt(i);
        }
        const semanticMatches = this.semantic.searchWithVector(queryVector, topK);

        // 4. Reciprocal Rank Fusion (RRF) & Deduplication
        const scoreMap = new Map<string, {
            score: number;
            primarySource: "structural" | "keyword" | "semantic";
            symbolName?: string;
        }>();

        // Structural scores
        structuralMatches.forEach((match, rank) => {
            const rrfScore = 1.0 / (rrfK + rank + 1);
            const current = scoreMap.get(match.filePath) ?? { score: 0, primarySource: "structural", symbolName: match.symbol?.name };
            current.score += rrfScore * 1.5; // Structural boost
            current.primarySource = "structural";
            if (match.symbol) current.symbolName = match.symbol.name;
            scoreMap.set(match.filePath, current);
        });

        // BM25 scores
        bm25Matches.forEach((match, rank) => {
            const rrfScore = 1.0 / (rrfK + rank + 1);
            const current = scoreMap.get(match.filePath) ?? { score: 0, primarySource: "keyword" };
            current.score += rrfScore;
            scoreMap.set(match.filePath, current);
        });

        // Semantic scores
        semanticMatches.forEach((match, rank) => {
            const rrfScore = 1.0 / (rrfK + rank + 1);
            const current = scoreMap.get(match.filePath) ?? { score: 0, primarySource: "semantic" };
            current.score += rrfScore * 0.8;
            scoreMap.set(match.filePath, current);
        });

        // Build deduplicated and ranked results
        const items: RetrievedItem[] = [];
        for (const [filePath, data] of scoreMap.entries()) {
            const content = this.rawCorpus.get(filePath) ?? "";
            items.push({
                id: `retrieved-${filePath}`,
                filePath,
                snippet: content.slice(0, 500),
                score: Number(data.score.toFixed(4)),
                source: data.primarySource,
                symbolName: data.symbolName,
            });
        }

        return items.sort((a, b) => b.score - a.score).slice(0, topK);
    }
}
