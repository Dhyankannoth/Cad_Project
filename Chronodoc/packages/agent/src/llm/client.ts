import type { LLMClient, LLMMessage, LLMResponse, ToolCallRequest, ToolDefinition } from "./types.js";

export class MockLLMClient implements LLMClient {
    private turns: LLMResponse[];
    private turnIndex: number = 0;

    constructor(options: { turns?: LLMResponse[] } = {}) {
        this.turns = options.turns ?? [];
    }

    public async chat(
        messages: LLMMessage[],
        _options?: { tools?: ToolDefinition[]; temperature?: number }
    ): Promise<LLMResponse> {
        if (this.turns.length > 0 && this.turnIndex < this.turns.length) {
            const response = this.turns[this.turnIndex];
            this.turnIndex++;
            return response;
        }

        const userMsg = messages.find(m => m.role === "user")?.content ?? "";
        return {
            content: `## Module Overview

This module is part of the Chronodoc architecture. It provides core functionality and manages component lifecycle.

## Architecture & Integration

Integrated into the repository pipeline. Analyzed context from codebase scanning.

## API Reference

Provides exported utilities and type signatures extracted directly from AST inspection.`,
            toolCalls: []
        };
    }
}

export class OpenAILLMClient implements LLMClient {
    private apiKey: string;
    private model: string;

    constructor(options: { apiKey: string; model?: string }) {
        this.apiKey = options.apiKey;
        this.model = options.model ?? "gpt-4o-mini";
    }

    public async chat(
        messages: LLMMessage[],
        options?: { tools?: ToolDefinition[]; temperature?: number }
    ): Promise<LLMResponse> {
        const payload: Record<string, any> = {
            model: this.model,
            temperature: options?.temperature ?? 0.2,
            messages: messages.map(m => {
                if (m.role === "tool") {
                    return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
                }
                if (m.toolCalls && m.toolCalls.length > 0) {
                    return {
                        role: "assistant",
                        content: m.content || null,
                        tool_calls: m.toolCalls.map(tc => ({
                            id: tc.id,
                            type: "function",
                            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
                        }))
                    };
                }
                return { role: m.role, content: m.content };
            })
        };

        if (options?.tools && options.tools.length > 0) {
            payload.tools = options.tools.map(t => ({
                type: "function",
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters
                }
            }));
        }

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`OpenAI API request failed (${res.status}): ${errText}`);
        }

        const data = (await res.json()) as any;
        const choice = data.choices?.[0]?.message;
        const toolCalls: ToolCallRequest[] = (choice?.tool_calls ?? []).map((tc: any) => ({
            id: tc.id,
            name: tc.function?.name,
            arguments: JSON.parse(tc.function?.arguments || "{}")
        }));

        return {
            content: choice?.content ?? "",
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined
        };
    }
}

export class GeminiLLMClient implements LLMClient {
    private apiKey: string;
    private model: string;

    constructor(options: { apiKey: string; model?: string }) {
        this.apiKey = options.apiKey;
        this.model = options.model ?? "gemini-3.8-flash";
    }


    public async chat(
        messages: LLMMessage[],
        options?: { tools?: ToolDefinition[]; temperature?: number }
    ): Promise<LLMResponse> {
        const contents = messages.map(m => {
            const role = m.role === "assistant" ? "model" : "user";
            return {
                role,
                parts: [{ text: m.content }]
            };
        });

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        const bodyPayload: Record<string, any> = {
            contents,
            generationConfig: {
                temperature: options?.temperature ?? 0.2
            }
        };

        if (options?.tools && options.tools.length > 0) {
            bodyPayload.tools = [{
                functionDeclarations: options.tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters
                }))
            }];
        }

        const maxRetries = 3;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            }

            try {
                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(bodyPayload)
                });

                if (!res.ok) {
                    const errText = await res.text();
                    if ((res.status === 503 || res.status === 429) && attempt < maxRetries - 1) {
                        lastError = new Error(`Gemini API request failed (${res.status}): ${errText}`);
                        continue;
                    }
                    throw new Error(`Gemini API request failed (${res.status}): ${errText}`);
                }

                const data = (await res.json()) as any;
                const candidate = data.candidates?.[0]?.content;
                const textParts = candidate?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join("") ?? "";
                const funcCalls = candidate?.parts?.filter((p: any) => p.functionCall).map((p: any, idx: number) => ({
                    id: `gemini_call_${idx}`,
                    name: p.functionCall.name,
                    arguments: p.functionCall.args || {}
                }));

                return {
                    content: textParts,
                    toolCalls: funcCalls && funcCalls.length > 0 ? funcCalls : undefined
                };
            } catch (err: any) {
                lastError = err;
                if (attempt < maxRetries - 1 && (err.message.includes("503") || err.message.includes("fetch failed"))) {
                    continue;
                }
                throw err;
            }
        }

        throw lastError ?? new Error("Gemini API request failed after retries");
    }
}


