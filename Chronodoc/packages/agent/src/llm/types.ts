export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON Schema
}

export interface ToolCallRequest {
    id: string;
    name: string;
    arguments: Record<string, any>;
}

export interface LLMMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    toolCalls?: ToolCallRequest[];
    toolCallId?: string;
}

export interface LLMResponse {
    content: string;
    toolCalls?: ToolCallRequest[];
}

export interface LLMClient {
    chat(
        messages: LLMMessage[],
        options?: {
            tools?: ToolDefinition[];
            temperature?: number;
        }
    ): Promise<LLMResponse>;
}
