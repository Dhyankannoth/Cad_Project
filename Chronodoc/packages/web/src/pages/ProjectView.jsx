import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import FileExplorer from '../components/FileExplorer';
import DocViewer from '../components/DocViewer';
import ChangeLog from '../components/ChangeLog';
import WebhookSetup from '../components/WebhookSetup';
import CollaboratorPanel from '../components/CollaboratorPanel';
import { getUserRole } from '../services/api';
import './ProjectView.css';

const statusColors = {
    pending_analysis: '#666',
    analyzing: '#f0ad4e',
    generating_docs: '#5bc0de',
    ready: '#008080',
    updating: '#f0ad4e',
    error: '#d9534f',
};

const getStatusColor = (status) => {
    if (status.startsWith('generating_docs')) return statusColors.generating_docs;
    return statusColors[status] || '#666';
};

const TABS = ['docs', 'files', 'changes', 'team', 'settings'];

const ProjectView = () => {
    const { id, tab } = useParams();
    const navigate = useNavigate();
    const { supabase, user } = useAuth();
    const [project, setProject] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [activeTab, setActiveTab] = useState(tab || 'docs');
    const [loading, setLoading] = useState(true);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [presence, setPresence] = useState({});
    const [userRole, setUserRole] = useState(null);

    const fetchProject = async () => {
        if (!supabase) return;
        const { data } = await supabase.from('projects').select('*').eq('id', id).single();
        if (data) setProject(data);

        const { data: metricsData } = await supabase.from('project_metrics').select('*').eq('project_id', id).maybeSingle();
        if (metricsData) setMetrics(metricsData);

        // Fetch user's role
        const role = await getUserRole(id);
        setUserRole(role);

        setLoading(false);
    };

    useEffect(() => {
        fetchProject();

        if (!supabase || !user) return;

        // Realtime subscription for project status
        const projectChannel = supabase
            .channel(`project-${id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'projects',
                filter: `id=eq.${id}`,
            }, (payload) => {
                setProject(prev => ({ ...prev, ...payload.new }));
            })
            .subscribe();

        // Realtime subscription for metrics
        const metricsChannel = supabase
            .channel(`metrics-${id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'project_metrics',
                filter: `project_id=eq.${id}`,
            }, (payload) => {
                setMetrics(payload.new);
            })
            .subscribe();

        // Presence Channel
        const presenceChannel = supabase.channel(`presence-${id}`, {
            config: { presence: { key: user.id } }
        });

        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                setPresence(presenceChannel.presenceState());
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                console.log('join', key, newPresences);
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                console.log('leave', key, leftPresences);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({
                        online_at: new Date().toISOString(),
                        email: user.email,
                        user_id: user.id
                    });
                }
            });

        return () => {
            supabase.removeChannel(projectChannel);
            supabase.removeChannel(metricsChannel);
            supabase.removeChannel(presenceChannel);
        };
    }, [id, user?.id]);

    useEffect(() => {
        if (tab && TABS.includes(tab)) setActiveTab(tab);
    }, [tab]);

    const handleRegenerate = async () => {
        if (isRegenerating) return;
        setIsRegenerating(true);
        try {
            const { generateDocs } = await import('../services/api');
            await generateDocs(id);
        } catch (err) {
            console.error('Manual regeneration failed:', err);
        } finally {
            setIsRegenerating(false);
        }
    };

    const switchTab = (t) => {
        setActiveTab(t);
        navigate(`/project/${id}/${t}`, { replace: true });
    };

    if (loading) return <div className="page-loader"><div className="loader-ring"></div></div>;
    if (!project) return <div className="project-error"><h2>Project not found</h2><Link to="/dashboard">Back to Dashboard</Link></div>;

    const isProcessing = project.status === 'analyzing' ||
        project.status.startsWith('generating_docs') ||
        project.status === 'updating';

    // Presence avatars info
    const activeUsers = Object.values(presence).flat();

    return (
        <div className={`project-page ${(activeTab === 'docs' || activeTab === 'files') ? 'full-bleed' : ''}`}>
            <div className="project-header">
                <div className="header-main">
                    <Link to="/dashboard" className="back-link">
                        <i className='bx bx-left-arrow-alt'></i> Dashboard
                    </Link>
                    <div className="title-row">
                        <h1 className="project-name">{project.name}</h1>
                        <span
                            className={`status-badge-lg ${project.status}`}
                            style={{
                                background: getStatusColor(project.status) + '22',
                                color: getStatusColor(project.status),
                                borderColor: getStatusColor(project.status)
                            }}
                        >
                            {project.status.startsWith('generating_docs') ? 'generating docs' : project.status.replace('_', ' ')}
                            {isProcessing && <span className="status-pulse" />}
                        </span>
                        {project.status.includes('(') && (
                            <span className="status-progress-text">{project.status.match(/\(([^)]+)\)/)[0]}</span>
                        )}
                    </div>
                    {project.description && <p className="project-description">{project.description}</p>}
                </div>

                <div className="header-actions">
                    <div className="presence-indicators">
                        {activeUsers.slice(0, 3).map((u, i) => (
                            <div 
                                key={u.user_id} 
                                className="presence-avatar" 
                                style={{ zIndex: 10 - i }}
                                title={u.email}
                            >
                                {(u.email || '?')[0].toUpperCase()}
                            </div>
                        ))}
                        {activeUsers.length > 3 && (
                            <div className="presence-avatar more" title={`${activeUsers.length - 3} more users`}>
                                +{activeUsers.length - 3}
                            </div>
                        )}
                    </div>
                    <button
                        className={`action-btn regenerate-btn ${isProcessing ? 'disabled' : ''}`}
                        onClick={handleRegenerate}
                        disabled={isProcessing || isRegenerating}
                    >
                        <i className={`bx ${isRegenerating || isProcessing ? 'bx-loader-alt bx-spin' : 'bx-refresh'}`}></i>
                        {isRegenerating ? 'Triggering...' : isProcessing ? 'Processing...' : 'Regenerate Docs'}
                    </button>
                </div>
            </div>

            <div className="tab-bar">
                {TABS.map((t) => (
                    <button
                        key={t}
                        className={`tab-btn ${activeTab === t ? 'active' : ''}`}
                        onClick={() => switchTab(t)}
                    >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                ))}
            </div>

            <div className="tab-content">

                {activeTab === 'files' && <FileExplorer projectId={id} onExit={() => setActiveTab('overview')} />}
                {activeTab === 'docs' && <DocViewer projectId={id} onExit={() => switchTab('files')} />}
                {activeTab === 'changes' && <ChangeLog projectId={id} />}
                {activeTab === 'team' && <CollaboratorPanel projectId={id} userRole={userRole} />}
                {activeTab === 'settings' && <WebhookSetup project={project} />}
            </div>
        </div>
    );
};

export default ProjectView;
