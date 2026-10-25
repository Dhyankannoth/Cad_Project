export interface SemanticEmbeddingItem {
    id: string;
    filePath: string;
    vector: number[];
}

export class SemanticRetriever {
    private items: SemanticEmbeddingItem[] = [];

    public static cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length || a.length === 0) return 0;
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            const valA = a[i] ?? 0;
            const valB = b[i] ?? 0;
            dot += valA * valB;
            normA += valA * valA;
            normB += valB * valB;
        }
        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    public index(items: SemanticEmbeddingItem[]): void {
        this.items = items;
    }

    public searchWithVector(queryVector: number[], topK: number = 10): Array<{ id: string; filePath: string; score: number }> {
        return this.items
            .map(item => ({
                id: item.id,
                filePath: item.filePath,
                score: SemanticRetriever.cosineSimilarity(queryVector, item.vector),
            }))
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }
}
