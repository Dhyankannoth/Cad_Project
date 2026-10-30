import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { deleteProject } from '../services/api';
import './Sidebar.css';

const statusColors = {
    pending_analysis: '#666',
    analyzing: '#f0ad4e',
    generating_docs: '#5bc0de',
    ready: '#008080',
    updating: '#f0ad4e',
    error: '#d9534f',
};

const Sidebar = () => {
    const { supabase, user, signOut } = useAuth();
    const [projects, setProjects] = useState([]);
    const [activeMenu, setActiveMenu] = useState(null);
    const [collapsed, setCollapsed] = useState(false);
    const [showLogout, setShowLogout] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    // Close menu on click outside
    useEffect(() => {
        const handleClickOutside = () => setActiveMenu(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    const fetchRecentProjects = async () => {
        if (!supabase || !user) return;
        // Fetch projects where the user is a member (owner or collaborator)
        const { data: memberRows, error: memberError } = await supabase
            .from('project_members')
            .select('project_id, role')
            .eq('user_id', user.id);
        
        if (memberError || !memberRows?.length) {
            setProjects([]);
            return;
        }

        const projectIds = memberRows.map(r => r.project_id);
        const roleMap = Object.fromEntries(memberRows.map(r => [r.project_id, r.role]));

        const { data, error } = await supabase
            .from('projects')
            .select('id, name, status, user_id')
            .in('id', projectIds)
            .order('updated_at', { ascending: false })
            .limit(10);
        
        if (!error) {
            setProjects((data || []).map(p => ({ ...p, memberRole: roleMap[p.id] })));
        }
    };

    useEffect(() => {
        fetchRecentProjects();

        if (!supabase || !user) return;
        const channel = supabase
            .channel('sidebar-realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'projects',
                filter: `user_id=eq.${user.id}`,
            }, () => fetchRecentProjects())
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [user?.id]);

    const handleDelete = async (e, projectId, projectName) => {
        e.preventDefault();
        e.stopPropagation();
        setActiveMenu(null);

        if (window.confirm(`Are you sure you want to delete "${projectName}"?`)) {
            try {
                await deleteProject(projectId);
                fetchRecentProjects();
                if (location.pathname.includes(projectId)) {
                    navigate('/dashboard');
                }
            } catch (err) {
                console.error('Sidebar deletion failed:', err);
            }
        }
    };

    const toggleMenu = (e, projectId) => {
        e.preventDefault();
        e.stopPropagation();
        setActiveMenu(activeMenu === projectId ? null : projectId);
    };

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
                {!collapsed && (
                    <Link to="/" className="sidebar-brand">DOCFLOW</Link>
                )}
                <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
                    {collapsed ? <i className='bx bx-chevron-left'></i> : <i className='bx bx-chevron-right'></i>}
                </button>
            </div>

            <nav className="sidebar-nav">
                <div className="nav-group">
                    <h4 className="section-header">GENERAL</h4>
                    <Link to="/dashboard" className={`nav-item ${location.pathname === '/dashboard' && !location.search.includes('create=true') ? 'active' : ''}`}>
                        <i className={`bx bx-grid-alt nav-icon`}></i>
                        {!collapsed && <span className="nav-label">Dashboard</span>}
                    </Link>
                    <Link to="/dashboard?create=true" className={`nav-item ${location.search.includes('create=true') ? 'active' : ''}`}>
                        <i className={`bx bx-plus-circle nav-icon`}></i>
                        {!collapsed && <span className="nav-label">New Project</span>}
                    </Link>
                    <Link to="/invite" className={`nav-item ${location.pathname === '/invite' ? 'active' : ''}`}>
                        <i className={`bx bx-user-plus nav-icon`}></i>
                        {!collapsed && <span className="nav-label">Join Project</span>}
                    </Link>
                </div>
            </nav>

            <div className="sidebar-section">
                {!collapsed && <h4 className="section-header">RECENTS</h4>}
                <div className="recent-projects">
                    {projects.map((project) => (
                        <div key={project.id} className="project-item-container">
                            <Link
                                to={`/project/${project.id}`}
                                className={`project-link ${location.pathname.includes(project.id) ? 'active' : ''}`}
                                title={project.name}
                            >
                                <i className='bx bx-folder project-icon'></i>
                                {!collapsed && (
                                    <div className="project-name-wrapper">
                                        <span className="project-name-sidebar">{project.name}</span>
                                        {project.memberRole === 'member' && (
                                            <span className="shared-badge" title="Shared with you">👥</span>
                                        )}
                                        {project.status !== 'ready' && (
                                            <span className="status-dot-mini" style={{ background: statusColors[project.status] }}></span>
                                        )}
                                    </div>
                                )}
                            </Link>
                            
                            {!collapsed && (
                                <div className="project-actions-wrapper">
                                    <button 
                                        className={`menu-trigger ${activeMenu === project.id ? 'active' : ''}`}
                                        onClick={(e) => toggleMenu(e, project.id)}
                                    >
                                        <i className='bx bx-dots-vertical-rounded'></i>
                                    </button>
                                    
                                    {activeMenu === project.id && (
                                        <div className="project-dropdown-menu">
                                            <Link to={`/project/${project.id}/team`} className="dropdown-item" onClick={() => setActiveMenu(null)}>
                                                <i className='bx bx-group'></i> Collaborators
                                            </Link>
                                            {project.memberRole === 'owner' && (
                                                <button 
                                                    className="dropdown-item delete-item"
                                                    onClick={(e) => handleDelete(e, project.id, project.name)}
                                                >
                                                    <i className='bx bx-trash-alt'></i> Delete
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {projects.length === 0 && !collapsed && (
                        <span className="empty-projects">No projects yet</span>
                    )}
                </div>
            </div>

            <div className={`sidebar-footer ${showLogout ? 'logout-open' : ''}`}>
                {!collapsed && (
                    <div className="user-info-container">
                        {showLogout && (
                            <button className="logout-action-btn" onClick={signOut}>
                                Log Out
                            </button>
                        )}
                        <div className="user-info" onClick={() => setShowLogout(!showLogout)}>
                            <div className="user-avatar">{user?.email?.[0].toUpperCase()}</div>
                            <div className="user-details">
                                <span className="user-email">{user?.email?.split('@')[0]}</span>
                            </div>
                        </div>
                    </div>
                )}
                {collapsed && (
                    <div className="user-avatar-collapsed" onClick={() => setShowLogout(!showLogout)}>
                        {user?.email?.[0].toUpperCase()}
                    </div>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
