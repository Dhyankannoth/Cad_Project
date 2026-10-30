import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import ProjectView from './pages/ProjectView';
import AcceptInvite from './pages/AcceptInvite';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

const ProtectedRoute = ({ children }) => {
    const { user, loading } = useAuth();
    if (loading) return <div className="page-loader"><div className="loader-ring"></div></div>;
    if (!user) return <Navigate to="/" replace />;
    return children;
};

const AuthenticatedLayout = () => {
    const { user } = useAuth();
    // This check might be redundant if AuthenticatedLayout is always wrapped by ProtectedRoute,
    // but it's included as per the instruction.
    if (!user) return <Navigate to="/" replace />;

    return (
        <div className="authenticated-layout">
            <Sidebar />
            <div className="app-content-wrapper">
                <main className="app-main-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

const AppRouter = () => {
    const { user } = useAuth();

    return (
        <BrowserRouter>
            <Routes>
                {/* Public Route */}
                <Route path="/" element={
                    <>
                        <Navbar />
                        <LandingPage />
                    </>
                } />

                {/* Protected App Routes */}
                <Route element={<ProtectedRoute><AuthenticatedLayout /></ProtectedRoute>}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/project/:id" element={<ProjectView />} />
                    <Route path="/project/:id/:tab" element={<ProjectView />} />
                    <Route path="/invite" element={<AcceptInvite />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
};

export default AppRouter;
