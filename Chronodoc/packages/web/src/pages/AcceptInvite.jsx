import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { acceptInvite } from '../services/api';
import './AcceptInvite.css';

const AcceptInvite = () => {
    const navigate = useNavigate();
    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const inputRefs = useRef([]);

    const containerVariants = {
        hidden: { opacity: 0, y: 15 },
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                duration: 0.5,
                staggerChildren: 0.08,
                ease: [0.23, 1, 0.32, 1]
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0 }
    };

    const handleChange = (index, value) => {
        const char = value.toUpperCase().slice(-1);
        const newCode = [...code];
        newCode[index] = char;
        setCode(newCode);

        if (char && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
        const newCode = Array(6).fill('');
        for (let i = 0; i < pastedData.length; i++) {
            newCode[i] = pastedData[i];
        }
        setCode(newCode);
        const focusIndex = Math.min(pastedData.length, 5);
        inputRefs.current[focusIndex]?.focus();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const stringCode = code.join('');
        if (stringCode.length < 6 || loading) return;
        setLoading(true);
        setError(null);

        try {
            const result = await acceptInvite(stringCode);
            setSuccess(result.project_id);
            setTimeout(() => navigate(`/project/${result.project_id}`), 1800);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="accept-invite-page">
            <motion.div 
                className="invite-card"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                <motion.div className="invite-icon-wrap" variants={itemVariants}>
                    <div className="icon-vibe">
                        <i className='bx bx-key'></i>
                    </div>
                </motion.div>

                <motion.h1 variants={itemVariants}>Join Project</motion.h1>
                <motion.p className="invite-desc" variants={itemVariants}>
                    Enter your 6-character invite code to access the workspace.
                </motion.p>

                <AnimatePresence mode="wait">
                    {success ? (
                        <motion.div 
                            key="success"
                            className="success-state"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                        >
                            <div className="success-icon">
                                <i className='bx bx-check-double'></i>
                            </div>
                            <h3>Access Granted</h3>
                            <p>You're in! Redirecting to workspace…</p>
                        </motion.div>
                    ) : (
                        <motion.form 
                            key="form"
                            onSubmit={handleSubmit} 
                            className="code-form"
                            variants={itemVariants}
                        >
                            <div className="code-input-group">
                                {code.map((digit, index) => (
                                    <motion.input
                                        key={index}
                                        ref={el => inputRefs.current[index] = el}
                                        type="text"
                                        className="code-input-box"
                                        placeholder="•"
                                        value={digit}
                                        onChange={(e) => handleChange(index, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(index, e)}
                                        onPaste={handlePaste}
                                        maxLength={1}
                                        autoFocus={index === 0}
                                        whileFocus={{ scale: 1.05 }}
                                    />
                                ))}
                            </div>

                            {error && (
                                <motion.div 
                                    className="invite-error"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                >
                                    <i className='bx bx-error-circle'></i>
                                    {error}
                                </motion.div>
                            )}

                            <motion.button 
                                type="submit" 
                                className="join-btn" 
                                disabled={loading || code.join('').length < 6}
                                whileTap={{ scale: 0.97 }}
                                transition={{ duration: 0.1 }}
                            >
                                {loading ? (
                                    <span className="joining-loader">
                                        <i className='bx bx-loader-alt bx-spin'></i> Joining...
                                    </span>
                                ) : (
                                    'Access Project'
                                )}
                            </motion.button>
                        </motion.form>
                    )}
                </AnimatePresence>

                <motion.div className="invite-footer" variants={itemVariants}>
                    <p>Need access? Contact the project owner for a code.</p>
                </motion.div>
            </motion.div>
        </div>
    );
};

export default AcceptInvite;