export class AnthropicLLMClient implements LLMClient {
    private apiKey: string;
    private model: string;

    constructor(options: { apiKey: string; model?: string }) {
        this.apiKey = options.apiKey;
        this.model = options.model ?? "claude-3-5-sonnet-20241022";
    }

    public async chat(
        messages: LLMMessage[],
        options?: { tools?: ToolDefinition[]; temperature?: number }
    ): Promise<LLMResponse> {
        const systemMsg = messages.find(m => m.role === "system")?.content;
        const nonSystemMsgs = messages.filter(m => m.role !== "system");

        const anthropicMessages = nonSystemMsgs.map(m => {
            if (m.role === "tool") {
                return {
                    role: "user",
                    content: [{
                        type: "tool_result",
                        tool_use_id: m.toolCallId,
                        content: m.content
                    }]
                };
            }
            if (m.toolCalls && m.toolCalls.length > 0) {
                const parts: any[] = [];
                if (m.content) {
                    parts.push({ type: "text", text: m.content });
                }
                for (const tc of m.toolCalls) {
                    parts.push({
                        type: "tool_use",
                        id: tc.id,
                        name: tc.name,
                        input: tc.arguments
                    });
                }
                return {
                    role: "assistant",
                    content: parts
                };
            }
            return {
                role: m.role === "assistant" ? "assistant" : "user",
                content: m.content
            };
        });

        const payload: Record<string, any> = {
            model: this.model,
            max_tokens: 4096,
            temperature: options?.temperature ?? 0.2,
            messages: anthropicMessages
        };

        if (systemMsg) {
            payload.system = systemMsg;
        }

        if (options?.tools && options.tools.length > 0) {
            payload.tools = options.tools.map(t => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters
            }));
        }

        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this.apiKey,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Anthropic API request failed (${res.status}): ${errText}`);
        }

        const data = (await res.json()) as any;
        const textParts = (data.content ?? [])
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("");

        const toolCalls: ToolCallRequest[] = (data.content ?? [])
            .filter((c: any) => c.type === "tool_use")
            .map((c: any) => ({
                id: c.id,
                name: c.name,
                arguments: c.input || {}
            }));

        return {
            content: textParts,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined
        };
    }
}

export function createLLMClient(config: {
    provider: "openai" | "gemini" | "anthropic" | "mock";
    apiKey?: string;
    model?: string;
    mockTurns?: LLMResponse[];
}): LLMClient {
    if (config.provider === "mock") {
        return new MockLLMClient({ turns: config.mockTurns });
    }

    if (config.provider === "openai") {
        if (!config.apiKey || config.apiKey.trim().length === 0) {
            throw new Error("OpenAI API key is missing. Set OPENAI_API_KEY in your env or pass it explicitly.");
        }
        return new OpenAILLMClient({ apiKey: config.apiKey, model: config.model });
    }

    if (config.provider === "gemini") {
        if (!config.apiKey || config.apiKey.trim().length === 0) {
            throw new Error("Gemini API key is missing. Set GEMINI_API_KEY in your env or pass it explicitly.");
        }
        return new GeminiLLMClient({ apiKey: config.apiKey, model: config.model });
    }

    if (config.provider === "anthropic") {
        if (!config.apiKey || config.apiKey.trim().length === 0) {
            throw new Error("Anthropic API key is missing. Set ANTHROPIC_API_KEY in your env or pass it explicitly.");
        }
        return new AnthropicLLMClient({ apiKey: config.apiKey, model: config.model });
    }

    throw new Error(`Unsupported LLM provider: ${config.provider}`);
}

