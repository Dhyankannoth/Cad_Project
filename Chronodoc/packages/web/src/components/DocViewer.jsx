import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import mermaid from 'mermaid';
import './DocViewer.css';

mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    fontFamily: 'Inter, sans-serif',
});

const DocViewer = ({ projectId, onExit }) => {
    const { supabase } = useAuth();
    const [docs, setDocs] = useState([]);
    const [files, setFiles] = useState([]);
    const [filteredItems, setFilteredItems] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    
    // Interactive State
    const [isRefining, setIsRefining] = useState(false);
    const [refinePrompt, setRefinePrompt] = useState('');
    const [editingSection, setEditingSection] = useState(null); // { docId, field }
    const [editContent, setEditContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const contentRef = useRef(null);

    const fetchData = async () => {
        if (!supabase) return;
        
        // Fetch files for the project
        const { data: fileData, error: fileErr } = await supabase
            .from('files')
            .select('id, file_path, file_name')
            .eq('project_id', projectId)
            .order('file_path');

        if (fileErr) {
            console.error('Error fetching files:', fileErr);
            return;
        }

        // Fetch documentation sections
        const { data: docData, error: docErr } = await supabase
            .from('documentation_sections')
            .select('*')
            .eq('project_id', projectId);

        if (docErr) {
            console.error('Error fetching docs:', docErr);
            return;
        }

        const currentFiles = fileData || [];
        const currentDocs = docData || [];
        
        setFiles(currentFiles);
        setDocs(currentDocs);
        
        if (currentFiles.length > 0 && !selectedId) {
            // Find the first file that has docs, or just the first file
            const firstWithDoc = currentFiles.find(f => currentDocs.some(d => d.file_id === f.id));
            setSelectedId(firstWithDoc?.id || currentFiles[0].id);
        }
        
        setLoading(false);

        // Wait for render, then parse mermaid
        setTimeout(() => {
            mermaid.run({
                querySelector: '.language-mermaid',
            }).catch(e => console.error("Mermaid parsing error", e));
        }, 100);
    };

    useEffect(() => {
        fetchData();

        if (!supabase) return;

        // Subscribe to docs
        const docsChannel = supabase
            .channel(`docs-${projectId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'documentation_sections',
                filter: `project_id=eq.${projectId}`
            }, () => {
                fetchData();
            })
            .subscribe();

        // Subscribe to files (for immediate sidebar updates)
        const filesChannel = supabase
            .channel(`files-viewer-${projectId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'files',
                filter: `project_id=eq.${projectId}`
            }, () => {
                fetchData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(docsChannel);
            supabase.removeChannel(filesChannel);
        };
    }, [projectId]);

    useEffect(() => {
        if (searchQuery.trim() === '') {
            setFilteredItems(files);
        } else {
            const query = searchQuery.toLowerCase();
            const filtered = files.filter(file =>
                file.file_name.toLowerCase().includes(query) ||
                file.file_path.toLowerCase().includes(query)
            );
            setFilteredItems(filtered);
        }
    }, [searchQuery, files]);

    // Scroll Spy Logic for Files
    useEffect(() => {
        const handleScroll = () => {
            let currentActiveId = null;

            for (const file of files) {
                const doc = docs.find(d => d.file_id === file.id);
                if (!doc) continue;

                const element = document.getElementById(`doc-${doc.id}`);
                if (element) {
                    const rect = element.getBoundingClientRect();
                    if (rect.top <= 250 && rect.bottom >= 250) {
                        currentActiveId = file.id;
                        break;
                    }
                }
            }
            if (currentActiveId && selectedId !== currentActiveId) {
                setSelectedId(currentActiveId);
            }
        };

        const container = contentRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            return () => container.removeEventListener('scroll', handleScroll);
        }
    }, [docs, files, selectedId]);

    const scrollToDoc = (fileId) => {
        setSelectedId(fileId);
        const doc = docs.find(d => d.file_id === fileId);
        if (!doc) return;

        const element = document.getElementById(`doc-${doc.id}`);
        if (element && contentRef.current) {
            const offset = 40;
            const elementPosition = element.offsetTop;

            contentRef.current.scrollTo({
                top: elementPosition - offset,
                behavior: 'smooth'
            });
        }
    };

    const handleRefine = async () => {
        if (!refinePrompt.trim() || isRefining || !selectedId) return;
        
        const currentFile = files.find(f => f.id === selectedId);
        const currentDoc = docs.find(d => d.file_id === selectedId);
        if (!currentFile) return;

        setIsRefining(true);
        try {
            const { dashboardAi } = await import('../services/api');
            
            // Get source code for context
            const { data: fileData } = await supabase
                .from('files')
                .select('content')
                .eq('id', selectedId)
                .single();
            
            const result = await dashboardAi(
                fileData.content,
                refinePrompt,
                JSON.stringify(currentDoc)
            );

            if (result && result.markdown) {
                // In a real scenario, the edge function would return structured data
                // For now, we assume it updates the DB or we parse it
                // Since our edge function 'dashboard-ai' exists, we'll call it
                setRefinePrompt('');
            }
        } catch (err) {
            console.error('Refinement failed:', err);
        } finally {
            setIsRefining(false);
        }
    };

    const startEditing = (docId, field, initialValue) => {
        setEditingSection({ docId, field });
        setEditContent(initialValue || '');
    };

    const saveManualEdit = async () => {
        if (!editingSection || isSaving) return;
        setIsSaving(true);
        try {
            const { docId, field } = editingSection;
            const { error } = await supabase
                .from('documentation_sections')
                .update({ [field]: editContent })
                .eq('id', docId);

            if (error) throw error;
            
            // Local update for immediate feedback
            setDocs(prev => prev.map(d => d.id === docId ? { ...d, [field]: editContent } : d));
            setEditingSection(null);
        } catch (err) {
            console.error('Save failed:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleExport = (format) => {
        if (!docs.length) return;
        setIsExporting(true);
        let content = '';

        if (format === 'readme') {
            content = `# Project Documentation\n\nGenerated by DOCFLOW\n\n`;
            docs.forEach((doc) => {
                content += `## ${doc.files?.file_name || 'Unknown'}\n\n${doc.overview || ''}\n\n`;
            });
        } else if (format === 'full') {
            docs.forEach((doc) => {
                content += `# ${doc.files?.file_path || 'Unknown'}\n\n`;
                content += `## Overview\n${doc.overview || 'No overview'}\n\n`;
                if (doc.function_docs?.length) {
                    content += `## Functions\n`;
                    doc.function_docs.forEach((fn) => {
                        content += `### ${fn.name}\n${fn.description || ''}\n\n`;
                    });
                }
                if (doc.complexity_notes) content += `## Complexity\n${doc.complexity_notes}\n\n`;
                content += '---\n\n';
            });
        }

        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = format === 'readme' ? 'README.md' : 'full-documentation.md';
        a.click();
        URL.revokeObjectURL(url);

        setTimeout(() => setIsExporting(false), 1000);
    };

    if (loading) return <div className="page-loader"><div className="loader-ring"></div></div>;

    return (
        <div className="doc-viewer-modern">
            {/* Sidebar - Level 2 Navigation mirroring the professional docs style */}
            <aside className="doc-sidebar">
                <div className="doc-sidebar-header">
                    <div className="category-label">NAVIGATION</div>
                    <button className="nav-back-btn" onClick={onExit}>
                        <i className='bx bx-arrow-back'></i>
                        Back to Dashboard
                    </button>
                </div>
                
                <div className="sidebar-search">
                    <i className='bx bx-search'></i>
                    <input
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="category-label">DOCUMENTATION</div>
                {filteredItems.length === 0 ? (
                    <div className="no-docs-item">No files found</div>
                ) : (
                    <nav className="doc-nav">
                        {filteredItems.map((file) => {
                            const hasDoc = docs.some(d => d.file_id === file.id);
                            return (
                                <button
                                    key={file.id}
                                    className={`nav-item ${selectedId === file.id ? 'active' : ''} ${hasDoc ? 'has-doc' : 'pending-doc'}`}
                                    onClick={() => scrollToDoc(file.id)}
                                >
                                    <span className="nav-indicator"></span>
                                    <span className="nav-text">{file.file_name}</span>
                                    {!hasDoc && <span className="generating-dot" title="Generating documentation..."></span>}
                                </button>
                            );
                        })}
                    </nav>
                )}

                <div className="sidebar-footer">
                    <button onClick={() => handleExport('full')} className="export-link" disabled={isExporting || docs.length === 0}>
                        Export Full Documentation
                    </button>
                </div>
            </aside>

            {/* Main Content Region */}
            <div className="doc-main-region">
                <div className="doc-content" ref={contentRef}>
                    {files.length === 0 ? (
                        <div className="doc-empty">
                            <div className="doc-placeholder-icon">📖</div>
                            <h3>Ready for documentation</h3>
                            <p>Upload files or connect GitHub to see them here.</p>
                        </div>
                    ) : docs.length === 0 ? (
                        <div className="doc-empty processing-state">
                            <div className="doc-placeholder-icon pulse">✨</div>
                            <h3>Generating Documentation...</h3>
                            <p>We've received your {files.length} code files. Our AI is currently analyzing their structure and generating professional documentation articles.</p>
                            <div className="generation-progress">
                                <div className="progress-bar-flat">
                                    <div className="progress-fill-infinite"></div>
                                </div>
                                <span>Analyzing architecture & patterns</span>
                            </div>
                        </div>
                    ) : (
                        <div className="docs-continuous-scroll">
                            {docs.map((doc) => (
                                <article className="doc-article" key={doc.id} id={`doc-${doc.id}`}>
                                    <header className="doc-content-header">
                                        <h2 className="doc-title">{doc.files?.file_name}</h2>
                                        <span className="doc-path-subtitle">{doc.files?.file_path}</span>
                                    </header>

                                    {doc.overview && (
                                        <section className="doc-section editable-region">
                                            <div className="section-header">
                                                <h3>Overview</h3>
                                                <button className="edit-toggle" onClick={() => startEditing(doc.id, 'overview', doc.overview)}>
                                                    <i className='bx bx-edit-alt'></i>
                                                </button>
                                            </div>
                                            {editingSection?.docId === doc.id && editingSection.field === 'overview' ? (
                                                <div className="inline-editor">
                                                    <textarea 
                                                        value={editContent} 
                                                        onChange={(e) => setEditContent(e.target.value)}
                                                        rows={10}
                                                    />
                                                    <div className="editor-actions">
                                                        <button onClick={saveManualEdit} disabled={isSaving}>Save</button>
                                                        <button onClick={() => setEditingSection(null)}>Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="markdown-body">
                                                    <ReactMarkdown>{doc.overview}</ReactMarkdown>
                                                </div>
                                            )}
                                        </section>
                                    )}

                                    {doc.architecture_role && (
                                        <section className="doc-section editable-region">
                                            <div className="section-header">
                                                <h3>Architecture Role</h3>
                                                <button className="edit-toggle" onClick={() => startEditing(doc.id, 'architecture_role', doc.architecture_role)}>
                                                    <i className='bx bx-edit-alt'></i>
                                                </button>
                                            </div>
                                            {editingSection?.docId === doc.id && editingSection.field === 'architecture_role' ? (
                                                <div className="inline-editor">
                                                    <textarea 
                                                        value={editContent} 
                                                        onChange={(e) => setEditContent(e.target.value)}
                                                        rows={6}
                                                    />
                                                    <div className="editor-actions">
                                                        <button onClick={saveManualEdit} disabled={isSaving}>Save</button>
                                                        <button onClick={() => setEditingSection(null)}>Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="markdown-body">
                                                    <ReactMarkdown>{doc.architecture_role}</ReactMarkdown>
                                                </div>
                                            )}
                                        </section>
                                    )}

                                    {doc.function_docs?.length > 0 && (
                                        <section className="doc-section">
                                            <h3>Functions & Logic</h3>
                                            <div className="fn-grid">
                                                {doc.function_docs.map((fn, i) => (
                                                    <div key={i} className="fn-doc item-glass">
                                                        <h4><code>{fn.name}</code></h4>
                                                        <div className="markdown-body">
                                                            <ReactMarkdown>{fn.description}</ReactMarkdown>
                                                        </div>
                                                        <div className="fn-meta">
                                                            {fn.params && <span className="fn-tag"><strong>params</strong> {fn.params}</span>}
                                                            {fn.returns && <span className="fn-tag"><strong>returns</strong> {fn.returns}</span>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}

                                    {doc.edge_cases?.length > 0 && (
                                        <section className="doc-section">
                                            <h3>Edge Cases</h3>
                                            <ul className="edge-list">
                                                {doc.edge_cases.map((ec, i) => (
                                                    <li key={i}>
                                                        <ReactMarkdown components={{ p: React.Fragment }}>{ec}</ReactMarkdown>
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}

                                    {doc.complexity_notes && (
                                        <section className="doc-section">
                                            <h3>Complexity & Performance</h3>
                                            <div className="markdown-body">
                                                <ReactMarkdown>{doc.complexity_notes}</ReactMarkdown>
                                            </div>
                                        </section>
                                    )}

                                    <hr className="doc-separator" />
                                </article>
                            ))}
                        </div>
                    )}
                </div>

                {/* AI Refinement Bar */}
                <div className="doc-refine-container">
                    <div className="doc-refine-bar">
                        <i className='bx bx-wand'></i>
                        <input 
                            type="text" 
                            placeholder={`Refine documentation for ${files.find(f => f.id === selectedId)?.file_name || 'this file'}...`}
                            value={refinePrompt}
                            onChange={(e) => setRefinePrompt(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                        />
                        <button 
                            className={`refine-btn ${isRefining ? 'loading' : ''}`}
                            onClick={handleRefine}
                            disabled={isRefining || !refinePrompt.trim()}
                        >
                            {isRefining ? <i className='bx bx-loader-alt bx-spin'></i> : 'Refine'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DocViewer;
