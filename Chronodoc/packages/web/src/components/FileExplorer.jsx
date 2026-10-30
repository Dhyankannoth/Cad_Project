import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Search, Plus, ChevronRight, ChevronDown, 
    FileText, FileCode, FileJson, FileType, 
    Folder, FolderOpen, MoreVertical, 
    Terminal, Settings, LayoutGrid, List,
    X, Minimize2, Maximize2
} from 'lucide-react';
import { TreeViewDemo } from './ui/tree-folder-structure';
import { createTreeCollection } from "@chakra-ui/react";
import './FileExplorer.css';

const FileExplorer = ({ projectId, onExit }) => {
    const { supabase } = useAuth();
    const [files, setFiles] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [activeFile, setActiveFile] = useState(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    useEffect(() => {
        fetchFiles();

        if (!supabase) return;

        const channel = supabase
            .channel(`files-grid-${projectId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'files',
                filter: `project_id=eq.${projectId}`
            }, () => {
                fetchFiles();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [projectId]);

    const fetchFiles = async () => {
        if (!supabase) return;
        const { data } = await supabase
            .from('files')
            .select('id, file_path, file_name, extension, size_bytes, content, updated_at')
            .eq('project_id', projectId)
            .order('file_path');
        setFiles(data || []);
        setLoading(false);
    };

    // Build tree structure for the Chakra TreeView
    const chakraTreeCollection = useMemo(() => {
        if (!files.length) return null;

        const buildTree = (files) => {
            const root = { id: 'root', name: 'Project', children: [] };
            const nodesMap = { 'root': root };

            files.forEach(file => {
                const parts = file.file_path.split('/');
                let currentPath = 'root';
                
                parts.forEach((part, index) => {
                    const isLast = index === parts.length - 1;
                    const parentPath = currentPath;
                    currentPath = `${parentPath}/${part}`;

                    if (!nodesMap[currentPath]) {
                        const newNode = {
                            id: currentPath,
                            name: part,
                            ...(isLast ? { ...file } : { children: [] })
                        };
                        nodesMap[currentPath] = newNode;
                        nodesMap[parentPath].children.push(newNode);
                    }
                });
            });

            return root.children;
        };

        const treeData = buildTree(files);
        return createTreeCollection({
            nodeToValue: (node) => node.id,
            nodeToString: (node) => node.name,
            rootNode: { id: 'ROOT', name: '', children: treeData }
        });
    }, [files]);

    const filteredFiles = useMemo(() => {
        if (!searchQuery) return files;
        return files.filter(f => 
            f.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.file_path.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [files, searchQuery]);



    const handleOpenFile = (file) => {
        setActiveFile(file);
        setIsEditorOpen(true);
    };

    if (loading) return <div className="page-loader"><div className="loader-ring"></div></div>;

    return (
        <div className="grid-explorer-container">
            <div className="explorer-sidebar">
                <div className="sidebar-header">
                    <span className="folder-label"><FileText size={16} /> File</span>
                </div>
                <div className="tree-navigation">
                    {chakraTreeCollection && (
                        <TreeViewDemo 
                            collection={chakraTreeCollection} 
                            onSelect={(node, isBranch) => {
                                if (!isBranch) handleOpenFile(node);
                            }}
                        />
                    )}
                </div>
            </div>

            <main className="explorer-main">
                <header className="explorer-header">
                    <div className="header-info">
                        <div className="title-group">
                            {onExit && (
                                <button className="exit-btn" onClick={onExit} title="Back to Project">
                                    <i className='bx bx-left-arrow-alt'></i>
                                    <span>Back to Project</span>
                                </button>
                            )}
                            <h2 className="explorer-title">
                                <span className="brand-text">DocFlow</span> Files: Grid Explorer View
                            </h2>
                        </div>
                    </div>
                    <div className="header-actions">
                        <div className="search-wrapper">
                            <Search className="search-icon" size={18} />
                            <input 
                                type="text" 
                                placeholder="Search files..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </header>

                <div className="files-grid">
                    {filteredFiles.map((file) => (
                        <FileCard key={file.id} file={file} onClick={() => handleOpenFile(file)} />
                    ))}
                    {filteredFiles.length === 0 && (
                        <div className="empty-search">
                            <p>No files found matching "{searchQuery}"</p>
                        </div>
                    )}
                </div>

                <AnimatePresence>
                    {isEditorOpen && activeFile && (
                        <EditorPanel 
                            file={activeFile} 
                            onClose={() => setIsEditorOpen(false)} 
                        />
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
};



const FileCard = ({ file, onClick }) => {
    const snippet = useMemo(() => {
        if (!file.content) return '';
        return file.content.split('\n').slice(0, 5).join('\n');
    }, [file.content]);

    return (
        <div className="file-card" onClick={onClick}>
            <div className="card-header">
                <FileIcon extension={file.extension} size={24} className="lang-icon" />
                <span className="file-name">{file.file_name}</span>
                <MoreVertical size={16} className="meta-dots" />
            </div>
            <div className="card-preview">
                <pre><code>{snippet}</code></pre>
            </div>
            <div className="card-footer">
                <div className="footer-meta">
                    <span className="last-edit">Last Edit: {formatDate(file.updated_at)}</span>
                    <span className="file-size">Size: {formatSize(file.size_bytes)}</span>
                </div>
            </div>
        </div>
    );
};

const EditorPanel = ({ file, onClose }) => {
    return (
        <motion.div 
            className="editor-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <motion.div 
                className="editor-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
                <div className="editor-header">
                    <div className="editor-title">
                        <FileIcon extension={file.extension} size={20} />
                        <span>{file.file_name}</span>
                        <span className="filePath">{file.file_path}</span>
                    </div>
                    <div className="editor-controls">
                        <button className="control-btn minimize" onClick={onClose} title="Minimize">
                            <Minimize2 size={18} />
                        </button>
                        <button className="control-btn close" onClick={onClose} title="Close">
                            <X size={18} />
                        </button>
                    </div>
                </div>
                <div className="editor-content">
                    <pre className="code-editor">
                        <code>{file.content}</code>
                    </pre>
                </div>
                <div className="editor-status">
                    <span>UTF-8</span>
                    <span>{file.extension?.toUpperCase() || 'TEXT'}</span>
                    <span>Line 1, Column 1</span>
                </div>
            </motion.div>
        </motion.div>
    );
};

const FileIcon = ({ extension, size = 18, className = "" }) => {
    switch (extension?.toLowerCase()) {
        case '.py': return <Terminal size={size} className={`icon-py ${className}`} />;
        case '.js': case '.jsx': return <FileCode size={size} className={`icon-js ${className}`} />;
        case '.ts': case '.tsx': return <FileCode size={size} className={`icon-ts ${className}`} />;
        case '.json': return <FileJson size={size} className={`icon-json ${className}`} />;
        case '.yaml': case '.yml': return <Settings size={size} className={`icon-yaml ${className}`} />;
        case '.css': return <FileType size={size} className={`icon-css ${className}`} />;
        default: return <FileText size={size} className={`icon-default ${className}`} />;
    }
};

const formatSize = (bytes) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    return (bytes / 1024).toFixed(1) + ' KB';
};

const formatDate = (dateString) => {
    if (!dateString) return '2 hours ago'; // Mock fallback
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
};

export default FileExplorer;


