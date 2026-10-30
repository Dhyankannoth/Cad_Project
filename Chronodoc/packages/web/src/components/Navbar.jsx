import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Auth from './Auth';
import './Navbar.css';

const Navbar = () => {
    const { user, signOut } = useAuth();
    const [showAuth, setShowAuth] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const location = useLocation();
    const isLanding = location.pathname === '/' && !user;

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 50);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <>
            <nav className={`navbar ${isLanding ? 'navbar-landing' : 'navbar-app'} ${scrolled ? 'scrolled' : ''}`}>
                <Link to={user ? '/dashboard' : '/'} className="nav-logo">DOCFLOW</Link>
                <div className="nav-links">
                    <a href="#features">Features</a>
                    <a href="#how-it-works">How It Works</a>
                    <a href="#testimonials">Testimonials</a>

                    {user ? (
                        <Link to="/dashboard">Dashboard</Link>
                    ) : (
                        <button className="nav-link-btn" onClick={() => setShowAuth(true)}>
                            Dashboard
                        </button>
                    )}

                    {!user ? (
                        <button className="nav-button" onClick={() => setShowAuth(true)}>
                            Join Now
                        </button>
                    ) : (
                        <button className="nav-button" onClick={() => signOut()}>
                            Log Out
                        </button>
                    )}
                </div>
            </nav>
            {showAuth && (
                <Auth onAuthSuccess={() => setShowAuth(false)} onClose={() => setShowAuth(false)} />
            )}
        </>
    );
};

export default Navbar;
