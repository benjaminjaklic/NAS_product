import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useCSRF } from '../context/CSRFContext'
import { useModal } from '../context/ModalContext'

function Admin() {
  const { theme } = useTheme()
  const { csrfToken } = useCSRF()
  const { confirm: showConfirm, alert: showAlert } = useModal()
  const [users, setUsers] = useState([])
  const [availableRoles, setAvailableRoles] = useState(['user', 'it', 'boss', 'admin'])
  const [stats, setStats] = useState({
    totalUsers: 0,
    pendingApprovals: 0,
    totalStorage: 0,
    totalFiles: 0,
    recentActivity: []
  })
  const [telemetry, setTelemetry] = useState({
    dailyActivity: [],
    activityByType: [],
    storageByUser: [],
    dailyUploads: [],
    totalStorageUsed: 0
  })
  const [versionInfo, setVersionInfo] = useState({
    current_version: '',
    latest_version: null,
    update_available: false,
    release_url: null,
    error: null
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchUsers()
    fetchStats()
    fetchTelemetry()
    fetchVersion()
  }, [])

  const fetchUsers = async () => {
    try {
      const response = await fetch('/admin/api/users')
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
        if (data.available_roles) {
          setAvailableRoles(data.available_roles)
        }
      } else {
        setError('Failed to load users')
      }
    } catch (err) {
      setError('Error loading users: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId, newRole) => {
    try {
      const response = await fetch(`/admin/api/user/${userId}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({ role: newRole })
      })

      if (response.ok) {
        fetchUsers()
      } else {
        const data = await response.json()
        showAlert({ title: 'Error', message: data.error || 'Failed to update role', variant: 'danger', icon: 'fa-exclamation-circle' })
      }
    } catch (err) {
      showAlert({ title: 'Error', message: 'Error updating role: ' + err.message, variant: 'danger', icon: 'fa-exclamation-circle' })
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch('/admin/api/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (err) {
      console.error('Error loading stats:', err)
    }
  }

  const fetchTelemetry = async () => {
    try {
      const response = await fetch('/admin/api/telemetry')
      if (response.ok) {
        const data = await response.json()
        setTelemetry(data)
      }
    } catch (err) {
      console.error('Error loading telemetry:', err)
    }
  }

  const fetchVersion = async () => {
    try {
      const response = await fetch('/admin/api/version')
      if (response.ok) {
        const data = await response.json()
        setVersionInfo(data)
      }
    } catch (err) {
      console.error('Error loading version:', err)
    }
  }

  const handleApprove = async (userId) => {
    try {
      const formData = new URLSearchParams()
      formData.append('csrf_token', csrfToken)
      formData.append('user_id', userId)
      formData.append('action', 'approve')

      const response = await fetch('/admin/approve-user', {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrfToken,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      })

      if (response.ok) {
        showAlert({ title: 'User Approved', message: 'User has been approved successfully.', variant: 'success', icon: 'fa-check-circle' })
        fetchUsers()
      } else {
        showAlert({ title: 'Error', message: 'Failed to approve user', variant: 'danger', icon: 'fa-exclamation-circle' })
      }
    } catch (err) {
      showAlert({ title: 'Error', message: 'Error: ' + err.message, variant: 'danger', icon: 'fa-exclamation-circle' })
    }
  }

  const handleReject = async (userId) => {
    const confirmed = await showConfirm({
      title: 'Reject User',
      message: 'Are you sure you want to reject this user? They will not be able to log in.',
      confirmText: 'Reject',
      variant: 'danger',
      icon: 'fa-user-times'
    })
    if (!confirmed) return

    try {
      const formData = new URLSearchParams()
      formData.append('csrf_token', csrfToken)
      formData.append('user_id', userId)
      formData.append('action', 'reject')

      const response = await fetch('/admin/approve-user', {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrfToken,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      })

      if (response.ok) {
        showAlert({ title: 'User Rejected', message: 'User has been rejected.', variant: 'warning', icon: 'fa-user-times' })
        fetchUsers()
      } else {
        showAlert({ title: 'Error', message: 'Failed to reject user', variant: 'danger', icon: 'fa-exclamation-circle' })
      }
    } catch (err) {
      showAlert({ title: 'Error', message: 'Error: ' + err.message, variant: 'danger', icon: 'fa-exclamation-circle' })
    }
  }

  const handleToggleAdmin = async (userId, isAdmin, username) => {
    // Protect admin and demo users
    if (username === 'admin' || username === 'demo') {
      showAlert({ title: 'Protected User', message: 'Cannot modify admin status of protected users (admin/demo).', variant: 'warning', icon: 'fa-shield-alt' })
      return
    }

    try {
      const formData = new URLSearchParams()
      formData.append('csrf_token', csrfToken)
      formData.append('user_id', userId)
      formData.append('is_admin', !isAdmin)

      const response = await fetch('/admin/toggle-admin', {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrfToken,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      })

      if (response.ok) {
        showAlert({ title: 'Updated', message: 'Admin status updated successfully.', variant: 'success', icon: 'fa-check-circle' })
        fetchUsers()
        fetchStats()
      } else {
        const data = await response.json()
        showAlert({ title: 'Error', message: data.error || 'Failed to update admin status', variant: 'danger', icon: 'fa-exclamation-circle' })
      }
    } catch (err) {
      showAlert({ title: 'Error', message: 'Error: ' + err.message, variant: 'danger', icon: 'fa-exclamation-circle' })
    }
  }

  const handleDeleteUser = async (userId, username) => {
    // Protect admin and demo users
    if (username === 'admin' || username === 'demo') {
      showAlert({ title: 'Protected User', message: 'Cannot delete protected users (admin/demo).', variant: 'warning', icon: 'fa-shield-alt' })
      return
    }

    const confirmed = await showConfirm({
      title: 'Delete User',
      message: `Are you sure you want to delete user "${username}"? This will also delete all their files. This action cannot be undone.`,
      confirmText: 'Delete User',
      variant: 'danger',
      icon: 'fa-user-slash'
    })
    if (!confirmed) return

    try {
      const formData = new URLSearchParams()
      formData.append('csrf_token', csrfToken)
      formData.append('user_id', userId)

      const response = await fetch('/admin/delete-user', {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrfToken,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      })

      if (response.ok) {
        showAlert({ title: 'User Deleted', message: `User "${username}" has been deleted.`, variant: 'success', icon: 'fa-check-circle' })
        fetchUsers()
        fetchStats()
      } else {
        const data = await response.json()
        showAlert({ title: 'Error', message: data.error || 'Failed to delete user', variant: 'danger', icon: 'fa-exclamation-circle' })
      }
    } catch (err) {
      showAlert({ title: 'Error', message: 'Error: ' + err.message, variant: 'danger', icon: 'fa-exclamation-circle' })
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString()
  }

  const formatSize = (bytes) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger">{error}</div>
      </div>
    )
  }

  const pendingUsers = users.filter(u => !u.is_approved)
  const approvedUsers = users.filter(u => u.is_approved)

  // Simple bar chart component
  const SimpleBarChart = ({ data, labelKey, valueKey, maxValue, color }) => {
    const max = maxValue || Math.max(...data.map(d => d[valueKey]), 1)
    return (
      <div className="simple-bar-chart">
        {data.slice(0, 8).map((item, idx) => (
          <div key={idx} className="mb-2">
            <div className="d-flex justify-content-between mb-1">
              <small style={{ color: theme.textSecondary }}>{item[labelKey]}</small>
              <small style={{ color: theme.textPrimary }}>{item[valueKey]}</small>
            </div>
            <div className="progress" style={{ height: '8px', backgroundColor: theme.borderColor }}>
              <div 
                className="progress-bar" 
                style={{ 
                  width: `${(item[valueKey] / max) * 100}%`,
                  backgroundColor: color || theme.colorPrimary
                }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 style={{ color: theme.textPrimary }}>
          <i className="fas fa-user-shield me-2"></i>Admin Dashboard
        </h2>
        <Link to="/admin/logs" className="btn btn-outline-primary">
          <i className="fas fa-clipboard-list me-2"></i>View All Logs
        </Link>
      </div>

      {/* Version / Update Banner */}
      {versionInfo.current_version && (
        <div className={`alert mb-4 ${versionInfo.update_available ? 'alert-warning' : 'alert-info'}`} style={{ backgroundColor: theme.bgCard, color: theme.textPrimary, borderColor: versionInfo.update_available ? theme.colorWarning : theme.colorPrimary }}>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <i className={`fas ${versionInfo.update_available ? 'fa-download' : 'fa-code-branch'} me-2`} style={{ color: versionInfo.update_available ? theme.colorWarning : theme.colorPrimary }}></i>
              <strong>Version {versionInfo.current_version}</strong>
              {versionInfo.update_available && versionInfo.latest_version && (
                <span className="ms-2">— Update available: <strong>{versionInfo.latest_version}</strong></span>
              )}
              {!versionInfo.update_available && versionInfo.latest_version && (
                <span className="ms-2">— You are up to date</span>
              )}
              {versionInfo.error && (
                <span className="ms-2 text-muted">(Update check unavailable)</span>
              )}
            </div>
            {versionInfo.update_available && versionInfo.release_url && (
              <a
                href={versionInfo.release_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-warning"
              >
                <i className="fas fa-external-link-alt me-1"></i>View Release
              </a>
            )}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="row mb-4">
        <div className="col-md-3 mb-3">
          <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
            <div className="card-body text-center">
              <i className="fas fa-users fa-2x mb-2" style={{ color: theme.colorPrimary }}></i>
              <h3 className="mb-0" style={{ color: theme.textPrimary }}>{stats.totalUsers}</h3>
              <p className="text-muted mb-0">Total Users</p>
            </div>
          </div>
        </div>
        <div className="col-md-3 mb-3">
          <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
            <div className="card-body text-center">
              <i className="fas fa-clock fa-2x mb-2" style={{ color: theme.colorWarning }}></i>
              <h3 className="mb-0" style={{ color: theme.textPrimary }}>{stats.pendingApprovals}</h3>
              <p className="text-muted mb-0">Pending Approvals</p>
            </div>
          </div>
        </div>
        <div className="col-md-3 mb-3">
          <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
            <div className="card-body text-center">
              <i className="fas fa-hdd fa-2x mb-2" style={{ color: theme.colorSuccess }}></i>
              <h3 className="mb-0" style={{ color: theme.textPrimary }}>{formatSize(stats.totalStorage)}</h3>
              <p className="text-muted mb-0">Total Storage</p>
            </div>
          </div>
        </div>
        <div className="col-md-3 mb-3">
          <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
            <div className="card-body text-center">
              <i className="fas fa-file fa-2x mb-2" style={{ color: theme.colorInfo }}></i>
              <h3 className="mb-0" style={{ color: theme.textPrimary }}>{stats.totalFiles}</h3>
              <p className="text-muted mb-0">Total Files</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      {stats.recentActivity && stats.recentActivity.length > 0 && (
        <div className="card mb-4" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
          <div className="card-header" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary }}>
            <h5 className="mb-0">
              <i className="fas fa-history me-2"></i>Recent Activity
            </h5>
          </div>
          <div className="card-body">
            <div className="list-group list-group-flush">
              {stats.recentActivity.slice(0, 10).map((activity, idx) => (
                <div key={idx} className="list-group-item" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor, color: theme.textPrimary }}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <i className="fas fa-circle me-2" style={{ fontSize: '0.5rem', color: theme.colorPrimary }}></i>
                      <strong>{activity.username}</strong> - {activity.action}
                    </div>
                    <small className="text-muted">{formatDate(activity.timestamp)}</small>
                  </div>
                  {activity.details && (
                    <small className="text-muted ms-4">{activity.details}</small>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Telemetry Charts */}
      <div className="row mb-4">
        <div className="col-md-6 mb-3">
          <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
            <div className="card-header" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary }}>
              <h5 className="mb-0">
                <i className="fas fa-chart-bar me-2"></i>Activity by Type (30 days)
              </h5>
            </div>
            <div className="card-body">
              {telemetry.activityByType.length > 0 ? (
                <SimpleBarChart 
                  data={telemetry.activityByType.map(a => ({
                    label: a.action.replace(/_/g, ' '),
                    value: a.count
                  }))}
                  labelKey="label"
                  valueKey="value"
                  color={theme.colorPrimary}
                />
              ) : (
                <p className="text-muted text-center mb-0">No activity data available</p>
              )}
            </div>
          </div>
        </div>
        <div className="col-md-6 mb-3">
          <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
            <div className="card-header d-flex justify-content-between align-items-center" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary }}>
              <h5 className="mb-0">
                <i className="fas fa-database me-2"></i>Storage by User
              </h5>
              <span className="badge bg-info">
                Total: {formatSize(telemetry.totalStorageUsed || 0)}
              </span>
            </div>
            <div className="card-body">
              {telemetry.storageByUser.length > 0 ? (
                <div className="storage-by-user">
                  {telemetry.storageByUser.map((s, idx) => {
                    const usedPercent = s.limit ? Math.round((s.used / s.limit) * 100) : 0
                    return (
                      <div key={idx} className="mb-3 p-2 rounded" style={{ backgroundColor: theme.bgBody }}>
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <strong style={{ color: theme.textPrimary }}>{s.username}</strong>
                          <span className="badge" style={{ 
                            backgroundColor: usedPercent > 90 ? '#dc3545' : usedPercent > 75 ? '#ffc107' : '#28a745'
                          }}>
                            {usedPercent}%
                          </span>
                        </div>
                        <div className="progress mb-1" style={{ height: '10px', backgroundColor: theme.borderColor }}>
                          <div 
                            className="progress-bar" 
                            style={{ 
                              width: `${usedPercent}%`,
                              backgroundColor: usedPercent > 90 ? '#dc3545' : usedPercent > 75 ? '#ffc107' : '#28a745'
                            }}
                          ></div>
                        </div>
                        <div className="d-flex justify-content-between">
                          <small style={{ color: theme.textSecondary }}>
                            Used: {formatSize(s.used || 0)}
                          </small>
                          <small style={{ color: theme.textSecondary }}>
                            Limit: {formatSize(s.limit || 0)}
                          </small>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-muted text-center mb-0">No storage data available</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Activity Summary */}
      <div className="card mb-4" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
        <div className="card-header" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary }}>
          <h5 className="mb-0">
            <i className="fas fa-chart-pie me-2"></i>30-Day Activity Summary
          </h5>
        </div>
        <div className="card-body">
          <div className="row text-center">
            {telemetry.activityByType.slice(0, 6).map((activity, idx) => (
              <div key={idx} className="col-md-2 col-4 mb-3">
                <div className="p-2 rounded" style={{ backgroundColor: theme.bgBody }}>
                  <h4 style={{ color: theme.colorPrimary }}>{activity.count}</h4>
                  <small style={{ color: theme.textSecondary }}>
                    {activity.action.replace(/_/g, ' ')}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Daily Activity Chart */}
      {telemetry.dailyActivity.length > 0 && (
        <div className="card mb-4" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
          <div className="card-header" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary }}>
            <h5 className="mb-0">
              <i className="fas fa-chart-line me-2"></i>Daily Activity (Last 30 Days)
            </h5>
          </div>
          <div className="card-body">
            <div className="d-flex align-items-end" style={{ height: '150px', gap: '2px' }}>
              {telemetry.dailyActivity.map((day, idx) => {
                const maxCount = Math.max(...telemetry.dailyActivity.map(d => d.count), 1)
                const height = (day.count / maxCount) * 100
                return (
                  <div 
                    key={idx}
                    className="flex-fill"
                    title={`${day.date}: ${day.count} activities`}
                    style={{
                      height: `${Math.max(height, 2)}%`,
                      backgroundColor: theme.colorPrimary,
                      borderRadius: '2px 2px 0 0',
                      cursor: 'pointer'
                    }}
                  ></div>
                )
              })}
            </div>
            <div className="d-flex justify-content-between mt-2">
              <small className="text-muted">
                {telemetry.dailyActivity[0]?.date}
              </small>
              <small className="text-muted">
                {telemetry.dailyActivity[telemetry.dailyActivity.length - 1]?.date}
              </small>
            </div>
          </div>
        </div>
      )}

      {/* Pending Approvals */}
      {pendingUsers.length > 0 && (
        <div className="card mb-4" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
          <div className="card-header" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary }}>
            <h5 className="mb-0">
              <i className="fas fa-clock me-2"></i>Pending Approvals
              <span className="badge bg-warning ms-2">{pendingUsers.length}</span>
            </h5>
          </div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover" style={{ color: theme.textPrimary }}>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Registered</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingUsers.map(user => (
                    <tr key={user.id}>
                      <td>{user.username}</td>
                      <td>{user.email}</td>
                      <td>{formatDate(user.created_at)}</td>
                      <td>
                        <button
                          className="btn btn-success btn-sm me-2"
                          onClick={() => handleApprove(user.id)}
                        >
                          <i className="fas fa-check me-1"></i>Approve
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleReject(user.id)}
                        >
                          <i className="fas fa-times me-1"></i>Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* All Users */}
      <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
        <div className="card-header" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary }}>
          <h5 className="mb-0">
            <i className="fas fa-users me-2"></i>All Users
            <span className="badge bg-primary ms-2">{approvedUsers.length}</span>
          </h5>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-hover" style={{ color: theme.textPrimary }}>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Storage Used</th>
                  <th>Files</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {approvedUsers.map(user => (
                  <tr key={user.id}>
                    <td>
                      {user.username}
                      {user.is_admin && <i className="fas fa-shield-alt text-warning ms-2" title="Admin"></i>}
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <select
                        className="form-select form-select-sm"
                        value={user.role || 'user'}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={user.username === 'admin'}
                        style={{
                          backgroundColor: theme.bgBody,
                          color: user.role_color || theme.textPrimary,
                          borderColor: theme.borderColor,
                          minWidth: '120px'
                        }}
                      >
                        {availableRoles.map(role => (
                          <option key={role.name || role} value={role.name || role} style={{ color: role.color }}>
                            {role.display_name || (typeof role === 'string' ? role.charAt(0).toUpperCase() + role.slice(1) : role.name)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{formatSize(user.storage_used || 0)}</td>
                    <td>{user.file_count || 0}</td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteUser(user.id, user.username)}
                        title="Delete User"
                        disabled={user.username === 'admin' || user.username === 'demo'}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Admin
