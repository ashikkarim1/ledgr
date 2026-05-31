import React, { useState } from 'react'
import { useDashboard } from '@/context/DashboardContext'
import UserTable from '@/components/UserTable'

interface TeamMember {
  id: string
  name: string
  email: string
  role: 'client-admin' | 'accountant' | 'cfo' | 'agent-manager' | 'viewer'
  status: 'active' | 'invited' | 'inactive'
  joinedDate?: string
  avatar?: string
}

export default function TeamMembers() {
  const { currentUser } = useDashboard()
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([
    {
      id: 'user-1',
      name: 'Ahmed Al-Mansouri',
      email: 'ahmed@ledgr.ae',
      role: 'client-admin',
      status: 'active',
      joinedDate: '2025-01-15',
      avatar: 'AM'
    },
    {
      id: 'user-2',
      name: 'Fatima Al-Kaabi',
      email: 'fatima@ledgr.ae',
      role: 'accountant',
      status: 'active',
      joinedDate: '2025-02-01',
      avatar: 'FK'
    },
    {
      id: 'user-3',
      name: 'Mohammed Al-Falahi',
      email: 'mohammed@ledgr.ae',
      role: 'cfo',
      status: 'active',
      joinedDate: '2025-02-15',
      avatar: 'MF'
    },
    {
      id: 'user-4',
      name: 'Layla Al-Sheri',
      email: 'layla@ledgr.ae',
      role: 'agent-manager',
      status: 'active',
      joinedDate: '2025-03-01',
      avatar: 'LS'
    }
  ])

  const [pendingInvitations, setPendingInvitations] = useState([
    {
      id: 'invite-1',
      email: 'sara@ledgr.ae',
      role: 'accountant',
      invitedDate: '2025-05-20',
      status: 'pending' as const
    },
    {
      id: 'invite-2',
      email: 'omar@ledgr.ae',
      role: 'viewer',
      invitedDate: '2025-05-25',
      status: 'pending' as const
    }
  ])

  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<TeamMember['role']>('viewer')

  const handleInviteMember = (e: React.FormEvent) => {
    e.preventDefault()
    if (inviteEmail && inviteRole) {
      setPendingInvitations([
        ...pendingInvitations,
        {
          id: `invite-${pendingInvitations.length + 1}`,
          email: inviteEmail,
          role: inviteRole,
          invitedDate: new Date().toISOString().split('T')[0],
          status: 'pending'
        }
      ])
      setInviteEmail('')
      setInviteRole('viewer')
      setShowInviteForm(false)
    }
  }

  const handleRemoveMember = (id: string) => {
    setTeamMembers(teamMembers.filter(m => m.id !== id))
  }

  const handleRevokeInvitation = (id: string) => {
    setPendingInvitations(pendingInvitations.filter(i => i.id !== id))
  }

  return (
    <div className="page page--team-members">
      <div className="page__header">
        <h1>Team Members</h1>
        <p className="page__subtitle">Manage your team and permissions</p>
        {currentUser?.role === 'client-admin' && (
          <button
            className="button button--primary"
            onClick={() => setShowInviteForm(!showInviteForm)}
          >
            + Invite Team Member
          </button>
        )}
      </div>

      {showInviteForm && currentUser?.role === 'client-admin' && (
        <div className="invite-form">
          <h3>Invite Team Member</h3>
          <form onSubmit={handleInviteMember}>
            <div className="form-group">
              <label htmlFor="invite-email">Email Address</label>
              <input
                id="invite-email"
                type="email"
                placeholder="colleague@company.ae"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="invite-role">Role</label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as TeamMember['role'])}
              >
                <option value="viewer">Viewer</option>
                <option value="accountant">Accountant</option>
                <option value="cfo">CFO</option>
                <option value="agent-manager">Agent Manager</option>
                <option value="client-admin">Admin</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" className="button button--primary">
                Send Invitation
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setShowInviteForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <section className="section">
        <h2 className="section__title">Active Members ({teamMembers.length})</h2>
        <div className="team-members-table">
          <div className="table-header">
            <div className="table-cell">Name</div>
            <div className="table-cell">Email</div>
            <div className="table-cell">Role</div>
            <div className="table-cell">Joined</div>
            {currentUser?.role === 'client-admin' && <div className="table-cell">Actions</div>}
          </div>
          {teamMembers.map((member) => (
            <div key={member.id} className="table-row">
              <div className="table-cell">
                <div className="member-name">
                  <div className="avatar" style={{ backgroundColor: 'var(--accent)' }}>
                    {member.avatar}
                  </div>
                  <span>{member.name}</span>
                </div>
              </div>
              <div className="table-cell">{member.email}</div>
              <div className="table-cell">
                <span className="role-badge">{member.role}</span>
              </div>
              <div className="table-cell">{member.joinedDate}</div>
              {currentUser?.role === 'client-admin' && (
                <div className="table-cell actions">
                  <button
                    className="button button--icon"
                    onClick={() => handleRemoveMember(member.id)}
                    title="Remove member"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {pendingInvitations.length > 0 && (
        <section className="section">
          <h2 className="section__title">Pending Invitations ({pendingInvitations.length})</h2>
          <div className="team-members-table">
            <div className="table-header">
              <div className="table-cell">Email</div>
              <div className="table-cell">Role</div>
              <div className="table-cell">Invited</div>
              {currentUser?.role === 'client-admin' && <div className="table-cell">Actions</div>}
            </div>
            {pendingInvitations.map((invite) => (
              <div key={invite.id} className="table-row table-row--pending">
                <div className="table-cell">{invite.email}</div>
                <div className="table-cell">
                  <span className="role-badge">{invite.role}</span>
                </div>
                <div className="table-cell">{invite.invitedDate}</div>
                {currentUser?.role === 'client-admin' && (
                  <div className="table-cell actions">
                    <button
                      className="button button--icon"
                      onClick={() => handleRevokeInvitation(invite.id)}
                      title="Revoke invitation"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section__title">Role Permissions</h2>
        <div className="permissions-grid">
          <div className="permission-card">
            <h4>Admin</h4>
            <ul>
              <li>Full system access</li>
              <li>User management</li>
              <li>Organization settings</li>
              <li>Billing management</li>
              <li>Agent deployment</li>
            </ul>
          </div>
          <div className="permission-card">
            <h4>CFO</h4>
            <ul>
              <li>Financial dashboards</li>
              <li>Reports & analytics</li>
              <li>Budget management</li>
              <li>View transactions</li>
              <li>Audit logs</li>
            </ul>
          </div>
          <div className="permission-card">
            <h4>Accountant</h4>
            <ul>
              <li>Transaction entry</li>
              <li>Reconciliation</li>
              <li>Invoice processing</li>
              <li>View reports</li>
              <li>Category management</li>
            </ul>
          </div>
          <div className="permission-card">
            <h4>Agent Manager</h4>
            <ul>
              <li>Agent deployment</li>
              <li>Task management</li>
              <li>Performance monitoring</li>
              <li>Configuration</li>
              <li>View activity logs</li>
            </ul>
          </div>
          <div className="permission-card">
            <h4>Viewer</h4>
            <ul>
              <li>View dashboards</li>
              <li>View reports</li>
              <li>View transactions</li>
              <li>Read-only access</li>
              <li>No write permissions</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
