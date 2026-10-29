import * as p from "@clack/prompts";
import pc from "picocolors";

export interface ProviderMetadata {
    value: "openai" | "anthropic" | "gemini" | "mock";
    label: string;
    hint?: string;
    envKey: string;
    defaultModel: string;
}

export const SUPPORTED_PROVIDERS: ProviderMetadata[] = [
    {
        value: "openai",
        label: "OpenAI",
        hint: "GPT-4o / GPT-4o-mini",
        envKey: "OPENAI_API_KEY",
        defaultModel: "gpt-4o-mini"
    },
    {
        value: "anthropic",
        label: "Anthropic",
        hint: "Claude 3.5 Sonnet",
        envKey: "ANTHROPIC_API_KEY",
        defaultModel: "claude-3-5-sonnet-20241022"
    },
    {
        value: "gemini",
        label: "Google Gemini",
        hint: "Gemini 2.5 Flash / 3.5 Flash",
        envKey: "GEMINI_API_KEY",
        defaultModel: "gemini-2.5-flash"
    },

    {
        value: "mock",
        label: "Mock / Offline",
        hint: "Local testing without API key",
        envKey: "",
        defaultModel: "mock-model"
    }
];

export function validateApiKey(provider: string, key?: string): string | undefined {
    if (provider === "mock") {
        return undefined;
    }
    if (!key || key.trim().length === 0) {
        return "API key cannot be empty";
    }
    if (key.trim().length < 8) {
        return "API key is too short. Please provide a valid key.";
    }
    return undefined;
}

export function maskApiKey(key: string): string {
    if (!key || key.trim().length === 0) {
        return "(none)";
    }
    const trimmed = key.trim();
    if (trimmed.length <= 8) {
        return "•".repeat(trimmed.length);
    }
    const prefix = trimmed.slice(0, 8);
    const suffix = trimmed.slice(-4);
    return `${prefix}••••••••${suffix}`;
}

export interface InteractivePromptHandler {
    selectProvider(): Promise<"gemini" | "openai" | "anthropic" | "mock" | null>;
    promptApiKey(provider: "gemini" | "openai" | "anthropic" | "mock"): Promise<string | null>;
}

export class ClackPromptHandler implements InteractivePromptHandler {
    public async selectProvider(): Promise<"gemini" | "openai" | "anthropic" | "mock" | null> {
        const choice = await p.select({
            message: "Select your AI provider",
            options: SUPPORTED_PROVIDERS.map(item => ({
                value: item.value,
                label: item.label,
                hint: item.hint
            }))
        });

        if (p.isCancel(choice)) {
            p.cancel("Setup cancelled.");
            return null;
        }

        return choice as "gemini" | "openai" | "anthropic" | "mock";
    }

    public async promptApiKey(provider: "gemini" | "openai" | "anthropic" | "mock"): Promise<string | null> {
        if (provider === "mock") {
            return "";
        }

        const meta = SUPPORTED_PROVIDERS.find(item => item.value === provider);
        const label = meta ? meta.label : provider;

        const key = await p.password({
            message: `Enter your ${label} API key`,
            mask: "*",
            validate: (value) => validateApiKey(provider, value)
        });

        if (p.isCancel(key)) {
            p.cancel("Setup cancelled.");
            return null;
        }

        return String(key).trim();
    }
}
