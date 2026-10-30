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
        const geminiKey = Deno.env.get("GEMINI_API_KEY");
        if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");

        const { source_code, feedback, previous_markdown } = await req.json();
        if (!source_code && !feedback) throw new Error("source_code or feedback required");

        let prompt = "";

        if (feedback && previous_markdown) {
            prompt = `You are an expert documentation editor. A user has provided feedback on existing 
documentation. Your task is to make precise, targeted edits based on their feedback 
while preserving everything else exactly as-is.

Source code (for factual reference only):
\`\`\`
${source_code}
\`\`\`

Current Documentation:
${previous_markdown}

Current Project Title: ${current_title}

USER FEEDBACK:
"${feedback}"

Instructions:

1. **Edit Scope**: Make ONLY the changes necessary to address the feedback. 
   Preserve all sections, wording, structure, and tone that the feedback does 
   not reference. Do not restructure, reorder, or rewrite unaffected content.

2. **Interpreting Feedback**: If the feedback is vague or ambiguous, apply the 
   most conservative interpretation — improve only the targeted area minimally 
   without making assumptions about unmentioned sections.

3. **Source Code Usage**: Use the source code strictly to verify or correct 
   technical inaccuracies raised in the feedback. Do not introduce new content 
   from the source code unless the feedback explicitly requests it.

4. **Formatting Rules** (must be preserved throughout all edits):
   - Use inline code backticks for all file paths, function names, variable 
     names, and CLI commands.
   - Write in narrative paragraphs. Do not convert prose into bullet lists.
   - Maintain existing Markdown header levels. Do not add, remove, or rename 
     headers unless the feedback explicitly asks for it.

5. **Project Title**: Only change the title if the feedback explicitly requests 
   it. Otherwise, return the current title unchanged.

Return ONLY a valid JSON object with no markdown fences, no preamble, and no 
trailing text:
{
  "markdown": "the updated documentation as a single JSON-escaped string",
  "suggested_title": "unchanged title, or a new one only if feedback requested it"
}

IMPORTANT: The "markdown" field must be a single valid JSON string.
Escape all newlines as \\n and all double quotes as \\".
Do not include raw line breaks inside the JSON string value.`;
        } else {
            prompt = `You are an expert technical writer and senior software engineer.
Given the source code below, produce a professional, comprehensive "Project Handbook" 
styled for internal company documentation. Also suggest a short project name.

Follow these strict style guidelines:

1. **Tone**: Professional, informative, and narrative-driven. Explain the "why" and 
   "how" of the architecture. Do not use a casual or tutorial tone.

2. **Formatting**:
   - Use bold level 1 and level 2 Markdown headers (e.g., # Overview, ## Technical Standards).
   - Use inline code backticks for ALL file paths, module names, variable names, 
     function names, and CLI commands.
   - Write in structured paragraphs. Avoid bullet-point-only sections. 
     Use bullets sparingly, only for truly enumerable items (e.g., a list of env vars).

3. **Sections**: The document must contain exactly four sections in this order:
   - **Project Overview**: High-level goal, architectural approach, and the problem being solved.
   - **Module & File Architecture**: A narrative walkthrough of the directory structure 
     and the responsibility of each key file or module.
     Crucially, include a \`\`\`mermaid diagram illustrating the core architecture or data flow.
   - **Implementation Details**: A deep dive into the core logic, key functions, 
     data flows, and non-obvious design decisions.
   - **Development Standards**: Tooling, linting, formatting, package managers, 
     and conventions observed in the code (e.g., \`ESLint\`, \`Prettier\`, \`pnpm\`).

4. **Depth**: Each section must be substantive — at least 3–4 paragraphs. 
   This is a reference document, not a summary. Do not truncate.

5. **Grounding**: Base ALL content strictly on the provided source code. Do not 
   invent libraries, patterns, or features not present. If a section cannot be 
   fully populated, describe what is architecturally implied rather than assumed.

Return ONLY a valid JSON object with no markdown code fences, no preamble, and 
no trailing text:
{
  "markdown": "The complete handbook documentation as a single JSON-escaped string",
  "suggested_title": "A short Title Case project name, 3–5 words, no hyphens, avoid generic words like System or App"
}

IMPORTANT: The "markdown" field must be a single valid JSON string. 
Escape all newlines as \\n and all double quotes as \\". 
Do not include raw line breaks inside the JSON string value.

Source code:
\`\`\`
${source_code}
\`\`\`

----
Advanced instructions:
- If there are specialized skills or scripts, document them clearly using inline code formatting.
- If endpoints are present, provide a detailed technical specification.`;
        }

        const text = await callGemini(geminiKey, prompt);
        if (!text) throw new Error("Documentation generation failed with all models.");

        // Parse the JSON from Gemini
        let result;
        try {
            // Clean possible markdown code block wrapper
            const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
            result = JSON.parse(cleaned);
        } catch (e) {
            console.error("JSON Parse failed for Gemini output:", text);
            // Fallback if AI didn't return valid JSON
            result = { markdown: text, suggested_title: "My Project" };
        }

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("Dashboard AI failed:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

async function callGemini(apiKey, prompt) {
    for (const model of GEMINI_MODELS) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 8192,
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
            if (text) return text;

            console.warn(`Empty response from ${model}`);
            continue;
        } catch (err) {
            console.error(`Gemini call error (${model}):`, err);
            continue;
        }
    }
    return null;
}
