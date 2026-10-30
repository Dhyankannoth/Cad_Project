/// <reference path="../deno.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_MODELS = [
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash"
];

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL"),
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
        );

        const geminiKey = Deno.env.get("GEMINI_API_KEY");
        if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");

        const { file_id, level } = await req.json();
        if (!file_id) throw new Error("file_id required");

        // Fetch file data
        const { data: file } = await supabase
            .from("files")
            .select("*, file_metadata(*)")
            .eq("id", file_id)
            .single();

        if (!file) throw new Error("File not found");

        // Fetch documentation
        const { data: docs } = await supabase
            .from("documentation_sections")
            .select("*")
            .eq("file_id", file_id)
            .single();

        // Fetch dependencies
        const { data: deps } = await supabase
            .from("dependencies")
            .select("import_path")
            .eq("source_file_id", file_id);

        const metadata = file.file_metadata?.[0];
        const depPaths = (deps as any[])?.map((d) => d.import_path) || [];

        const levelPrompts: Record<string, string> = {
            beginner: `Explain this module as if teaching a junior developer who is new to the codebase. Use simple language, analogies, and avoid jargon. Break down each concept step by step.`,
            senior: `Explain this module for a senior engineer joining the team. Focus on architecture decisions, trade-offs, patterns used, potential improvements, and how it fits into the larger system.`,
            interview: `Explain this module as if you're answering a technical interview question about it. Cover: what problem it solves, how it's implemented, time/space complexity, edge cases, and how you'd improve it.`,
        };

        const targetLevel = level && levelPrompts[level as string] ? (level as string) : "beginner";

        const prompt = `${levelPrompts[targetLevel]}

File: ${file.file_path}
Code:
\`\`\`
${(file.content || "").substring(0, 6000)}
\`\`\`

${metadata ? `
Functions: ${JSON.stringify(metadata.functions?.slice(0, 15))}
Classes: ${JSON.stringify(metadata.classes)}
Complexity: ${metadata.complexity_score}
` : ""}

${docs ? `
Existing Documentation: ${docs.overview}
` : ""}

Dependencies: ${depPaths.join(", ") || "None"}

Return ONLY valid JSON:
{
  "explanation": "Your detailed explanation here",
  "key_concepts": ["concept1", "concept2"],
  "suggestions": ["suggestion1"]
}`;

        const result = await callGemini(geminiKey, prompt);

        return new Response(
            JSON.stringify({
                success: true,
                level: targetLevel,
                file_path: file.file_path,
                ...(result || { explanation: "Could not generate explanation", key_concepts: [], suggestions: [] }),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

async function callGemini(apiKey: string, prompt: string) {
    for (const model of GEMINI_MODELS) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: 8192,
                        responseMimeType: "application/json",
                    },
                }),
            });

            if (response.status === 429) {
                console.warn(`Model ${model} rate limited (429). Trying fallback...`);
                continue;
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Gemini API error (${model}):`, errorText);
                continue;
            }

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                console.warn(`Empty response from ${model}`);
                continue;
            }

            try {
                return JSON.parse(text);
            } catch (e) {
                console.error(`Failed to parse JSON from ${model}:`, text);
                return null;
            }
        } catch (err) {
            console.error(`Gemini call error (${model}):`, err);
            continue;
        }
    }
    console.error("All Gemini models failed or were rate limited.");
    return null;
}
