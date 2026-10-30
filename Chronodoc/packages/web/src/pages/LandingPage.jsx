import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SplineScene from '../components/SplineScene';
import Auth from '../components/Auth';
import StaggerTestimonials from '../components/StaggerTestimonials';
import './LandingPage.css';

const CODE_LINES = [
    '// Step 1: Deep Static Analysis',
    'const graph = await project.analyze();',
    '',
    '// Step 2: AI documentation generation',
    'const wiki = await graph.generateWiki();',
    '',
    '// Step 3: Auto-sync on commit',
    'project.on(\'push\', async (change) => {',
    '    await wiki.update(change.diff);',
    '    console.log(\'Wiki synced: No more stale docs.\');',
    '});',
    '',
    '<html>',
    '  <head>',
    '    <title>Code Wall Effect</title>',
    '    <meta charset="UTF-8">',
    '  </head>',
    '  <body>',
    '    <script>',
    '      function initApp() {',
    '        console.log("Welcome to DOCFLOW");',
    '      }',
    '    </script>',
    '  </body>',
    '</html>',
];

const ScrollingCode = () => {
    const trackRef = useRef(null);

    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        let animationId;
        let position = 0;
        const speed = 0.35;

        const animate = () => {
            position -= speed;
            const halfHeight = track.scrollHeight / 2;
            if (Math.abs(position) >= halfHeight) {
                position = 0;
            }
            track.style.transform = `translateY(${position}px)`;
            animationId = requestAnimationFrame(animate);
        };

        animationId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationId);
    }, []);

    const allLines = [...CODE_LINES, ...CODE_LINES];

    return (
        <div className="scrolling-code-viewport">
            <div className="scrolling-code-track" ref={trackRef}>
                {allLines.map((line, i) => (
                    <div key={i} className="code-line">
                        <span className="line-content">{line || '\u00A0'}</span>
                    </div>
                ))}
            </div>
            <div className="code-fade-top" />
            <div className="code-fade-bottom" />
        </div>
    );
};

