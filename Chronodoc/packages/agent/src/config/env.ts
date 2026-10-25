export interface AgentConfig {
    llmProvider: "openai" | "gemini" | "anthropic" | "mock";
    openaiApiKey?: string;
    geminiApiKey?: string;
    anthropicApiKey?: string;
    llmModel: string;
    embeddingModel: string;
    llmTemperature: number;
    maxTokens: number;
    maxRevisionAttempts: number;
    tokenBudget: number;
    logLevel: "debug" | "info" | "warn" | "error";
    cacheDir: string;
}

export function loadConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
    const env = process.env;

    const provider = (overrides.llmProvider ??
        env.LLM_PROVIDER ??
        "openai") as AgentConfig["llmProvider"];

    const maxRevisionAttempts = overrides.maxRevisionAttempts ??
        (env.CHRONODOC_MAX_REVISION_ATTEMPTS ? parseInt(env.CHRONODOC_MAX_REVISION_ATTEMPTS, 10) : 2);

    const tokenBudget = overrides.tokenBudget ??
        (env.CHRONODOC_TOKEN_BUDGET ? parseInt(env.CHRONODOC_TOKEN_BUDGET, 10) : 8000);

    const llmTemperature = overrides.llmTemperature ??
        (env.LLM_TEMPERATURE ? parseFloat(env.LLM_TEMPERATURE) : 0.2);

    const maxTokens = overrides.maxTokens ??
        (env.MAX_TOKENS ? parseInt(env.MAX_TOKENS, 10) : 4096);

    const logLevel = (overrides.logLevel ??
        env.CHRONODOC_LOG_LEVEL ??
        "info") as AgentConfig["logLevel"];

    return {
        llmProvider: provider,
        openaiApiKey: overrides.openaiApiKey ?? env.OPENAI_API_KEY,
        geminiApiKey: overrides.geminiApiKey ?? env.GEMINI_API_KEY,
        anthropicApiKey: overrides.anthropicApiKey ?? env.ANTHROPIC_API_KEY,
        llmModel: overrides.llmModel ?? env.LLM_MODEL ?? "gpt-4o-mini",
        embeddingModel: overrides.embeddingModel ?? env.EMBEDDING_MODEL ?? "text-embedding-3-small",
        llmTemperature,
        maxTokens,
        maxRevisionAttempts,
        tokenBudget,
        logLevel,
        cacheDir: overrides.cacheDir ?? env.CHRONODOC_CACHE_DIR ?? ".chronodoc/cache",
    };
}
