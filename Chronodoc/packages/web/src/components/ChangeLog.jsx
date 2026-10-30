import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    GitCommit, 
    Calendar, 
    Hash, 
    FileCode, 
    AlertCircle, 
    ShieldCheck, 
    CheckCircle2,
    Clock,
    Layers,
    ChevronRight,
    Terminal
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './ChangeLog.css';

const riskColors = {
    low: { text: '#00c853', bg: 'rgba(0, 200, 83, 0.1)', border: 'rgba(0, 200, 83, 0.3)', icon: ShieldCheck },
    medium: { text: '#f0ad4e', bg: 'rgba(240, 173, 78, 0.1)', border: 'rgba(240, 173, 78, 0.3)', icon: AlertCircle },
    high: { text: '#d9534f', bg: 'rgba(217, 83, 79, 0.1)', border: 'rgba(217, 83, 79, 0.3)', icon: AlertCircle },
    critical: { text: '#ff0040', bg: 'rgba(255, 0, 64, 0.1)', border: 'rgba(255, 0, 64, 0.3)', icon: AlertCircle },
};

const ChangeLog = ({ projectId }) => {
    const { supabase } = useAuth();
    const [commits, setCommits] = useState([]);
    const [selectedCommit, setSelectedCommit] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCommits();
    }, [projectId]);

    const fetchCommits = async () => {
        if (!supabase) return;
        const { data } = await supabase
            .from('commits')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });
        setCommits(data || []);
        setLoading(false);
    };

    const selectCommit = async (commit) => {
        setSelectedCommit(commit);
        if (!supabase) return;
        const { data } = await supabase
            .from('change_analysis')
            .select('*')
            .eq('commit_id', commit.id)
            .single();
        setAnalysis(data);
    };

    if (loading) return (
        <div className="page-loader" style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
            <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="loader-ring"
                style={{ width: '40px', height: '40px', border: '3px solid rgba(0,128,128,0.1)', borderTopColor: '#008080', borderRadius: '50%' }}
            />
            <p style={{ color: '#666', fontSize: '0.9rem', letterSpacing: '0.05em' }}>ANALYZING RECENT COMMITS...</p>
        </div>
    );

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="changelog"
        >
            <div className="commit-list-panel">
                <h3 className="panel-title">Repository Activity</h3>
                {commits.length === 0 ? (
                    <p className="no-commits">No commits tracked yet</p>
                ) : (
                    <motion.div 
                        initial="hidden"
                        animate="show"
                        variants={{
                            show: { transition: { staggerChildren: 0.05 } }
                        }}
                        className="commit-list"
                    >
                        {commits.map((c) => (
                            <motion.button
                                variants={{
                                    hidden: { opacity: 0, x: -10 },
                                    show: { opacity: 1, x: 0 }
                                }}
                                key={c.id}
                                className={`commit-item ${selectedCommit?.id === c.id ? 'active' : ''}`}
                                onClick={() => selectCommit(c)}
                            >
                                <div className="commit-msg">
                                    {c.message || 'No message'}
                                </div>
                                <div className="commit-meta">
                                    <span className="commit-hash">
                                        <Hash size={12} style={{ marginRight: '4px', opacity: 0.5 }} />
                                        {c.commit_hash?.substring(0, 7) || '—'}
                                    </span>
                                    <span className="commit-date">
                                        <Clock size={12} style={{ marginRight: '4px', opacity: 0.5 }} />
                                        {new Date(c.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </motion.button>
                        ))}
                    </motion.div>
                )}
            </div>

            <div className="commit-detail">
                <AnimatePresence mode="wait">
                    {!selectedCommit ? (
                        <motion.div 
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="detail-empty"
                        >
                            <Terminal size={48} style={{ marginBottom: '1.5rem', opacity: 0.2 }} />
                            <p>Select a commit from the sidebar<br/>to view the AI analysis report.</p>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key={selectedCommit.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div className="commit-header">
                                <h2>{selectedCommit.message || 'Commit Details'}</h2>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <code className="full-hash">
                                        <GitCommit size={14} />
                                        {selectedCommit.commit_hash || 'LOCAL_SYNC'}
                                    </code>
                                    <span className="commit-date" style={{ color: '#666', fontSize: '0.9rem' }}>
                                        <Calendar size={14} style={{ marginRight: '6px' }} />
                                        {new Date(selectedCommit.created_at).toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            {selectedCommit.changed_files?.length > 0 && (
                                <section className="change-section">
                                    <h3><FileCode size={18} /> Changed Files</h3>
                                    <div className="changed-files-list">
                                        {selectedCommit.changed_files.map((f, i) => (
                                            <span key={i} className="changed-file">{f}</span>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {analysis ? (
                                <>
                                    <section className="change-section">
                                        <h3><CheckCircle2 size={18} /> AI Summary</h3>
                                        <p>{analysis.summary}</p>
                                    </section>

                                    {analysis.impact_explanation && (
                                        <section className="change-section">
                                            <h3><Layers size={18} /> Impact Analysis</h3>
                                            <p>{analysis.impact_explanation}</p>
                                        </section>
                                    )}

                                    {analysis.risk_level && (
                                        <div 
                                            className="risk-badge" 
                                            style={{ 
                                                color: riskColors[analysis.risk_level]?.text, 
                                                backgroundColor: riskColors[analysis.risk_level]?.bg,
                                                borderColor: riskColors[analysis.risk_level]?.border 
                                            }}
                                        >
                                            {React.createElement(riskColors[analysis.risk_level]?.icon || AlertCircle, { size: 16 })}
                                            Risk: {analysis.risk_level.toUpperCase()}
                                        </div>
                                    )}

                                    {analysis.affected_files?.length > 0 && (
                                        <section className="change-section">
                                            <h3><AlertCircle size={18} /> Affected Dependencies</h3>
                                            <div className="changed-files-list">
                                                {analysis.affected_files.map((f, i) => (
                                                    <span key={i} className="affected-file">{f}</span>
                                                ))}
                                            </div>
                                        </section>
                                    )}
                                </>
                            ) : (
                                <div className="no-analysis">
                                    <AlertCircle size={24} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                    <p>AI analysis is still processing or unavailable for this commit.</p>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};

export default ChangeLog;
