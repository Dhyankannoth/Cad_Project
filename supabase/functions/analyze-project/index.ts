/// <reference path="../deno.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    let supabase;
    let project_id = "";

    try {
        supabase = createClient(
            Deno.env.get("SUPABASE_URL"),
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
        );

        const body = await req.json();
        project_id = body.project_id;
        if (!project_id) throw new Error("project_id required");

        // Update status to analyzing
        await supabase.from("projects").update({ status: "analyzing" }).eq("id", project_id);

        // Fetch all files for the project
        const { data: files, error: filesErr } = await supabase
            .from("files")
            .select("*")
            .eq("project_id", project_id);

        if (filesErr) throw filesErr;
        if (!files || files.length === 0) {
            throw new Error("No files found to analyze");
        }

        let totalFunctions = 0;
        let totalComplexity = 0;
        const allImports = {};
        const fileIdMap = {};

        // --- A. Extract Metadata for each file ---
        for (const file of files) {
            (fileIdMap as any)[file.file_path] = file.id;
            const analysis = analyzeCode(file.content || "", file.extension || "");

            totalFunctions += analysis.functions.length;
            totalComplexity += analysis.complexityScore;
            (allImports as any)[file.id] = (analysis.imports as any[]).map((i) => i.path);

            await supabase.from("file_metadata").upsert({
                file_id: file.id,
                project_id,
                functions: analysis.functions,
                classes: analysis.classes,
                imports: analysis.imports,
                exports: analysis.exports,
                routes: analysis.routes,
                complexity_score: analysis.complexityScore,
                loop_count: analysis.loopCount,
                conditional_count: analysis.conditionalCount,
                max_nesting_depth: analysis.maxNestingDepth,
            }, { onConflict: "file_id" });
        }

        // --- B. Build Dependency Graph ---
        await supabase.from("dependencies").delete().eq("project_id", project_id);

        for (const [sourceFileId, imports] of Object.entries(allImports)) {
            for (const importPath of imports as string[]) {
                const resolvedPath = resolveImport(importPath, files);
                const targetFileId = resolvedPath ? (fileIdMap as any)[resolvedPath] : null;

                await supabase.from("dependencies").insert({
                    project_id,
                    source_file_id: sourceFileId,
                    target_file_id: targetFileId || null,
                    import_path: importPath,
                });
            }
        }

        // --- C. Compute Project Metrics ---
        const fileCount = files.length;
        const avgComplexity = fileCount > 0 ? totalComplexity / fileCount : 0;

        const dependentCounts: Record<string, number> = {};
        for (const imports of Object.values(allImports) as string[][]) {
            for (const imp of imports) {
                const resolved = resolveImport(imp, files);
                if (resolved) {
                    dependentCounts[resolved] = (dependentCounts[resolved] || 0) + 1;
                }
            }
        }
        const centralModules = Object.entries(dependentCounts)
            .sort((a, b) => (b[1] as number) - (a[1] as number))
            .slice(0, 5)
            .map(([path, count]) => ({ path, dependents: count }));

        const importedPaths = new Set(
            Object.values(allImports).flat().map((i: any) => resolveImport(i, files)).filter(Boolean)
        );
        const orphanFiles = files
            .filter((f: any) => !importedPaths.has(f.file_path) && ((allImports as any)[f.id]?.length || 0) === 0)
            .map((f: any) => f.file_path);

        const { count: docsCount } = await supabase
            .from("documentation_sections")
            .select("id", { count: "exact" })
            .eq("project_id", project_id);

        const docCoverage = fileCount > 0 ? ((docsCount || 0) / fileCount) * 100 : 0;

        await supabase.from("project_metrics").upsert({
            project_id,
            total_files: fileCount,
            total_functions: totalFunctions,
            avg_complexity: Math.round(avgComplexity * 10) / 10,
            doc_coverage_pct: Math.round(docCoverage * 10) / 10,
            central_modules: centralModules,
            orphan_files: orphanFiles,
            computed_at: new Date().toISOString(),
        }, { onConflict: "project_id" });

        // Update project status
        await supabase.from("projects").update({ status: "generating_docs" }).eq("id", project_id);

        // --- D. Trigger Documentation Generation ---
        try {
            const supabaseUrl = Deno.env.get("SUPABASE_URL");
            if (supabaseUrl) {
                const funcUrl = `${supabaseUrl}/functions/v1/generate-docs`;
                console.log(`Triggering generate-docs for project: ${project_id} at ${funcUrl}`);

                const triggerPromise = fetch(funcUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                    },
                    body: JSON.stringify({ project_id }),
                }).then(async (resp) => {
                    if (!resp.ok) {
                        console.error("Failed to trigger generate-docs:", await resp.text());
                    } else {
                        console.log("Successfully triggered generate-docs");
                    }
                }).catch(err => {
                    console.error("Fetch trigger error:", err);
                });

                if (typeof EdgeRuntime !== 'undefined') {
                    EdgeRuntime.waitUntil(triggerPromise);
                } else {
                    triggerPromise.catch(console.error);
                }
            }
        } catch (triggerErr) {
            console.error("Trigger error:", triggerErr);
        }

        return new Response(
            JSON.stringify({
                success: true,
                files_analyzed: fileCount,
                next_step: "generating_docs"
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        if (supabase && project_id) {
            await supabase.from("projects").update({ status: "error" }).eq("id", project_id);
        }
        return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

function analyzeCode(content: string, extension: string) {
    const lines = content.split("\n");
    const result = {
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        routes: [],
        complexityScore: 0,
        loopCount: 0,
        conditionalCount: 0,
        maxNestingDepth: 0,
    };

    const isJS = [".js", ".jsx", ".ts", ".tsx"].includes(extension);
    const isPython = extension === ".py";

    let nestingDepth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNum = i + 1;

        if (isJS) {
            const fnMatch = line.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\(.*\)\s*\{)/);
            if (fnMatch) {
                const name = fnMatch[1] || fnMatch[2] || fnMatch[3];
                if (name && !["if", "for", "while", "switch", "catch"].includes(name)) {
                    const params = extractParams(line);
                    (result.functions as any[]).push({ name, line: lineNum, params });
                }
            }
        }
        if (isPython) {
            const pyFnMatch = line.match(/^def\s+(\w+)\s*\(/);
            if (pyFnMatch) {
                const params = extractParams(line);
                (result.functions as any[]).push({ name: pyFnMatch[1], line: lineNum, params });
            }
        }

        if (isJS && line.match(/^class\s+(\w+)/)) {
            const m = line.match(/^class\s+(\w+)/);
            if (m) (result.classes as any[]).push({ name: m[1], line: lineNum });
        }
        if (isPython && line.match(/^class\s+(\w+)/)) {
            const m = line.match(/^class\s+(\w+)/);
            if (m) (result.classes as any[]).push({ name: m[1], line: lineNum });
        }

        if (isJS) {
            const importMatch = line.match(/import\s+.*from\s+['"](.+)['"]/);
            if (importMatch) {
                const names = extractImportNames(line);
                (result.imports as any[]).push({ path: importMatch[1], names });
            }
        }
        if (isPython) {
            const pyImport = line.match(/^(?:from\s+(\S+)\s+)?import\s+(.+)/);
            if (pyImport) {
                (result.imports as any[]).push({ path: pyImport[1] || pyImport[2], names: [] });
            }
        }

        if (isJS) {
            if (line.match(/^export\s+(default\s+)?(function|class|const|let|var)\s+(\w+)/)) {
                const m = line.match(/^export\s+(default\s+)?(function|class|const|let|var)\s+(\w+)/);
                if (m) (result.exports as any[]).push({ name: m[3], type: m[2] });
            }
        }

        const routeMatch = line.match(/\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/);
        if (routeMatch) {
            (result.routes as any[]).push({ method: routeMatch[1].toUpperCase(), path: routeMatch[2] });
        }

        if (line.match(/\bfor\s*\(|\bfor\s+\w+\s+in\b/)) result.loopCount++;
        if (line.match(/\bwhile\s*\(/)) result.loopCount++;
        if (line.match(/\bif\s*\(|\belif\b|\belse\s+if\b/)) result.conditionalCount++;
        if (line.match(/\bswitch\s*\(/)) result.conditionalCount++;

        nestingDepth += (line.match(/{/g) || []).length;
        nestingDepth -= (line.match(/}/g) || []).length;
        result.maxNestingDepth = Math.max(result.maxNestingDepth, nestingDepth);
    }

    result.complexityScore = result.loopCount * 2 + result.conditionalCount + result.maxNestingDepth;
    return result;
}

function extractParams(line: string) {
    const match = line.match(/\(([^)]*)\)/);
    if (!match) return [];
    return match[1].split(",").map((p: string) => p.trim()).filter(Boolean);
}

function extractImportNames(line: string) {
    const match = line.match(/import\s+\{([^}]+)\}/);
    if (match) return match[1].split(",").map((n: string) => n.trim());
    const defaultMatch = line.match(/import\s+(\w+)/);
    if (defaultMatch) return [defaultMatch[1]];
    return [];
}

function resolveImport(importPath: string, files: any[]) {
    const exact = files.find((f: any) => f.file_path === importPath || f.file_path.endsWith(importPath));
    if (exact) return exact.file_path;

    for (const ext of [".js", ".jsx", ".ts", ".tsx", "/index.js", "/index.ts"]) {
        const withExt = files.find((f: any) => f.file_path === importPath + ext || f.file_path.endsWith(importPath + ext));
        if (withExt) return withExt.file_path;
    }
    return null;
}
