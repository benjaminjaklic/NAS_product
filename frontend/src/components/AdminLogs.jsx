import React, { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useModal } from '../context/ModalContext'

function AdminLogs() {
  const { theme } = useTheme()
  const { alert: showAlert } = useModal()
  const [logs, setLogs] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    user: '',
    action: '',
    dateFrom: '',
    dateTo: ''
  })
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const perPage = 50

  const actionTypes = [
    'user_login', 'user_logout', 'user_register',
    'file_upload', 'file_delete', 'file_download', 'file_tag',
    'user_approved', 'user_rejected', 'admin_status_granted', 'admin_status_revoked',
    'theme_change', 'password_change'
  ]

  useEffect(() => {
    fetchLogs()
    fetchUsers()
  }, [page, filters])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString()
      })
      
      if (filters.user) params.append('user_id', filters.user)
      if (filters.action) params.append('action', filters.action)
      if (filters.dateFrom) params.append('date_from', filters.dateFrom)
      if (filters.dateTo) params.append('date_to', filters.dateTo)

      const response = await fetch(`/admin/api/logs?${params}`)
      if (response.ok) {
        const data = await response.json()
        setLogs(data.logs || [])
        setTotalPages(data.total_pages || 1)
      }
    } catch (err) {
      console.error('Error fetching logs:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch('/admin/api/users')
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
      }
    } catch (err) {
      console.error('Error fetching users:', err)
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({ user: '', action: '', dateFrom: '', dateTo: '' })
    setPage(1)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleString()
  }

  const getActionBadgeColor = (action) => {
    if (action.includes('login') || action.includes('register')) return 'bg-info'
    if (action.includes('upload')) return 'bg-success'
    if (action.includes('delete')) return 'bg-danger'
    if (action.includes('admin')) return 'bg-warning'
    if (action.includes('approved')) return 'bg-success'
    if (action.includes('rejected')) return 'bg-danger'
    return 'bg-secondary'
  }

  const exportLogs = async () => {
    try {
      const params = new URLSearchParams()
      if (filters.user) params.append('user_id', filters.user)
      if (filters.action) params.append('action', filters.action)
      if (filters.dateFrom) params.append('date_from', filters.dateFrom)
      if (filters.dateTo) params.append('date_to', filters.dateTo)
      
      const response = await fetch(`/admin/api/logs/export?${params}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `activity_logs_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
      }
    } catch (err) {
      showAlert({ title: 'Error', message: 'Error exporting logs: ' + err.message, variant: 'danger', icon: 'fa-exclamation-circle' })
    }
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 style={{ color: theme.textPrimary }}>
          <i className="fas fa-clipboard-list me-2"></i>Activity Logs
        </h2>
        <button className="btn btn-outline-primary" onClick={exportLogs}>
          <i className="fas fa-download me-2"></i>Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
        <div className="card-header" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary }}>
          <h5 className="mb-0">
            <i className="fas fa-filter me-2"></i>Filters
          </h5>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label" style={{ color: theme.textSecondary }}>User</label>
              <select
                className="form-select"
                value={filters.user}
                onChange={(e) => handleFilterChange('user', e.target.value)}
                style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
              >
                <option value="">All Users</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.username}</option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label" style={{ color: theme.textSecondary }}>Action</label>
              <select
                className="form-select"
                value={filters.action}
                onChange={(e) => handleFilterChange('action', e.target.value)}
                style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
              >
                <option value="">All Actions</option>
                {actionTypes.map(action => (
                  <option key={action} value={action}>
                    {action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label" style={{ color: theme.textSecondary }}>From Date</label>
              <input
                type="date"
                className="form-control"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label" style={{ color: theme.textSecondary }}>To Date</label>
              <input
                type="date"
                className="form-control"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
              />
            </div>
            <div className="col-md-2 d-flex align-items-end">
              <button className="btn btn-secondary w-100" onClick={clearFilters}>
                <i className="fas fa-times me-2"></i>Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
        <div className="card-header d-flex justify-content-between align-items-center" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary }}>
          <h5 className="mb-0">
            <i className="fas fa-list me-2"></i>Logs
          </h5>
          <span className="badge bg-primary">{logs.length} entries</span>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-5" style={{ color: theme.textSecondary }}>
              <i className="fas fa-inbox fa-3x mb-3"></i>
              <p>No logs found matching your filters</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ color: theme.textPrimary }}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Details</th>
                    <th>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr key={idx}>
                      <td><small>{formatDate(log.timestamp)}</small></td>
                      <td>
                        <strong>{log.username}</strong>
                      </td>
                      <td>
                        <span className={`badge ${getActionBadgeColor(log.action)}`}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <small style={{ color: theme.textSecondary }}>
                          {log.details || '-'}
                        </small>
                      </td>
                      <td>
                        <code style={{ fontSize: '0.8rem' }}>{log.ip_address || '-'}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="card-footer d-flex justify-content-center" style={{ backgroundColor: theme.bgNav, borderColor: theme.borderColor }}>
            <nav>
              <ul className="pagination mb-0">
                <li className={`page-item ${page === 1 ? 'disabled' : ''}`}>
                  <button className="page-link" onClick={() => setPage(p => Math.max(1, p - 1))}>
                    Previous
                  </button>
                </li>
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
                  if (pageNum > totalPages) return null
                  return (
                    <li key={pageNum} className={`page-item ${page === pageNum ? 'active' : ''}`}>
                      <button className="page-link" onClick={() => setPage(pageNum)}>
                        {pageNum}
                      </button>
                    </li>
                  )
                })}
                <li className={`page-item ${page === totalPages ? 'disabled' : ''}`}>
                  <button className="page-link" onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                    Next
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminLogs
