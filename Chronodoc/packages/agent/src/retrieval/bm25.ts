export interface DocumentEntry {
    id: string;
    filePath: string;
    content: string;
    tokens: string[];
}

export class BM25Retriever {
    private documents: DocumentEntry[] = [];
    private docFreqs: Map<string, number> = new Map();
    private avgDocLength: number = 0;
    private k1: number = 1.5;
    private b: number = 0.75;

    public static tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\w\s$]/g, " ")
            .split(/\s+/)
            .filter(t => t.length > 1);
    }

    public index(docs: Array<{ id: string; filePath: string; content: string }>): void {
        this.documents = [];
        this.docFreqs.clear();
        let totalLength = 0;

        for (const doc of docs) {
            const tokens = BM25Retriever.tokenize(doc.content);
            this.documents.push({
                id: doc.id,
                filePath: doc.filePath,
                content: doc.content,
                tokens,
            });
            totalLength += tokens.length;

            const uniqueTokens = new Set(tokens);
            for (const token of uniqueTokens) {
                this.docFreqs.set(token, (this.docFreqs.get(token) ?? 0) + 1);
            }
        }

        this.avgDocLength = this.documents.length > 0 ? totalLength / this.documents.length : 0;
    }

    public search(query: string, topK: number = 10): Array<{ id: string; filePath: string; score: number }> {
        const queryTokens = BM25Retriever.tokenize(query);
        if (queryTokens.length === 0 || this.documents.length === 0) return [];

        const nDocs = this.documents.length;
        const results: Array<{ id: string; filePath: string; score: number }> = [];

        for (const doc of this.documents) {
            let score = 0;
            const docLen = doc.tokens.length;

            // Frequency of token in document
            const termCounts = new Map<string, number>();
            for (const t of doc.tokens) {
                termCounts.set(t, (termCounts.get(t) ?? 0) + 1);
            }

            for (const qToken of queryTokens) {
                const tf = termCounts.get(qToken) ?? 0;
                if (tf === 0) continue;

                const df = this.docFreqs.get(qToken) ?? 0;
                // IDF formula with add-1 smoothing
                const idf = Math.log(1 + (nDocs - df + 0.5) / (df + 0.5));
                const numerator = tf * (this.k1 + 1);
                const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / (this.avgDocLength || 1)));

                score += idf * (numerator / denominator);
            }

            if (score > 0) {
                results.push({ id: doc.id, filePath: doc.filePath, score });
            }
        }

        return results.sort((a, b) => b.score - a.score).slice(0, topK);
    }
}
