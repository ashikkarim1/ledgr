import React, { useState } from 'react'

interface TableUser {
  id: string
  name: string
  email: string
  role: string
  status?: 'active' | 'inactive' | 'pending'
  avatar?: string
  joinedDate?: string
}

interface UserTableProps {
  users: TableUser[]
  onSelectUser?: (user: TableUser) => void
  onDeleteUser?: (userId: string) => void
  columns?: Array<'name' | 'email' | 'role' | 'status' | 'joined' | 'actions'>
  selectable?: boolean
  sortable?: boolean
  className?: string
}

type SortField = 'name' | 'email' | 'role' | 'status' | 'joinedDate'
type SortDirection = 'asc' | 'desc'

export default function UserTable({
  users,
  onSelectUser,
  onDeleteUser,
  columns = ['name', 'email', 'role', 'status', 'joined', 'actions'],
  selectable = false,
  sortable = true,
  className = ''
}: UserTableProps) {
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())

  const sortedUsers = [...users].sort((a, b) => {
    let aValue: any = a[sortField as keyof TableUser]
    let bValue: any = b[sortField as keyof TableUser]

    if (aValue === undefined || aValue === null) aValue = ''
    if (bValue === undefined || bValue === null) bValue = ''

    if (typeof aValue === 'string') {
      aValue = aValue.toLowerCase()
      bValue = (bValue as string).toLowerCase()
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  const handleSort = (field: SortField) => {
    if (!sortable) return

    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedUsers(new Set(users.map(u => u.id)))
    } else {
      setSelectedUsers(new Set())
    }
  }

  const handleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedUsers)
    if (newSelected.has(userId)) {
      newSelected.delete(userId)
    } else {
      newSelected.add(userId)
    }
    setSelectedUsers(newSelected)
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '↕️'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  const getAvatarInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className={`user-table ${className}`}>
      <div className="table-header">
        {selectable && (
          <div className="table-cell table-cell--checkbox">
            <input
              type="checkbox"
              onChange={handleSelectAll}
              checked={selectedUsers.size === users.length && users.length > 0}
              aria-label="Select all users"
            />
          </div>
        )}

        {columns.includes('name') && (
          <div
            className="table-cell table-cell--name"
            onClick={() => handleSort('name')}
            role={sortable ? 'button' : undefined}
            tabIndex={sortable ? 0 : undefined}
            aria-label={sortable ? `Sort by name ${sortField === 'name' ? sortDirection : ''}` : 'Name'}
          >
            Name {sortable && getSortIcon('name')}
          </div>
        )}

        {columns.includes('email') && (
          <div
            className="table-cell table-cell--email"
            onClick={() => handleSort('email')}
            role={sortable ? 'button' : undefined}
            tabIndex={sortable ? 0 : undefined}
            aria-label={sortable ? `Sort by email ${sortField === 'email' ? sortDirection : ''}` : 'Email'}
          >
            Email {sortable && getSortIcon('email')}
          </div>
        )}

        {columns.includes('role') && (
          <div
            className="table-cell table-cell--role"
            onClick={() => handleSort('role')}
            role={sortable ? 'button' : undefined}
            tabIndex={sortable ? 0 : undefined}
            aria-label={sortable ? `Sort by role ${sortField === 'role' ? sortDirection : ''}` : 'Role'}
          >
            Role {sortable && getSortIcon('role')}
          </div>
        )}

        {columns.includes('status') && (
          <div
            className="table-cell table-cell--status"
            onClick={() => handleSort('status')}
            role={sortable ? 'button' : undefined}
            tabIndex={sortable ? 0 : undefined}
            aria-label={sortable ? `Sort by status ${sortField === 'status' ? sortDirection : ''}` : 'Status'}
          >
            Status {sortable && getSortIcon('status')}
          </div>
        )}

        {columns.includes('joined') && (
          <div
            className="table-cell table-cell--joined"
            onClick={() => handleSort('joinedDate')}
            role={sortable ? 'button' : undefined}
            tabIndex={sortable ? 0 : undefined}
            aria-label={sortable ? `Sort by joined date ${sortField === 'joinedDate' ? sortDirection : ''}` : 'Joined'}
          >
            Joined {sortable && getSortIcon('joinedDate')}
          </div>
        )}

        {columns.includes('actions') && (
          <div className="table-cell table-cell--actions">Actions</div>
        )}
      </div>

      <div className="table-body">
        {sortedUsers.length > 0 ? (
          sortedUsers.map((user) => (
            <div
              key={user.id}
              className={`table-row ${selectedUsers.has(user.id) ? 'table-row--selected' : ''}`}
              onClick={() => onSelectUser?.(user)}
              role="row"
            >
              {selectable && (
                <div className="table-cell table-cell--checkbox">
                  <input
                    type="checkbox"
                    checked={selectedUsers.has(user.id)}
                    onChange={() => handleSelectUser(user.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${user.name}`}
                  />
                </div>
              )}

              {columns.includes('name') && (
                <div className="table-cell table-cell--name">
                  <div className="user-cell">
                    <div
                      className="avatar"
                      style={{ backgroundColor: 'var(--accent)' }}
                      title={user.name}
                    >
                      {user.avatar || getAvatarInitials(user.name)}
                    </div>
                    <span className="user-name">{user.name}</span>
                  </div>
                </div>
              )}

              {columns.includes('email') && (
                <div className="table-cell table-cell--email">
                  <span className="email">{user.email}</span>
                </div>
              )}

              {columns.includes('role') && (
                <div className="table-cell table-cell--role">
                  <span className="role-badge">{user.role}</span>
                </div>
              )}

              {columns.includes('status') && (
                <div className="table-cell table-cell--status">
                  {user.status ? (
                    <span className={`status-badge status-badge--${user.status}`}>
                      {user.status}
                    </span>
                  ) : (
                    <span className="text-secondary">—</span>
                  )}
                </div>
              )}

              {columns.includes('joined') && (
                <div className="table-cell table-cell--joined">
                  <span className="date">{user.joinedDate || '—'}</span>
                </div>
              )}

              {columns.includes('actions') && (
                <div className="table-cell table-cell--actions">
                  <div className="action-buttons">
                    {onDeleteUser && (
                      <button
                        className="button button--icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteUser(user.id)
                        }}
                        title={`Remove ${user.name}`}
                        aria-label={`Remove ${user.name}`}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="table-empty">
            <p>No users found</p>
          </div>
        )}
      </div>

      {selectable && selectedUsers.size > 0 && (
        <div className="table-footer">
          <p>{selectedUsers.size} user(s) selected</p>
        </div>
      )}
    </div>
  )
}
