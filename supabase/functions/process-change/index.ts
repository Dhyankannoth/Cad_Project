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

        const { project_id, changed_files, commit_message, commit_hash } = await req.json();
        if (!project_id) throw new Error("project_id required");

        await supabase.from("projects").update({ status: "updating" }).eq("id", project_id);

        // Step 1 — Detect changes via hash comparison
        const { data: files } = await supabase
            .from("files")
            .select("id, file_path, file_name, content, content_hash")
            .eq("project_id", project_id);

        if (!files) throw new Error("No files");

        const modifiedFileIds = [];
        const modifiedPaths = [];

        if (changed_files && Array.isArray(changed_files)) {
            // Use provided changed files list
            for (const cf of changed_files) {
                const file = (files as any[]).find((f: any) => f.file_path === cf.path);
                if (file) {
                    // Update content and hash
                    const newHash = await hashContent(cf.content);
                    if (newHash !== file.content_hash) {
                        await supabase.from("files").update({
                            content: cf.content,
                            content_hash: newHash,
                            size_bytes: new TextEncoder().encode(cf.content).length,
                        }).eq("id", file.id);

                        modifiedFileIds.push(file.id);
                        modifiedPaths.push(file.file_path);
                    }
                }
            }
        }

        if (modifiedFileIds.length === 0) {
            await supabase.from("projects").update({ status: "ready" }).eq("id", project_id);
            return new Response(JSON.stringify({ success: true, changes: 0 }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Step 2 — Dependency ripple analysis
        const { data: deps } = await supabase
            .from("dependencies")
            .select("source_file_id, target_file_id, import_path")
            .eq("project_id", project_id);

        const impactedFileIds = new Set(modifiedFileIds);
        const impactedPaths = [];

        // Find all files that import modified files
        if (deps) {
            for (const dep of (deps as any[])) {
                if (modifiedFileIds.includes(dep.target_file_id)) {
                    impactedFileIds.add(dep.source_file_id);
                    const impactedFile = (files as any[]).find((f: any) => f.id === dep.source_file_id);
                    if (impactedFile) impactedPaths.push(impactedFile.file_path);
                }
            }
        }

        // Step 3 — Selective regeneration (only modified + impacted files)
        const filesToRegenerate = (files as any[]).filter((f: any) => impactedFileIds.has(f.id));
        const regeneratedDocs: any[] = [];

        if (filesToRegenerate.length > 0) {
            // Batch processing (limit 5 per batch for efficiency)
            const BATCH_SIZE = 5;
            for (let i = 0; i < filesToRegenerate.length; i += BATCH_SIZE) {
                const batch = filesToRegenerate.slice(i, i + BATCH_SIZE);
                console.log(`Processing update batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} files)`);

                const batchPrompt = `You are updating documentation for code changes. 
Analyze these ${batch.length} files and return a JSON object mapping FILE IDs to documentation objects.

Schema for each documentation:
{
  "overview": "Updated high-level description",
  "function_docs": [{"name": "fn", "description": "desc", "params": "", "returns": ""}],
  "edge_cases": ["edge case"],
  "complexity_notes": "notes",
  "architecture_role": "role"
}

Files:
${batch.map((file) => `
--- FILE ID: ${file.id} ---
Path: ${file.file_path}
Code:
\`\`\`
${(file.content || "").substring(0, 6000)}
\`\`\`
`).join("\n")}

IMPORTANT: Return ONLY a valid JSON object mapping FILE IDs to documentation objects.`;

                try {
                    const batchResults: any = await callGemini(geminiKey, batchPrompt);
                    if (batchResults) {
                        for (const file of batch) {
                            const result = batchResults[file.id];
                            if (result) {
                                const { data: existingDoc }: { data: any } = await supabase
                                    .from("documentation_sections")
                                    .select("version")
                                    .eq("file_id", file.id)
                                    .single();

                                const { error: upsertErr } = await supabase.from("documentation_sections").upsert({
                                    file_id: file.id,
                                    project_id,
                                    overview: result.overview,
                                    function_docs: result.function_docs || [],
                                    edge_cases: result.edge_cases || [],
                                    complexity_notes: result.complexity_notes,
                                    architecture_role: result.architecture_role,
                                    generated_at: new Date().toISOString(),
                                    content_hash: file.content_hash,
                                    version: (existingDoc?.version || 0) + 1,
                                }, { onConflict: "file_id" });

                                if (!upsertErr) regeneratedDocs.push(file.file_path);
                                else console.error(`Error saving update for ${file.file_path}:`, upsertErr);
                            }
                        }
                    }
                } catch (err: any) {
                    console.error("Batch update failed:", err?.message);
                }
            }
        }

        // Step 4 — Create commit record and NLP change summary
        const { data: commit } = await supabase.from("commits").insert({
            project_id,
            commit_hash: commit_hash || null,
            message: commit_message || "Manual sync",
            changed_files: modifiedPaths,
        }).select().single();

        // Generate AI change summary
        const diffSummary = modifiedPaths
            .map((p) => `Modified: ${p}`)
            .concat(impactedPaths.map((p) => `Impacted: ${p}`))
            .join("\n");

        const changePrompt = `Analyze this code change and provide a summary.

Changed files:
${diffSummary}

Commit message: ${commit_message || "Manual sync"}

Return ONLY valid JSON:
{
  "summary": "Human-readable summary of what changed",
  "impact_explanation": "What parts of the codebase are affected and why",
  "risk_level": "low|medium|high|critical"
}`;

        const changeResult = await callGemini(geminiKey, changePrompt);

        if (commit && changeResult) {
            await supabase.from("change_analysis").insert({
                commit_id: commit.id,
                project_id,
                summary: changeResult.summary,
                impact_explanation: changeResult.impact_explanation,
                risk_level: changeResult.risk_level || "low",
                affected_files: impactedPaths,
                regenerated_docs: regeneratedDocs,
            });
        }

        await supabase.from("projects").update({ status: "ready" }).eq("id", project_id);

        return new Response(
            JSON.stringify({
                success: true,
                modified: modifiedPaths.length,
                impacted: impactedPaths.length,
                regenerated: regeneratedDocs.length,
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

async function hashContent(content: string) {
    const data = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

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
                        temperature: 0.2, // Lower temperature for more stable JSON
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