const LandingPage = () => {
    const [showAuth, setShowAuth] = useState(false);
    const { user } = useAuth();
    const navigate = useNavigate();

    return (
        <div className="landing-page">
            <section id="hero" className="hero-section">
                <div className="spline-background">
                    <SplineScene
                        scene="https://prod.spline.design/9ueOuv5h3x0TpuIf/scene.splinecode"
                        className="spline-canvas"
                    />
                </div>
                <div className="hero-content">
                    <h1 className="title">Intelligent<br />Documentation</h1>
                    <p className="subtitle pink-accent">Documentation That Evolves With Your Code.</p>
                    <div className="hero-description">
                        No extra setup, just smart automation when you need it.<br />
                        Handle the heavy lifting while you stay in control.
                    </div>
                    {user ? (
                        <button className="cta-button" onClick={() => navigate('/dashboard')}>
                            Go to Dashboard
                        </button>
                    ) : (
                        <button className="cta-button" onClick={() => setShowAuth(true)}>
                            Get Started
                        </button>
                    )}
                </div>
                <div className="scroll-hint">
                    <span>↓</span>
                </div>
            </section>

            <section id="features" className="section features-section">
                <div className="container">
                    <span className="section-tag">Features</span>
                    <h2 className="section-title">Everything You Need to<br />Document Smarter</h2>
                    <p className="section-subtitle">DOCFLOW automates the entire documentation lifecycle — from code analysis to intelligent updates.</p>

                    <div className="features-grid">
                        {[
                            { icon: 'bx-code-alt', title: 'Static Code Analysis', text: 'Automatically extracts functions, classes, imports, and complexity metrics from your codebase. No configuration needed.' },
                            { icon: 'bx-cabinet', title: 'AI-Powered Docs', text: 'Google Gemini generates comprehensive documentation — overviews, function docs, edge cases, and architecture insights.' },
                            { icon: 'bx-refresh', title: 'Change Intelligence', text: 'Detects code changes, maps dependency ripples, and selectively regenerates only affected documentation.' },
                            { icon: 'bx-bar-chart-alt-2', title: 'Dependency Graph', text: 'Visualize module relationships, identify central modules, and detect orphan files across your project.' },
                            { icon: 'bx-message-dots', title: 'NLP Explanations', text: 'Get beginner, senior, or interview-level explanations of any module — tailored to your audience.' },
                            { icon: 'bx-package', title: 'One-Click Export', text: 'Export README files, full documentation, or onboarding guides in perfectly formatted Markdown.' }
                        ].map((f, i) => (
                            <div key={i} className="feature-card" style={{ '--index': i }}>
                                <div className="feature-icon"><i className={`bx ${f.icon}`}></i></div>
                                <h3>{f.title}</h3>
                                <p>{f.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══════ How It Works — Redesigned ═══════ */}
            <section id="how-it-works" className="section howitworks-section">
                <div className="container">
                    <span className="section-tag">How It Works</span>
                    <h2 className="section-title">From Code to Docs in<br />Three Steps</h2>

                    <div className="steps-wrapper">
                        {[
                            { step: '01', title: 'Upload or Connect', text: 'Upload your source files or connect a GitHub repo. We support JavaScript, TypeScript, Python, Go, Rust, and more.' },
                            { step: '02', title: 'Automatic Analysis', text: 'DOCFLOW parses your code, extracts metadata, builds a dependency graph, computes complexity scores, and maps your architecture.' },
                            { step: '03', title: 'AI Documentation', text: 'Gemini generates structured documentation for every file — overviews, function docs, edge cases, and architecture-level insights.' }
                        ].map((s, i) => (
                            <React.Fragment key={i}>
                                <div className="step-card" style={{ '--index': i }}>
                                    <div className="step-number">{s.step}</div>
                                    <h3>{s.title}</h3>
                                    <p>{s.text}</p>
                                </div>
                                {i < 2 && <div className="step-connector"></div>}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══════ Try It Section — Code Wiki Style ═══════ */}
            <section id="try-it" className="tryit-section">
                <div className="tryit-inner">
                    <div className="tryit-left">
                        <div className="tryit-header-row">
                            <h2 className="tryit-title">Try it with<br />your own<br />private<br />repository</h2>
                            <span className="tryit-badge">Coming Soon</span>
                        </div>
                        <p className="tryit-description">
                            Stop documenting. Start understanding. Connect your
                            repository and get a fully interactive Code Wiki that stays
                            perfectly in sync with every change. No more stale docs.
                            Ever.
                        </p>
                        <button className="tryit-cta" disabled>
                            <span className="cta-text">Notify me when available</span>
                            <span className="cta-arrow-circle">
                                <i className='bx bx-right-arrow-alt'></i>
                            </span>
                        </button>
                    </div>
                    <div className="tryit-right">
                        <ScrollingCode />
                    </div>
                </div>
            </section>

            {/* Testimonials Section */}
            <section id="testimonials" className="section testimonials-section">
                <div className="container">
                    <span className="section-tag">Social Proof</span>
                    <h2 className="section-title">Loved by Developers<br />Everywhere</h2>
                    <p className="section-subtitle">Real experiences from teams who transformed their documentation with DOCFLOW.</p>
                </div>
                <StaggerTestimonials />
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                <div className="container footer-inner">
                    <div className="footer-brand">
                        <span className="footer-logo">DOCFLOW</span>
                        <p>Intelligent documentation for modern teams.</p>
                    </div>
                    <div className="footer-links-grid">
                        <div className="footer-col">
                            <h4>Product</h4>
                            <a href="#features">Features</a>
                            <a href="#how-it-works">How It Works</a>
                            <a href="#pricing">Pricing</a>
                        </div>
                        <div className="footer-col">
                            <h4>Legal</h4>
                            <a href="#">Privacy</a>
                            <a href="#">Terms</a>
                            <a href="#">Security</a>
                        </div>
                    </div>
                    <div className="footer-bottom">
                        <span>&copy; 2026 DOCFLOW. All rights reserved.</span>
                    </div>
                </div>
            </footer>

            {showAuth && (
                <Auth onAuthSuccess={() => setShowAuth(false)} onClose={() => setShowAuth(false)} />
            )}
        </div>
    );
};

export default LandingPage;
