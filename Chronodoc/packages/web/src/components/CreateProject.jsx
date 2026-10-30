import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ingestProject, analyzeProject } from '../services/api';
import { Github, UploadCloud } from 'lucide-react';
import './CreateProject.css';

const SUPPORTED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rb', '.rs', '.c', '.cpp', '.h', '.cs', '.php', '.swift', '.kt', '.html'];

const StepIndicator = ({ currentStep }) => (
    <div className="step-indicator">
        {[1, 2, 3].map((step, i) => (
            <React.Fragment key={step}>
                <div className={`step-dot ${currentStep === step ? 'active' : ''} ${currentStep > step ? 'completed' : ''}`}>
                    {currentStep > step ? <i className='bx bx-check'></i> : step}
                </div>
                {i < 2 && <div className={`step-line ${currentStep > step ? 'completed' : ''}`} />}
            </React.Fragment>
        ))}
    </div>
);

const CreateProject = ({ onClose, onCreated, isInline = false }) => {
    const { supabase, user } = useAuth();
    const [currentStep, setCurrentStep] = useState(1);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [sourceType, setSourceType] = useState(null);
    const [githubUrl, setGithubUrl] = useState('');
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingStage, setLoadingStage] = useState(null); // null, 'creating', 'ingesting', 'analyzing', 'generating'
    const [error, setError] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    const handleFiles = (fileList) => {
        const filtered = Array.from(fileList).filter((f) => {
            const ext = '.' + f.name.split('.').pop().toLowerCase();
            return SUPPORTED_EXTENSIONS.includes(ext);
        });
        setFiles((prev) => [...prev, ...filtered]);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragActive(false);
        handleFiles(e.dataTransfer.files);
    };

    const removeFile = (index) => {
        setFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const canProceedStep1 = sourceType !== null;
    const canProceedStep2 = sourceType === 'github' ? githubUrl.trim().length > 0 : files.length > 0;

    const nextStep = () => {
        setError(null);
        if (currentStep < 3) setCurrentStep(currentStep + 1);
    };

    const prevStep = () => {
        setError(null);
        if (currentStep > 1) setCurrentStep(currentStep - 1);
    };

    const handleSubmit = async () => {
        if (!supabase || !user) { setError('Authentication required'); return; }
        if (!name.trim()) { setError('Project name is required'); return; }

        setLoading(true);
        setError(null);

        try {
            console.log(`[Diagnostic] Attempting to create project: "${name}" for user: ${user.id}`);
            
            const { data: project, error: projErr } = await supabase
                .from('projects')
                .insert({
                    user_id: user.id,
                    name: name.trim(),
                    description: description.trim(),
                    source_type: sourceType,
                    github_repo_url: sourceType === 'github' ? githubUrl : null,
                    status: 'pending_analysis',
                })
                .select()
                .single();

            if (projErr) {
                console.error('[Diagnostic] Project Insertion Failed:', projErr);
                if (projErr.code === '42501') {
                    throw new Error(`Permission Denied: New row violates row-level security policy for 'projects'. Please ensure you have run Migration 005 in your Supabase SQL editor.`);
                }
                throw projErr;
            }

            console.log('[Diagnostic] Project created successfully:', project.id);

            if (sourceType === 'upload') {
                setLoadingStage('ingesting');
                for (const file of files) {
                    const content = await file.text();
                    const ext = '.' + file.name.split('.').pop().toLowerCase();
                    const hash = await hashContent(content);

                    const { error: fileErr } = await supabase.from('files').insert({
                        project_id: project.id,
                        file_path: file.webkitRelativePath || file.name,
                        file_name: file.name,
                        extension: ext,
                        content,
                        content_hash: hash,
                        size_bytes: file.size,
                    });
                    if (fileErr) throw fileErr;
                }
                setLoadingStage('analyzing');
                await supabase.from('projects').update({ status: 'analyzing' }).eq('id', project.id);
                await analyzeProject(project.id);
            } else if (sourceType === 'github') {
                setLoadingStage('ingesting');
                await ingestProject(project.id, githubUrl);
                setLoadingStage('analyzing');
                await analyzeProject(project.id);
            }

            setLoadingStage('generating');
            // Wait for internal DB consistency before redirecting
            setTimeout(() => {
                onCreated(project.id);
            }, 1500);
        } catch (err) {
            setError(err.message);
            setLoading(false);
            setLoadingStage(null);
        }
        // Note: we don't set loading false in finally because we want the 
        // transition to the next page to feel continuous if successful.
    };

    const renderStep1 = () => (
        <div className="step-content" key="step1">
            <h2 className="step-title">Choose Your Source</h2>
            <p className="step-subtitle">Where does your code live? Pick a source to get started.</p>
            <div className="source-cards">
                <div
                    className={`source-card-lg ${sourceType === 'github' ? 'selected' : ''}`}
                    onClick={() => setSourceType('github')}
                >
                    <div className="source-icon-lg">
                        <Github size={32} />
                    </div>
                    <span className="source-card-title">GitHub Repository</span>
                    <span className="source-card-desc">Import from a public or private repository</span>
                </div>
                <div
                    className={`source-card-lg ${sourceType === 'upload' ? 'selected' : ''}`}
                    onClick={() => setSourceType('upload')}
                >
                    <div className="source-icon-lg">
                        <UploadCloud size={32} />
                    </div>
                    <span className="source-card-title">Local Upload</span>
                    <span className="source-card-desc">Drag and drop files from your machine</span>
                </div>
            </div>
            <div className="wizard-nav">
                <button className="wizard-nav-back" onClick={onClose}>
                    <i className='bx bx-x'></i> Cancel
                </button>
                <button className="wizard-nav-next" onClick={nextStep} disabled={!canProceedStep1}>
                    Continue <i className='bx bx-right-arrow-alt'></i>
                </button>
            </div>
        </div>
    );

    const renderStep2 = () => (
        <div className="step-content" key="step2">
            <h2 className="step-title">
                {sourceType === 'github' ? 'Connect Repository' : 'Upload Files'}
            </h2>
            <p className="step-subtitle">
                {sourceType === 'github'
                    ? 'Paste the full URL of the GitHub repository you want to document.'
                    : 'Drag and drop your source code files below.'}
            </p>
            <div className="config-section">
                {sourceType === 'github' ? (
                    <>
                        <div className="github-input-wrapper">
                            <i className='bx bxl-github'></i>
                            <input
                                type="url"
                                className="hero-input"
                                placeholder="https://github.com/username/repo"
                                value={githubUrl}
                                onChange={(e) => setGithubUrl(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <span className="input-hint-text">Supports public repositories. Private repo support coming soon.</span>
                    </>
                ) : (
                    <>
                        <div
                            className={`drop-zone-premium ${dragActive ? 'drag-active' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                            onDragLeave={() => setDragActive(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <i className='bx bx-cloud-upload drop-zone-icon'></i>
                            <p>Drag & drop files here, or click to browse</p>
                            <span className="drop-zone-hint">.js .ts .jsx .tsx .py .java .go .rb .rs .c .cpp .cs .php .swift .kt</span>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                onChange={(e) => handleFiles(e.target.files)}
                                style={{ display: 'none' }}
                            />
                        </div>
                        {files.length > 0 && (
                            <>
                                <div className="file-chips">
                                    {files.slice(0, 8).map((f, i) => (
                                        <div key={i} className="file-chip">
                                            <span>{f.name}</span>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(i); }}>&times;</button>
                                        </div>
                                    ))}
                                    {files.length > 8 && (
                                        <div className="file-chip file-chip-more">+{files.length - 8} more</div>
                                    )}
                                </div>
                                <span className="file-count-badge">{files.length} file{files.length > 1 ? 's' : ''} ready</span>
                            </>
                        )}
                    </>
                )}
            </div>
            {error && <div className="wizard-error">{error}</div>}
            <div className="wizard-nav">
                <button className="wizard-nav-back" onClick={prevStep}>
                    <i className='bx bx-left-arrow-alt'></i> Back
                </button>
                <button className="wizard-nav-next" onClick={nextStep} disabled={!canProceedStep2}>
                    Continue <i className='bx bx-right-arrow-alt'></i>
                </button>
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div className="step-content" key="step3">
            <h2 className="step-title">Name & Launch</h2>
            <p className="step-subtitle">Give your project a name and let the AI do the rest.</p>
            <div className="name-section">
                <div className="name-input-wrapper">
                    <input
                        type="text"
                        className="name-input"
                        placeholder="Project Title"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                    />
                </div>
                <textarea
                    className="desc-input"
                    placeholder="Optional: A brief description of the project..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                />
                <button
                    className={`launch-btn ${loading ? 'loading' : ''}`}
                    onClick={handleSubmit}
                    disabled={loading || !name.trim()}
                >
                    {loading ? (
                        <><i className='bx bx-loader-alt bx-spin'></i> Creating Project...</>
                    ) : (
                        <><i className='bx bx-rocket'></i> Create & Generate Docs</>
                    )}
                </button>
            </div>
            {error && <div className="wizard-error">{error}</div>}
            <div className="wizard-nav">
                <button className="wizard-nav-back" onClick={prevStep}>
                    <i className='bx bx-left-arrow-alt'></i> Back
                </button>
                <div></div>
            </div>
        </div>
    );

    const wizardContent = (
        <div className="wizard-container">
            <StepIndicator currentStep={currentStep} />
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}

            {loadingStage && (
                <div className="loading-overlay">
                    <div className="loading-visual">
                        <div className="loading-circle"></div>
                        <div className="loading-icon-center">
                            <i className={`bx ${loadingStage === 'generating' ? 'bx-rocket' : 'bx-cog bx-spin'}`}></i>
                        </div>
                    </div>
                    <div className="loading-stages">
                        <div className={`loading-stage-item ${['creating', 'ingesting', 'analyzing', 'generating'].includes(loadingStage) ? 'completed' : ''} ${loadingStage === 'creating' ? 'active' : ''}`}>
                            <div className="stage-dot-mini"></div>
                            <span className="loading-stage-text">Initializing project...</span>
                        </div>
                        <div className={`loading-stage-item ${['ingesting', 'analyzing', 'generating'].includes(loadingStage) ? 'completed' : ''} ${loadingStage === 'ingesting' ? 'active' : ''}`}>
                            <div className="stage-dot-mini"></div>
                            <span className="loading-stage-text">Ingesting source code...</span>
                        </div>
                        <div className={`loading-stage-item ${['analyzing', 'generating'].includes(loadingStage) ? 'completed' : ''} ${loadingStage === 'analyzing' ? 'active' : ''}`}>
                            <div className="stage-dot-mini"></div>
                            <span className="loading-stage-text">Analyzing structure...</span>
                        </div>
                        <div className={`loading-stage-item ${loadingStage === 'generating' ? 'active' : ''}`}>
                            <div className="stage-dot-mini"></div>
                            <span className="loading-stage-text">Finalizing setup...</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    if (isInline) return wizardContent;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                {wizardContent}
            </div>
        </div>
    );
};

async function hashContent(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default CreateProject;
