import React, { useState, useEffect } from 'react';
import { getWebhook, createWebhook, setupAutoWebhook } from '../services/api';
import './WebhookSetup.css';

const WebhookSetup = ({ project }) => {
    const [webhook, setWebhook] = useState(null);
    const [pat, setPat] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isConfiguring, setIsConfiguring] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });

    const fetchHook = async () => {
        try {
            const data = await getWebhook(project.id);
            setWebhook(data);
        } catch (err) {
            console.error('Failed to fetch webhook:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchHook();
    }, [project.id]);

    const handleGenerate = async () => {
        setIsConfiguring(true);
        try {
            const data = await createWebhook(project.id);
            setWebhook(data);
            setStatus({ type: 'success', message: 'Webhook configuration generated!' });
        } catch (err) {
            setStatus({ type: 'error', message: err.message });
        } finally {
            setIsConfiguring(false);
        }
    };

    const handleAutoSetup = async () => {
        if (!pat) return;
        setIsConfiguring(true);
        setStatus({ type: 'info', message: 'Configuring GitHub webhook...' });
        
        try {
            let currentHook = webhook;
            if (!currentHook) {
                currentHook = await createWebhook(project.id);
                setWebhook(currentHook);
            }

            const repoUrl = project.github_repo_url;
            if (!repoUrl) throw new Error("GitHub repository URL not found. Please ensure this is a GitHub-linked project.");
            
            // Extract owner and repo from URL (e.g., https://github.com/owner/repo)
            // or owners/repo format
            let owner, repo;
            try {
                const cleanUrl = repoUrl.replace(/\/$/, '').replace('.git', '');
                if (cleanUrl.includes('github.com')) {
                    const urlParts = new URL(cleanUrl).pathname.split('/').filter(Boolean);
                    owner = urlParts[0];
                    repo = urlParts[1];
                } else {
                    const parts = cleanUrl.split('/');
                    owner = parts[parts.length - 2];
                    repo = parts[parts.length - 1];
                }
            } catch (e) {
                throw new Error("Invalid GitHub URL format in project settings.");
            }

            if (!owner || !repo) {
                throw new Error("Could not determine repository owner or name from the provided URL.");
            }

            const payloadUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-webhook`;
            
            console.log(`Setting up webhook for ${owner}/${repo}...`);
            await setupAutoWebhook(owner, repo, pat, payloadUrl, currentHook.secret_key);
            
            setStatus({ type: 'success', message: `Successfully connected to ${owner}/${repo}!` });
            setPat('');
            fetchHook();
        } catch (err) {
            console.error('Auto-setup error:', err);
            setStatus({ type: 'error', message: err.message });
        } finally {
            setIsConfiguring(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        // Simple visual feedback could be added here
    };

    if (isLoading) return <div className="webhook-loader">Loading configuration...</div>;

    const payloadUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-webhook`;

    return (
        <div className="webhook-setup">
            <h3 className="webhook-title">Auto-Sync via Webhooks</h3>
            <p className="webhook-description">
                Keep your documentation in sync effortlessly. When you push code to GitHub, 
                DOCFLOW will automatically detect changes, analyze impact, and update your wiki.
            </p>

            {!webhook ? (
                <div className="setup-empty">
                    <button className="configure-btn" onClick={handleGenerate} disabled={isConfiguring}>
                        {isConfiguring ? 'Generating...' : '🛠️ Enable Webhook for this Project'}
                    </button>
                    <p className="help-text" style={{ marginTop: '12px' }}>
                        This will generate a unique secret for secure communication with GitHub.
                    </p>
                </div>
            ) : (
                <>
                    <div className="setup-card">
                        <h4>1. Auto-Configure (Recommended)</h4>
                        <div className="auto-setup-form">
                            <div className="pat-input-group">
                                <label className="info-label">GitHub Personal Access Token</label>
                                <input 
                                    type="password" 
                                    className="pat-input" 
                                    placeholder="ghp_xxxxxxxxxxxx"
                                    value={pat}
                                    onChange={(e) => setPat(e.target.value)}
                                />
                                <p className="help-text">
                                    Requires <code>admin:repo_hook</code> scope. We use this token once to create the hook and do not store it.
                                </p>
                            </div>
                            <button 
                                className="configure-btn" 
                                onClick={handleAutoSetup}
                                disabled={!pat || isConfiguring}
                            >
                                {isConfiguring ? 'Configuring...' : '🚀 Automatic Setup'}
                            </button>
                        </div>
                    </div>

                    <div className="setup-card">
                        <h4>2. Manual Configuration</h4>
                        <div className="info-row">
                            <div className="info-item">
                                <label className="info-label">Payload URL</label>
                                <div className="copy-box">
                                    <code>{payloadUrl}</code>
                                    <button className="copy-btn" onClick={() => copyToClipboard(payloadUrl)}>Copy</button>
                                </div>
                            </div>
                            <div className="info-item">
                                <label className="info-label">Secret</label>
                                <div className="copy-box">
                                    <code>{webhook.secret_key}</code>
                                    <button className="copy-btn" onClick={() => copyToClipboard(webhook.secret_key)}>Copy</button>
                                </div>
                            </div>
                            <div className="info-item">
                                <label className="info-label">Content Type</label>
                                <div className="copy-box">
                                    <code>application/json</code>
                                </div>
                            </div>
                        </div>

                        <button className="guide-toggle" onClick={() => setShowGuide(!showGuide)}>
                            {showGuide ? '▼ Hide Guide' : '▶ How to set this up manually?'}
                        </button>

                        {showGuide && (
                            <div className="guide-content">
                                <div className="guide-step">
                                    <span className="step-num">1</span>
                                    <p>Go to your repository on GitHub and click <strong>Settings</strong>.</p>
                                </div>
                                <div className="guide-step">
                                    <span className="step-num">2</span>
                                    <p>Select <strong>Webhooks</strong> from the left sidebar and click <strong>Add webhook</strong>.</p>
                                </div>
                                <div className="guide-step">
                                    <span className="step-num">3</span>
                                    <p>Paste the <strong>Payload URL</strong> and <strong>Secret</strong> from above.</p>
                                </div>
                                <div className="guide-step">
                                    <span className="step-num">4</span>
                                    <p>Set Content type to <strong>application/json</strong> and ensure "Just the push event" is selected.</p>
                                </div>
                                <div className="guide-step">
                                    <span className="step-num">5</span>
                                    <p>Click <strong>Add webhook</strong>. GitHub will send a test ping to verify the connection.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="webhook-status">
                         {(() => {
                             const lastStatus = webhook.last_status;
                             const hasEvent = !!webhook.last_event_at;
                             
                             if (!webhook.is_active) {
                                 return (
                                     <>
                                         <span className="status-dot inactive" />
                                         <span>Status: <strong>Inactive</strong></span>
                                     </>
                                 );
                             }
                             
                             if (lastStatus === 'connected' || lastStatus === 'success') {
                                 return (
                                     <>
                                         <span className="status-dot active" />
                                         <span>Status: <strong style={{ color: '#00c853' }}>
                                             {lastStatus === 'success' ? '✓ Syncing' : '✓ Connected'}
                                         </strong></span>
                                     </>
                                 );
                             }
                             
                             if (lastStatus === 'error') {
                                 return (
                                     <>
                                         <span className="status-dot" style={{ background: '#ff6b6b' }} />
                                         <span>Status: <strong style={{ color: '#ff6b6b' }}>Last sync failed</strong></span>
                                     </>
                                 );
                             }
                             
                             // No events received yet
                             return (
                                 <>
                                     <span className="status-dot" style={{ background: '#ffc107' }} />
                                     <span>Status: <strong style={{ color: '#ffc107' }}>Waiting for GitHub...</strong></span>
                                     <span className="help-text" style={{ marginLeft: '8px' }}>
                                         Complete the setup above, then GitHub will send a ping to confirm.
                                     </span>
                                 </>
                             );
                         })()}
                         {webhook.last_event_at && (
                             <span className="help-text" style={{ marginLeft: '8px' }}>
                                 | Last Event: {new Date(webhook.last_event_at).toLocaleString()}
                             </span>
                         )}
                    </div>
                </>
            )}

            {status.message && (
                <div className={`status-alert ${status.type}`} style={{ 
                    marginTop: '20px', 
                    padding: '12px', 
                    borderRadius: '8px',
                    background: status.type === 'success' ? 'rgba(0, 128, 128, 0.1)' : 'rgba(217, 83, 79, 0.1)',
                    color: status.type === 'success' ? '#008080' : '#d9534f',
                    border: `1px solid ${status.type === 'success' ? '#008080' : '#d9534f'}`,
                    fontSize: '0.9rem'
                }}>
                    {status.message}
                </div>
            )}
        </div>
    );
};

export default WebhookSetup;
