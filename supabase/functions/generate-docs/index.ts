/// <reference path="../deno.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

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

        const { project_id } = await req.json();
        if (!project_id) throw new Error("project_id required");

        // Update project status
        await supabase.from("projects").update({ status: "generating_docs" }).eq("id", project_id);

        // Fetch project info
        const { data: project } = await supabase.from("projects").select("name, description").eq("id", project_id).single();

        // Fire and forget processing
        const processPromise = processDocumentation(project_id, supabase, geminiKey, project);
        if (typeof EdgeRuntime !== 'undefined') {
            EdgeRuntime.waitUntil(processPromise);
        } else {
            processPromise.catch(console.error);
        }

        return new Response(
            JSON.stringify({ success: true, message: "Documentation generation started" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err: any) {
        console.error("Documentation generation init failed:", err);
        return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});


// Separate the worker logic so it can potentially be handled differently
async function processDocumentation(project_id: string, supabase: any, geminiKey: string, project: any) {
    try {
        // Fetch files along with their existing documentation content_hash
        const { data: files } = await supabase
            .from("files")
            .select(`
                id, 
                file_path, 
                file_name, 
                extension, 
                content, 
                content_hash,
                documentation_sections(content_hash)
            `)
            .eq("project_id", project_id);

        if (!files || files.length === 0) throw new Error("No files to document");

        const { data: allMetadata } = await supabase
            .from("file_metadata")
            .select("*")
            .eq("project_id", project_id);

        const metadataMap = new Map((allMetadata as any[])?.map((m) => [m.file_id, m]) || []);

        // Filter files that need documentation (hash mismatch or missing doc)
        const filesToProcess = (files as any[]).filter((file: any) => {
            const existingDoc = file.documentation_sections?.[0];
            return !existingDoc || existingDoc.content_hash !== file.content_hash;
        });

        console.log(`Optimization: Processing ${filesToProcess.length}/${(files as any[]).length} files (${(files as any[]).length - filesToProcess.length} skipped)`);

        if (filesToProcess.length > 0) {
            // --- Batched Per-File Documentation ---
            const BATCH_SIZE = 5;
            let successCount = 0;

            for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
                const batch = filesToProcess.slice(i, i + BATCH_SIZE);
                console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} files)`);

                const batchPrompt = `You are a senior technical writer and software architect. Analyze these ${batch.length} code files from project "${project?.name || "Unknown"}".

Return a JSON object where keys are the file identifiers (UUIDs) provided, and values are documentation objects.

Style Guidelines:
- **Tone**: Professional, narrative-driven, and highly informative.
- **Formatting**: Use inline code backticks (\`file/path\`, \`variable_name\`) for all technical identifiers.
- **Content**: Explain the "why" and "how" the file fits into the larger system.

Schema for each documentation object:
{
  "overview": "Professional handbook-style description (1-2 paragraphs). Use backticks for all file/module references.",
  "function_docs": [{"name": "funcName", "description": "Professional description of logic and behavior", "params": "param types", "returns": "return type"}],
  "edge_cases": ["Specific edge cases or error conditions handled"],
  "complexity_notes": "Analysis of algorithmic complexity or maintenance considerations",
  "architecture_role": "Narrative explanation of how this file interacts with others"
}

Files to analyze:
${batch.map((file) => {
                    const metadata = metadataMap.get(file.id);
                    return `
--- FILE ID: ${file.id} ---
Path: ${file.file_path}
Code:
\`\`\`
${(file.content || "").substring(0, 6000)}
\`\`\`
${metadata ? `Metadata: Functions: ${JSON.stringify((metadata as any).functions?.slice(0, 10))}, Classes: ${JSON.stringify((metadata as any).classes)}` : ""}
`;
                }).join("\n")}

