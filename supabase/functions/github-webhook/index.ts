/// <reference path="../deno.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Verifies the GitHub webhook signature.
 * @param secret - The webhook secret.
 * @param header - The x-hub-signature-256 header value.
 * @param payload - The raw request body as string.
 */
async function verifySignature(secret: string, header: string, payload: string): Promise<boolean> {
    if (!header || !secret) return false;
    
    // GitHub signature is 'sha256=HEX_SIGNATURE'
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
    );
    
    const signatureHex = header.replace("sha256=", "");
    const signature = new Uint8Array(
        signatureHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );
    
    return await crypto.subtle.verify(
        "HMAC",
        key,
        signature,
        encoder.encode(payload)
    );
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // 1 — Get Raw Payload for Verification
        const signatureHeader = req.headers.get("x-hub-signature-256");
        const githubEvent = req.headers.get("x-github-event");
        const bodyText = await req.text();
        const payload = JSON.parse(bodyText);

        // 1.5 — Handle GitHub Ping Event (sent when webhook is first created)
        if (githubEvent === "ping") {
            console.log("Received GitHub ping event:", payload.zen);
            
            // Try to find and update the webhook by the hook's config URL or repo
            const repoFullName = payload.repository?.full_name;
            if (repoFullName) {
                // Find the project matching this repo
                const { data: project } = await supabase
                    .from("projects")
                    .select("id")
                    .eq("name", repoFullName)
                    .single();

                if (project) {
                    await supabase.from("webhooks").update({
                        last_event_at: new Date().toISOString(),
                        last_status: "connected",
                        github_repo_id: payload.repository?.id || null,
                    }).eq("project_id", project.id);
                }
            }

            return new Response(JSON.stringify({ 
                success: true, 
                message: "Pong! Webhook connected successfully.",
                zen: payload.zen 
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // 2 — Identify Project & Webhook Config
        // The payload usually contains repository info. We'll find a project matching the repo.
        const repoId = payload.repository?.id;
        const repoFullName = payload.repository?.full_name; // e.g., "owner/repo"

        if (!repoFullName) throw new Error("Missing repository information in payload");

        // Lookup webhook by repository ID or full name
        const { data: webhook, error: webhookError } = await supabase
            .from("webhooks")
            .select("*, projects(id, name, status)")
            .or(`github_repo_id.eq.${repoId},projects(name.eq.${repoFullName})`)
            .single();

        if (webhookError || !webhook) {
            console.warn(`No webhook configured for repo: ${repoFullName}`);
            return new Response(JSON.stringify({ error: "No configured project found for this repository" }), { status: 404 });
        }

        // 3 — Verify Signature
        const isVerified = await verifySignature(webhook.secret_key, signatureHeader || "", bodyText);
        if (!isVerified) {
            console.error(`Invalid signature for webhook ${webhook.id}`);
            return new Response("Invalid signature", { status: 401 });
        }

        // 4 — Process Push Event
        const ref = payload.ref; // e.g., "refs/heads/main"
        const branch = ref.replace("refs/heads/", "");
        
        if (!webhook.target_branches.includes(branch)) {
            console.log(`Ignoring push to branch '${branch}' (Tracked branches: ${webhook.target_branches.join(",")})`);
            return new Response("Branch not tracked", { status: 200 });
        }

        const commits = payload.commits || [];
        if (commits.length === 0) {
            return new Response("No commits found", { status: 200 });
        }

        // 5 — Aggregate Changed Files
        // Iterate through all commits in the push event
        const addedFiles = new Set<string>();
        const modifiedFiles = new Set<string>();
        const removedFiles = new Set<string>();

        commits.forEach((commit: any) => {
            commit.added?.forEach((f: string) => addedFiles.add(f));
            commit.modified?.forEach((f: string) => modifiedFiles.add(f));
            commit.removed?.forEach((f: string) => removedFiles.add(f));
        });

        const totalChanged = [...addedFiles, ...modifiedFiles];
        const projectId = webhook.project_id;

        console.log(`Webhook triggered for project ${projectId}. Aggregated changes: ${totalChanged.length} files.`);

        // 6 — Trigger AI Processing (Call internal process-change function)
        // We will fetch the actual file contents from GitHub
        const githubToken = Deno.env.get("GITHUB_ACCESS_TOKEN");
        const filesWithContent = [];

        for (const filePath of totalChanged) {
             const url = `https://api.github.com/repos/${repoFullName}/contents/${filePath}?ref=${branch}`;
             const resp = await fetch(url, {
                 headers: {
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "DOCFLOW-Webhook",
                    ...(githubToken ? { "Authorization": `token ${githubToken}` } : {})
                 }
             });
             
             if (resp.ok) {
                 const data = await resp.json();
                 const content = atob(data.content.replace(/\n/g, ""));
                 filesWithContent.push({ path: filePath, content });
             }
        }

        // Call our existing internal processing logic
        // For simplicity, we trigger the process-change function via loopback or direct call logic
        // Here we'll just invoke our own internal function (refactored) or call via fetch
        const processChangeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-change`;
        const processResp = await fetch(processChangeUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
            },
            body: JSON.stringify({
                project_id: projectId,
                changed_files: filesWithContent,
                commit_message: payload.head_commit?.message || `Aggregated sync of ${commits.length} commits`,
                commit_hash: payload.after
            })
        });

        const result = await processResp.json();

        // Update Webhook Status
        await supabase.from("webhooks").update({
            last_event_at: new Date().toISOString(),
            last_status: processResp.ok ? "success" : "error"
        }).eq("id", webhook.id);

        return new Response(JSON.stringify({
            success: true,
            project_id: projectId,
            branch: branch,
            commits: commits.length,
            files: totalChanged.length,
            ai_processing: result
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (err: any) {
        console.error("WEBHOOK_ERROR:", err);
        return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
