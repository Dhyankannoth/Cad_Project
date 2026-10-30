/// <reference path="../deno.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-auth, connection, accept, origin, referer, user-agent",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPPORTED_EXTENSIONS = [
    ".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".go", ".rb", ".rs",
    ".c", ".cpp", ".h", ".cs", ".php", ".swift", ".kt", ".html", ".css", ".json", ".md"
];

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!supabaseUrl || !supabaseKey) {
            console.error("Missing Supabase environment variables");
            throw new Error("Server configuration error: Supabase credentials missing");
        }

        console.log(`Supabase Client initializing... (Key length: ${supabaseKey.length})`);
        const supabase = createClient(supabaseUrl, supabaseKey);

        const body = await req.json();
        const { project_id, github_url } = body;
        if (!project_id || !github_url) throw new Error("project_id and github_url required");

        console.log(`Starting ingestion: Project=${project_id}, URL=${github_url}`);

        // 1. Parse GitHub URL
        let owner, repo;
        try {
            // Normalize URL: remove trailing slashes and .git suffix
            const normalizedUrl = github_url.replace(/\/$/, "").replace(/\.git$/, "");
            const url = new URL(normalizedUrl);
            const pathParts = url.pathname.split("/").filter(Boolean);
            owner = pathParts[0];
            repo = pathParts[1];
        } catch (e) {
            const parts = github_url.replace(/\/$/, "").replace(/\.git$/, "").split("/");
            repo = parts.pop();
            owner = parts.pop();
        }

        if (!owner || !repo) throw new Error(`Invalid GitHub URL structure: ${github_url}`);
        console.log(`GitHub Target: ${owner}/${repo}`);

        const githubToken = Deno.env.get("GITHUB_ACCESS_TOKEN");
        const headers: Record<string, string> = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "DOCFLOW-Ingest",
        };

        // Only set Authorization if token looks valid
        if (githubToken && githubToken !== "undefined" && githubToken.trim() !== "") {
            headers["Authorization"] = `token ${githubToken}`;
            console.log("Using GITHUB_ACCESS_TOKEN");
        } else {
            console.log("No GITHUB_ACCESS_TOKEN provided, using unauthenticated requests (Rate limited to 60/hr)");
        }

        // 2. Fetch Repo Metadata
        console.log(`Checking repository: https://github.com/${owner}/${repo}`);
        const repoResp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });

        if (!repoResp.ok) {
            const errorText = await repoResp.text();
            console.error(`GitHub API Error (${repoResp.status}) during Metadata fetch: ${errorText}`);

            if (repoResp.status === 404) {
                throw new Error(`Repository "${owner}/${repo}" not found. If this is a private repository, ensure you have set the GITHUB_ACCESS_TOKEN secret in Supabase.`);
            }
            if (repoResp.status === 403 || repoResp.status === 401) {
                const isRateLimit = repoResp.headers.get("x-ratelimit-remaining") === "0";
                if (isRateLimit) {
                    throw new Error("GitHub API Rate Limit exceeded. This usually happens for public requests (limit 60/hr). To fix this, add a GITHUB_ACCESS_TOKEN secret to your Supabase project.");
                }
                throw new Error(`GitHub API Access Denied (${repoResp.status}). Please check your GITHUB_ACCESS_TOKEN secret in Supabase.`);
            }
            throw new Error(`GitHub API Error: ${repoResp.status} - ${errorText}`);
        }

        const repoData = await repoResp.json();
        const defaultBranch = repoData.default_branch || "main";
        console.log(`Successfully reached repo. Default branch: ${defaultBranch}, Private: ${repoData.private}`);

        if (repoData.private && !githubToken) {
            console.warn("Detected private repository but no GITHUB_ACCESS_TOKEN set. Subsequent file fetches may fail.");
        }

        // 3. Process Ingestion
        console.log(`Fetching file tree...`);
        const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`;
        const treeResp = await fetch(treeUrl, { headers });

        if (!treeResp.ok) {
            const errorMsg = await treeResp.text();
            throw new Error(`Failed to fetch file tree (Status: ${treeResp.status}) - ${errorMsg}`);
        }

        const treeData = await treeResp.json();
        const filesToIngest = treeData.tree.filter((item) => {
            if (item.type !== "blob") return false;
            const dotIndex = item.path.lastIndexOf(".");
            if (dotIndex === -1) return false;
            const ext = item.path.slice(dotIndex).toLowerCase();
            return SUPPORTED_EXTENSIONS.includes(ext);
        }).slice(0, 200); // Increased batch size

        console.log(`Found ${treeData.tree.length} total items, filtered to ${filesToIngest.length} ingestible files.`);

        let count = 0;
        let skippedRateLimit = false;

        for (const item of filesToIngest) {
            try {
                const contentResp = await fetch(item.url, { headers });
                
                if (contentResp.status === 403) {
                    const rateLimitRemaining = contentResp.headers.get("x-ratelimit-remaining");
                    if (rateLimitRemaining === "0") {
                        console.error("GitHub Rate Limit Exceeded!");
                        skippedRateLimit = true;
                        break; // Stop processing further files
                    }
                }

                if (!contentResp.ok) {
                    console.warn(`Failed to fetch ${item.path}: ${contentResp.status}`);
                    continue;
                }

                const blobData = await contentResp.json();
                const base64 = blobData.content.replace(/\n/g, "");
                const content = decodeBase64(base64);

                const dotIndex = item.path.lastIndexOf(".");
                const ext = item.path.slice(dotIndex).toLowerCase();
                const hash = await hashContent(content);

                console.log(`Upserting ${item.path}...`);
                const { error: upsertError } = await supabase.from("files").upsert({
                    project_id,
                    file_path: item.path,
                    file_name: item.path.split("/").pop(),
                    extension: ext,
                    content,
                    content_hash: hash,
                    size_bytes: blobData.size,
                }, { onConflict: "project_id,file_path" });

                if (upsertError) {
                    console.error(`DB Upsert Error for ${item.path}:`, upsertError.message);
                    if (upsertError.message.includes("jwt")) throw new Error(`Database JWT Error: ${upsertError.message}`);
                } else {
                    count++;
                }
            } catch (fileErr) {
                console.error(`Error processing ${item.path}:`, fileErr.message);
                if (fileErr.message.includes("JWT")) throw fileErr;
            }
        }

        console.log(`Files ingested: ${count}`);

        if (count > 0) {
            console.log(`Finalizing status for ${project_id}...`);
            const { error: updateError } = await supabase.from("projects").update({ status: "analyzing" }).eq("id", project_id);
            if (updateError) console.error("Final status update error:", updateError.message);
        } else {
            console.warn(`No files were ingested for project ${project_id}. Check if the repo is empty or filters are too strict.`);
        }

        return new Response(JSON.stringify({
            success: true,
            files_ingested: count,
            branch: defaultBranch,
            total_filtered: filesToIngest.length,
            rate_limit_hit: skippedRateLimit,
            batch_limit: 200
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (err) {
        console.error("INGEST_CATCH:", err);
        return new Response(JSON.stringify({
            error: err.message || "Unknown error",
            details: "Check Supabase Edge Function logs for details"
        }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

function decodeBase64(s) {
    const binString = atob(s);
    const bytes = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
}

async function hashContent(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