IMPORTANT: Return ONLY a valid JSON object mapping FILE IDs to documentation objects.`;

                try {
                    const batchResults: any = await callGemini(geminiKey, batchPrompt, true);
                    if (batchResults) {
                        for (const file of batch) {
                            const docResult = batchResults[file.id];
                            if (docResult) {
                                const { error: upsertErr } = await supabase.from("documentation_sections").upsert({
                                    file_id: file.id,
                                    project_id,
                                    overview: docResult.overview || null,
                                    function_docs: docResult.function_docs || [],
                                    edge_cases: docResult.edge_cases || [],
                                    complexity_notes: docResult.complexity_notes || null,
                                    architecture_role: docResult.architecture_role || null,
                                    generated_at: new Date().toISOString(),
                                    content_hash: file.content_hash,
                                    version: 1,
                                }, { onConflict: "file_id" });

                                if (!upsertErr) successCount++;
                                else console.error(`Error saving doc for ${file.file_path}:`, upsertErr);
                            }
                        }
                    }
                } catch (e: any) {
                    console.error("Batch processing failed:", e?.message);
                }
            }
            console.log(`Completed per-file documentation. Success: ${successCount}/${filesToProcess.length}`);
        }

        // --- Architecture Documentation ---
        console.log("Generating Architecture overview...");
        try {
            const { data: deps } = await supabase
                .from("dependencies")
                .select("source_file_id, target_file_id, import_path")
                .eq("project_id", project_id);

            const filePathMap = new Map((files as any[]).map((f: any) => [f.id, f.file_path]));
            const depSummary = (deps || []).map((d: any) => ({
                from: filePathMap.get(d.source_file_id) || "unknown",
                to: filePathMap.get(d.target_file_id) || d.import_path,
            }));

            const archPrompt = `You are a Principal Software Architect. Write a professional "Architecture Handbook" overview for project "${project?.name}".

Style Guidelines:
1. **Bold Headers**: Use level 2 and 3 headers for logical sections.
2. **Technical precision**: Use backticks (\`path/to/file\`) for all file and module references.
3. **Narrative Flow**: Explain the overall system design, patterns used, and module interactions in a sophisticated technical tone.

Dependency Graph:
${JSON.stringify(depSummary.slice(0, 50), null, 2)}

Files: ${(files as any[]).slice(0, 50).map((f: any) => f.file_path).join(", ")}

Return ONLY a valid JSON object:
{
  "overview": "Comprehensive architecture overview (Markdown format with headers)",
  "module_relationships": "Technical breakdown of interactions",
  "key_patterns": "Analysis of design patterns (e.g., MVC, Singleton, etc.) used"
}`;

            const archResult = await callGemini(geminiKey, archPrompt);

            if (archResult) {
                const { data: metrics } = await supabase
                    .from("project_metrics")
                    .select("id")
                    .eq("project_id", project_id)
                    .single();

                if (metrics) {
                    await supabase.from("project_metrics").update({
                        central_modules: [
                            ...(archResult.overview ? [{ type: "architecture", content: archResult.overview }] : []),
                            ...(archResult.module_relationships ? [{ type: "relationships", content: archResult.module_relationships }] : []),
                            ...(archResult.key_patterns ? [{ type: "patterns", content: archResult.key_patterns }] : []),
                        ],
                    }).eq("project_id", project_id);
                }
            }
        } catch (archErr) {
            console.error("Architecture Gen failed (non-fatal):", archErr);
        }

        // --- Finalize ---
        // Count total documented files correctly
        const { count: finalDocCount } = await supabase
            .from("documentation_sections")
            .select("id", { count: "exact", head: true })
            .eq("project_id", project_id);

        const coverage = (files as any[]).length > 0 ? ((finalDocCount || 0) / (files as any[]).length) * 100 : 0;

        await supabase.from("project_metrics")
            .update({ doc_coverage_pct: Math.round(coverage * 10) / 10 })
            .eq("project_id", project_id);

        await supabase.from("projects").update({ status: "ready" }).eq("id", project_id);

    } catch (err: any) {
        console.error("Background processing failed:", err);
        await supabase.from("projects").update({ status: "error" }).eq("id", (project_id as string));
    }
}

const GEMINI_MODELS = [
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash"
];

async function callGemini(apiKey: string, prompt: string, _isBatch = false) {
    for (const model of GEMINI_MODELS) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.2,
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

            const data: any = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                console.warn(`Empty response from ${model}`);
                continue;
            }

            try {
                return JSON.parse(text);
            } catch (e: any) {
                console.error(`Failed to parse JSON from ${model}:`, text);
                return null;
            }
        } catch (err: any) {
            console.error(`Gemini call error (${model}):`, err);
            continue;
        }
    }
    console.error("All Gemini models failed or were rate limited.");
    return null;
}
