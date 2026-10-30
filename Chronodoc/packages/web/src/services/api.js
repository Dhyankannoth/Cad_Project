import { supabase } from '../supabaseClient';

/**
 * Invokes a Supabase Edge Function.
 * @param {string} functionName - The name of the Edge Function.
 * @param {object} body - The request body to send.
 * @returns {Promise<object>} - The response data.
 */
async function invokeFunction(functionName, body) {
    if (!supabase) {
        console.error(`Supabase Client not initialized while calling ${functionName}`);
        throw new Error('Supabase not configured');
    }

    try {
        console.log(`Invoking Edge Function: ${functionName}`, body);

        const { data, error } = await supabase.functions.invoke(functionName, { body });

        if (error) {
            console.error(`Edge Function Error [${functionName}]:`, error);
            let detail = error.message || 'Unknown Edge Function error';
            let statusCode = error.status || (error.context?.status);

            // Special handling for the distinct Supabase Function error structure
            if (error.context) {
                try {
                    const res = error.context;
                    if (res && typeof res.clone === 'function') {
                        const cloned = res.clone();
                        const contentType = cloned.headers.get('content-type');
                        
                        if (contentType && contentType.includes('application/json')) {
                            const parsed = await cloned.json();
                            detail = parsed.error || parsed.message || JSON.stringify(parsed);
                        } else {
                            detail = await cloned.text() || detail;
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to parse error context for ${functionName}:`, e);
                }
            }

            // Enhanced bypass logic: Include 403 and better condition matching
            const isAuthIssue = 
                detail.toLowerCase().includes('jwt') || 
                detail.toLowerCase().includes('invalid token') || 
                detail.toLowerCase().includes('401') ||
                detail.toLowerCase().includes('403') ||
                statusCode === 401 ||
                statusCode === 403;

            if (isAuthIssue) {
                console.log(`[Diagnostic] Auth issue detected (${statusCode}). Attempting manual fetch bypass for ${functionName}...`);
                try {
                    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                    
                    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/${functionName}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': anonKey,
                            'Authorization': `Bearer ${anonKey}`,
                            'X-Client-Info': 'supabase-js-manual-bypass'
                        },
                        body: JSON.stringify(body)
                    });

                    if (response.ok) {
                        const manualData = await response.json();
                        console.log(`[Diagnostic] Manual bypass SUCCESS for ${functionName}:`, manualData);
                        return manualData;
                    } else {
                        const failText = await response.text();
                        console.error(`[Diagnostic] Manual bypass FAILED (${response.status}):`, failText);
                        
                        // If it's a 429 or 403 from GitHub (passed through), try to parse it
                        try {
                            const parsedFail = JSON.parse(failText);
                            detail = parsedFail.error || parsedFail.message || failText;
                        } catch {
                            detail = failText || detail;
                        }
                    }
                } catch (bypassErr) {
                    console.error(`[Diagnostic] Manual bypass ERROR:`, bypassErr);
                }
            }

            // Better user-facing messages
            if (detail.toLowerCase().includes('rate limit')) {
                detail = `GitHub Rate Limit exceeded. Please add a GITHUB_ACCESS_TOKEN to your Supabase secrets.`;
            } else if (detail.toLowerCase().includes('jwt') || detail.toLowerCase().includes('invalid token')) {
                detail = `${detail} (Typical auth issue. Try reloading the page.)`;
            }

            throw new Error(`${functionName} failed: ${detail}`);
        }

        console.log(`Edge Function Success [${functionName}]:`, data);
        return data;
    } catch (err) {
        console.error(`Invocation Failed [${functionName}]:`, err);
        if (err.message?.includes('Failed to fetch')) {
            throw new Error(`Failed to reach Edge Function "${functionName}". Please ensure functions are deployed: "supabase functions deploy ${functionName}"`);
        }
        throw err;
    }
}

/**
 * Triggers the static analysis pipeline for a project.
 * @param {string} projectId
 */
export async function analyzeProject(projectId) {
    return invokeFunction('analyze-project', { project_id: projectId });
}

/**
 * Triggers AI documentation generation for a project.
 * @param {string} projectId
 */
export async function generateDocs(projectId) {
    return invokeFunction('generate-docs', { project_id: projectId });
}

/**
 * Processes a code change: detects diffs, runs dependency ripple,
 * regenerates affected docs, and creates AI change summary.
 * @param {string} projectId
 * @param {Array<{path: string, content: string}>} changedFiles
 * @param {string} commitMessage
 * @param {string} commitHash
 */
export async function processChange(projectId, changedFiles, commitMessage = '', commitHash = '') {
    return invokeFunction('process-change', {
        project_id: projectId,
        changed_files: changedFiles,
        commit_message: commitMessage,
        commit_hash: commitHash,
    });
}

/**
 * Creates or updates a webhook configuration for a project.
 * @param {string} projectId
 * @param {string[]} branches
 * @returns {Promise<object>}
 */
export async function createWebhook(projectId, branches = ['main']) {
    if (!supabase) throw new Error('Supabase not configured');
    
    // Generate a random secure secret
    const secret = Array.from(crypto.getRandomValues(new Uint8Array(20)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
        
    const { data, error } = await supabase.from('webhooks').upsert({
        project_id: projectId,
        target_branches: branches,
        secret_key: secret,
        is_active: true
    }, { onConflict: 'project_id' }).select().single();
    
    if (error) throw error;
    return data;
}

/**
 * Fetches the webhook configuration for a project.
 * @param {string} projectId
 */
export async function getWebhook(projectId) {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.from('webhooks').select('*').eq('project_id', projectId).maybeSingle();
    if (error) throw error;
    return data;
}

/**
 * Automates the process of creating a webhook on GitHub.
 * Requires a Personal Access Token (PAT).
 * @param {string} owner
 * @param {string} repo
 * @param {string} pat
 * @param {string} payloadUrl
 * @param {string} secret
 */
export async function setupAutoWebhook(owner, repo, pat, payloadUrl, secret) {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
        method: 'POST',
        headers: {
            'Authorization': `token ${pat}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: 'web',
            active: true,
            events: ['push'],
            config: {
                url: payloadUrl,
                content_type: 'json',
                secret: secret,
                insecure_ssl: '0'
            }
        })
    });
    
    if (!resp.ok) {
        const err = await resp.json();
        throw new Error(`GitHub Webhook Setup Failed: ${err.message}`);
    }
    
    return await resp.json();
}

/**
 * Generates a NLP explanation of a module at a specified level.
 * @param {string} fileId
 * @param {'beginner'|'senior'|'interview'} level
 */
export async function explainModule(fileId, level = 'beginner') {
    return invokeFunction('explain-module', { file_id: fileId, level });
}

/**
 * Deletes a project from the database.
 * @param {string} projectId
 */
export async function deleteProject(projectId) {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) throw error;
    return true;
}

/**
 * Exports project documentation in the specified format.
 * @param {string} projectId
 * @param {'readme'|'full'|'onboarding'} format
 */
export async function exportDocs(projectId, format = 'readme') {
    return invokeFunction('export-docs', { project_id: projectId, format });
}

/**
 * Triggers GitHub repository ingestion.
 * @param {string} projectId
 * @param {string} githubUrl
 */
export async function ingestProject(projectId, githubUrl) {
    return invokeFunction('github-ingest', { project_id: projectId, github_url: githubUrl });
}

/**
 * Generates or refines markdown documentation for source code.
 * @param {string} sourceCode
 * @param {string} [feedback]
 * @param {string} [previousMarkdown]
 */
export async function dashboardAi(sourceCode, feedback = '', previousMarkdown = '') {
    return invokeFunction('dashboard-ai', {
        source_code: sourceCode,
        feedback: feedback,
        previous_markdown: previousMarkdown
    });
}

// ============================================
// Collaboration API
// ============================================

/**
 * Sends a collaboration invite to an email.
 * @param {string} projectId
 * @param {string} email
 */
export async function sendInvite(projectId, email) {
    return invokeFunction('send-invite', { project_id: projectId, email });
}

/**
 * Accepts a collaboration invite using a 6-char code.
 * @param {string} code
 */
export async function acceptInvite(code) {
    if (!supabase) throw new Error('Supabase not configured');
    
    const { data, error } = await supabase.rpc('accept_invite_code', {
        p_code: code.trim().toUpperCase()
    });

    if (error) {
        // Postgres RAISE EXCEPTION comes back in error.message
        throw new Error(error.message || 'Failed to accept invite.');
    }

    return { success: true, project_id: data };
}

/**
 * Removes a collaborator from a project.
 * @param {string} projectId
 * @param {string} userId
 */
export async function removeCollaborator(projectId, userId) {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .neq('role', 'owner'); // Safety: never remove the owner
    if (error) throw error;
    return true;
}

/**
 * Gets all collaborators for a project.
 * @param {string} projectId
 */
export async function getCollaborators(projectId) {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
        .from('project_members')
        .select('id, user_id, role, joined_at')
        .eq('project_id', projectId)
        .order('joined_at');
    if (error) throw error;
    return data || [];
}

/**
 * Gets pending invites for a project.
 * @param {string} projectId
 */
export async function getPendingInvites(projectId) {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
        .from('collaboration_invites')
        .select('id, invited_email, invite_code, status, created_at, expires_at')
        .eq('project_id', projectId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

/**
 * Gets the current user's role in a project.
 * @param {string} projectId
 */
export async function getUserRole(projectId) {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', projectId)
        .single();
    if (error) return null;
    return data?.role;
}

/**
 * Revokes a pending invite.
 * @param {string} inviteId
 */
export async function revokeInvite(inviteId) {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase
        .from('collaboration_invites')
        .update({ status: 'revoked' })
        .eq('id', inviteId);
    if (error) throw error;
    return true;
}