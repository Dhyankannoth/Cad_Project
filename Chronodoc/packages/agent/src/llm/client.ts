import type { LLMClient, LLMMessage, LLMResponse, ToolCallRequest, ToolDefinition } from "./types.js";

export class MockLLMClient implements LLMClient {
    private turns: LLMResponse[];
    private turnIndex: number = 0;

    constructor(options: { turns?: LLMResponse[] } = {}) {
        this.turns = options.turns ?? [
            { content: "Mock LLM output response", toolCalls: [] }
        ];
    }

    public async chat(
        _messages: LLMMessage[],
        _options?: { tools?: ToolDefinition[]; temperature?: number }
    ): Promise<LLMResponse> {
        if (this.turnIndex >= this.turns.length) {
            return this.turns[this.turns.length - 1] ?? { content: "Mock fallback response", toolCalls: [] };
        }
        const response = this.turns[this.turnIndex];
        this.turnIndex++;
        return response;
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
        this.model = options.model ?? "gemini-1.5-flash";
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

        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload)
        });

        if (!res.ok) {
            const errText = await res.text();
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

    throw new Error(`Unsupported LLM provider: ${config.provider}`);
}
