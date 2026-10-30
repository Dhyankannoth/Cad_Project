import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import CreateProject from '../components/CreateProject';
import { ingestProject, deleteProject, analyzeProject, dashboardAi } from '../services/api';
import { Component as EtheralShadow } from '../components/ui/etheral-shadow';
import './Dashboard.css';

const Dashboard = () => {
    const { supabase, user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);

    const [sourceCode, setSourceCode] = useState('');
    const [generatedWiki, setGeneratedWiki] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [refineFeedback, setRefineFeedback] = useState('');
    const [isRefining, setIsRefining] = useState(false);

    const textareaRef = useRef(null);

    const handleGenerate = async () => {
        if (!sourceCode.trim() || isGenerating) return;
        setIsGenerating(true);
        try {
            const result = await dashboardAi(sourceCode);
            if (result && result.markdown) {
                setGeneratedWiki(result.markdown);
            }
        } catch (err) {
            console.error('Generation failed:', err);
            setGeneratedWiki(`**Error:** ${err.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRefine = async () => {
        if (!refineFeedback.trim() || !generatedWiki || isRefining) return;
        setIsRefining(true);
        try {
            const result = await dashboardAi(sourceCode, refineFeedback, generatedWiki);
            if (result && result.markdown) {
                setGeneratedWiki(result.markdown);
                setRefineFeedback('');
            }
        } catch (err) {
            console.error('Refinement failed:', err);
        } finally {
            setIsRefining(false);
        }
    };

    useEffect(() => {
        if (location.search.includes('create=true')) {
            setShowCreate(true);
        } else {
            setShowCreate(false);
        }
        setLoading(false);
    }, [location.search]);

    if (loading) return <div className="page-loader"><div className="loader-ring"></div></div>;

    if (showCreate) {
        return (
            <div className="dashboard-page">
                <div className="inline-creation-wrapper">
                    <CreateProject
                        isInline={true}
                        onClose={() => navigate('/dashboard')}
                        onCreated={(projectId) => navigate(`/project/${projectId}`)}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-page workspace-mode">
            {/* Etheral Shadow Background */}
            <div className="shader-bg">
                <EtheralShadow
                    color="rgba(128, 128, 128, 1)"
                    animation={{ scale: 100, speed: 90 }}
                    noise={{ opacity: 1, scale: 1.2 }}
                    sizing="fill"
                />
            </div>

            <header className="workspace-header">
                <div className="header-left">
                    <span className="workspace-tag">AI WORKSPACE</span>
                    <h1 className="workspace-title">Documentation Editor</h1>
                </div>
                <div className="header-actions">
                    <button
                        className={`action-btn generate-btn ${isGenerating ? 'loading' : ''}`}
                        onClick={handleGenerate}
                        disabled={isGenerating || !sourceCode.trim()}
                    >
                        <i className={`bx ${isGenerating ? 'bx-loader-alt bx-spin' : 'bx-zap'}`}></i>
                        {isGenerating ? 'Generating...' : 'Generate Wiki'}
                    </button>
                    <button className="action-btn secondary-btn" onClick={() => navigate('/invite')}>
                        <i className='bx bx-user-plus'></i>
                        Join Project
                    </button>
                    <button className="action-btn secondary-btn" onClick={() => navigate('/dashboard?create=true')}>
                        <i className='bx bx-plus'></i>
                        New Pipeline
                    </button>
                </div>
            </header>

            <main className="workbench-container">
                <div className="split-pane">
                    <div className="pane source-pane">
                        <div className="pane-header">
                            <div className="pane-label">
                                <i className='bx bx-code-alt'></i>
                                SOURCE CODE
                            </div>
                            <div className="pane-meta">
                                {sourceCode.length} CHARS
                            </div>
                        </div>
                        <div className="editor-wrapper">
                            <textarea
                                ref={textareaRef}
                                className="code-textarea"
                                placeholder="Paste your source code here..."
                                value={sourceCode}
                                onChange={(e) => setSourceCode(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="pane wiki-pane">
                        <div className="pane-header">
                            <div className="pane-label">
                                <i className='bx bx-file'></i>
                                GENERATED WIKI
                                <span className="editable-badge">EDITABLE</span>
                            </div>
                        </div>
                        <div className="preview-wrapper markdown-body">
                            {generatedWiki ? (
                                <ReactMarkdown>{generatedWiki}</ReactMarkdown>
                            ) : (
                                <div className="preview-empty">
                                    <p>Documentation will appear here...</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="refine-bar-container">
                    <div className="refine-bar">
                        <input
                            type="text"
                            className="refine-input"
                            placeholder="E.g., 'Make it more senior-level' or 'Correct the parameters table'..."
                            value={refineFeedback}
                            onChange={(e) => setRefineFeedback(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                        />
                        <button
                            className={`refine-btn ${isRefining ? 'loading' : ''}`}
                            onClick={handleRefine}
                            disabled={isRefining || !refineFeedback.trim() || !generatedWiki}
                        >
                            {isRefining ? (
                                <i className='bx bx-loader-alt bx-spin'></i>
                            ) : (
                                'Refine Doc'
                            )}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
