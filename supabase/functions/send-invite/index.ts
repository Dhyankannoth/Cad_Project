/// <reference path="../deno.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { 
            status: 204, 
            headers: corsHeaders 
        });
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL"),
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
        );

        // Get the calling user from the authorization header
        const authHeader = req.headers.get("authorization");
        if (!authHeader) throw new Error("Not authenticated");

        const token = authHeader.replace("Bearer ", "");
        const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !caller) throw new Error("Invalid authentication");

        const { project_id, email } = await req.json();
        if (!project_id) throw new Error("project_id required");
        if (!email) throw new Error("email required");

        const normalizedEmail = email.trim().toLowerCase();

        // 1. Verify the caller is the project owner
        const { data: membership } = await supabaseAdmin
            .from("project_members")
            .select("role")
            .eq("project_id", project_id)
            .eq("user_id", caller.id)
            .single();

        if (!membership || membership.role !== "owner") {
            throw new Error("Only the project owner can invite collaborators");
        }

        // 2. Verify the invitee exists in auth.users
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw new Error("Failed to search users");

        const invitee = users.find((u: any) => u.email?.toLowerCase() === normalizedEmail);

        if (!invitee) {
            return new Response(
                JSON.stringify({
                    error: "This email is not registered on DocFlow. Please ask them to sign up first.",
                    code: "USER_NOT_FOUND"
                }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 3. Check if the user is already a member
        const { data: existingMember } = await supabaseAdmin
            .from("project_members")
            .select("id")
            .eq("project_id", project_id)
            .eq("user_id", invitee.id)
            .maybeSingle();

        if (existingMember) {
            return new Response(
                JSON.stringify({
                    error: "This user is already a collaborator on this project.",
                    code: "ALREADY_MEMBER"
                }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 4. Check for existing pending invite
        const { data: existingInvite } = await supabaseAdmin
            .from("collaboration_invites")
            .select("id, invite_code")
            .eq("project_id", project_id)
            .eq("invited_email", normalizedEmail)
            .eq("status", "pending")
            .maybeSingle();

        if (existingInvite) {
            return new Response(
                JSON.stringify({
                    success: true,
                    invite_code: existingInvite.invite_code,
                    message: "An invite already exists for this user. Share the code below."
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 5. Generate a 6-character alphanumeric code
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No O/0/1/I/l for clarity
        let inviteCode = "";
        const randomValues = new Uint8Array(6);
        crypto.getRandomValues(randomValues);
        for (const byte of randomValues) {
            inviteCode += chars[byte % chars.length];
        }

        // 6. Insert the invite
        const { data: project } = await supabaseAdmin
            .from("projects")
            .select("name")
            .eq("id", project_id)
            .single();

        const { error: insertError } = await supabaseAdmin
            .from("collaboration_invites")
            .insert({
                project_id,
                invited_by: caller.id,
                invited_email: normalizedEmail,
                invited_user_id: invitee.id,
                invite_code: inviteCode,
                status: "pending"
            });

        if (insertError) throw new Error(`Failed to create invite: ${insertError.message}`);

        // 7. Send the email via Resend (optional, if API key exists)
        const resendKey = Deno.env.get("RESEND_API_KEY");
        let emailSent = false;
        
        if (resendKey) {
            try {
                const res = await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${resendKey}`,
                    },
                    body: JSON.stringify({
                        from: "DocFlow <onboarding@resend.dev>", // Replace with verified domain in prod
                        to: normalizedEmail,
                        subject: `Invitation to collaborate on ${project?.name || "a project"}`,
                        html: `
                            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                                <h1 style="color: #008080;">DocFlow Collaboration</h1>
                                <p>Hello,</p>
                                <p><strong>${caller.email}</strong> has invited you to collaborate on the project <strong>"${project?.name || "DocFlow Project"}"</strong>.</p>
                                <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                                    <p style="margin-bottom: 10px; color: #666;">Use this 6-character code to join:</p>
                                    <h2 style="font-family: monospace; font-size: 32px; letter-spacing: 5px; color: #008080; margin: 0;">${inviteCode}</h2>
                                </div>
                                <p>To accept this invitation:</p>
                                <ol>
                                    <li>Log in to your DocFlow account.</li>
                                    <li>Go to the <strong>Join Project</strong> section (or visit /invite).</li>
                                    <li>Enter the code above.</li>
                                </ol>
                                <p style="font-size: 12px; color: #888; margin-top: 30px;">
                                    If you didn't expect this invitation, you can safely ignore this email.
                                </p>
                            </div>
                        `,
                    }),
                });
                
                if (res.ok) {
                    emailSent = true;
                    console.log(`Email sent successfully to ${normalizedEmail}`);
                } else {
                    const errTxt = await res.text();
                    console.error(`Resend API Error [${res.status}]:`, errTxt);
                }
            } catch (err: any) {
                console.error("Fetch error to Resend:", err.message);
            }
        } else {
            console.warn("RESEND_API_KEY not found in environment variables.");
        }

        return new Response(
            JSON.stringify({
                success: true,
                invite_code: inviteCode,
                project_name: project?.name || "Unknown",
                invited_email: normalizedEmail,
                email_sent: emailSent,
                message: emailSent 
                    ? `Invite sent to ${normalizedEmail}! They can also use the code below.` 
                    : `Invite created! Share this code with ${normalizedEmail}: ${inviteCode}`
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        return new Response(
            JSON.stringify({ error: err?.message || "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
