import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
    sendInvite, getCollaborators, getPendingInvites, 
    removeCollaborator, revokeInvite 
} from '../services/api';
import './CollaboratorPanel.css';

const CollaboratorPanel = ({ projectId, userRole }) => {
    const { supabase, user } = useAuth();
    const [collaborators, setCollaborators] = useState([]);
    const [pendingInvites, setPendingInvites] = useState([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteCode, setInviteCode] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);

    const isOwner = userRole === 'owner';

    useEffect(() => {
        fetchData();
    }, [projectId]);

    const fetchData = async () => {
        try {
            const [members, invites] = await Promise.all([
                getCollaborators(projectId),
                isOwner ? getPendingInvites(projectId) : Promise.resolve([])
            ]);

            // Fetch user emails for members
            if (supabase && members.length > 0) {
                const enriched = await Promise.all(
                    members.map(async (m) => {
                        // We can use the user's own email directly
                        if (m.user_id === user?.id) {
                            return { ...m, email: user.email, isCurrentUser: true };
                        }
                        return { ...m, email: null, isCurrentUser: false };
                    })
                );
                setCollaborators(enriched);
            } else {
                setCollaborators(members);
            }

            setPendingInvites(invites);
        } catch (err) {
            console.error('Failed to load collaborators:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSendInvite = async (e) => {
        e.preventDefault();
        if (!inviteEmail.trim() || sending) return;
        setSending(true);
        setError(null);
        setInviteCode(null);

        try {
            const result = await sendInvite(projectId, inviteEmail.trim());
            if (result.error) {
                setError(result.error);
            } else {
                setInviteCode(result.invite_code);
                setInviteEmail('');
                fetchData();
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    };

    const handleRemove = async (memberId, userId) => {
        if (!window.confirm('Remove this collaborator? They will lose access to the project.')) return;
        try {
            await removeCollaborator(projectId, userId);
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleRevoke = async (inviteId) => {
        try {
            await revokeInvite(inviteId);
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const copyCode = () => {
        navigator.clipboard.writeText(inviteCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) return <div className="page-loader"><div className="loader-ring"></div></div>;

    return (
        <div className="collab-panel">
            <header className="collab-header">
                <div className="collab-title">
                    <i className='bx bx-group' style={{ fontSize: '24px' }}></i>
                    <div>
                        <h2>Team</h2>
                        <p className="collab-subtitle">{collaborators.length} member{collaborators.length !== 1 ? 's' : ''}</p>
                    </div>
                </div>
            </header>

            {/* Invite Section — Owner Only */}
            {isOwner && (
                <section className="invite-section">
                    <h3 className="section-label"><i className='bx bx-user-plus'></i> Invite Collaborator</h3>
                    <form onSubmit={handleSendInvite} className="invite-form">
                        <div className="input-group">
                            <i className='bx bx-envelope input-icon'></i>
                            <input
                                type="email"
                                placeholder="colleague@gmail.com"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                required
                            />
                        </div>
                        <button type="submit" className="invite-btn" disabled={sending}>
                            {sending ? 'Sending...' : 'Send Invite'}
                        </button>
                    </form>

                    {error && <div className="collab-error">{error}</div>}

                    {inviteCode && (
                        <div className="invite-code-display">
                            <p className="code-label">Share this code with your collaborator:</p>
                            <div className="code-row">
                                <span className="code-value">{inviteCode}</span>
                                <button className="copy-btn" onClick={copyCode}>
                                    <i className={`bx ${copied ? 'bx-check' : 'bx-copy'}`}></i>
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                            <p className="code-hint">They can join by clicking <i className='bx bx-user-plus'></i> <strong>Join Project</strong> in their sidebar</p>
                        </div>
                    )}
                </section>
            )}

            {/* Members List */}
            <section className="members-section">
                <h3 className="section-label"><i className='bx bx-shield-quarter'></i> Members</h3>
                <div className="members-list">
                    {collaborators.map((member) => (
                        <div key={member.id} className="member-row">
                            <div className="member-avatar">
                                {(member.email || '?')[0].toUpperCase()}
                            </div>
                            <div className="member-info">
                                <span className="member-email">
                                    {member.email || `User ${member.user_id.slice(0, 8)}...`}
                                    {member.isCurrentUser && <span className="you-badge">You</span>}
                                </span>
                                <span className="member-role">
                                    {member.role === 'owner' ? (
                                        <><i className='bx bxs-crown'></i> Owner</>
                                    ) : 'Member'}
                                </span>
                            </div>
                            {isOwner && member.role !== 'owner' && (
                                <button 
                                    className="remove-btn"
                                    onClick={() => handleRemove(member.id, member.user_id)}
                                    title="Remove collaborator"
                                >
                                    <i className='bx bx-trash'></i>
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {/* Pending Invites — Owner Only */}
            {isOwner && pendingInvites.length > 0 && (
                <section className="invites-section">
                    <h3 className="section-label"><i className='bx bx-time-five'></i> Pending Invites</h3>
                    <div className="invites-list">
                        {pendingInvites.map((invite) => (
                            <div key={invite.id} className="invite-row">
                                <div className="invite-info">
                                    <i className='bx bx-envelope'></i>
                                    <span>{invite.invited_email}</span>
                                    <span className="invite-code-mini">{invite.invite_code}</span>
                                </div>
                                <button 
                                    className="revoke-btn"
                                    onClick={() => handleRevoke(invite.id)}
                                    title="Revoke invite"
                                >
                                    Revoke
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
};

export default CollaboratorPanel;
