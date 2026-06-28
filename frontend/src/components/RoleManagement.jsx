import React, { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useCSRF } from '../context/CSRFContext'
import { useModal } from '../context/ModalContext'

function RoleManagement() {
  const { theme } = useTheme()
  const { csrfToken } = useCSRF()
  const { confirm: showConfirm, alert: showAlert } = useModal()
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    storage_quota: 10,
    color: '#6c757d',
    description: '',
    is_admin: false,
    upload_speed_limit: 0,
    download_speed_limit: 0
  })

  useEffect(() => {
    fetchRoles()
  }, [])

  const fetchRoles = async () => {
    try {
      const response = await fetch('/admin/api/roles')
      if (response.ok) {
        const data = await response.json()
        setRoles(data.roles || [])
      } else {
        setError('Failed to load roles')
      }
    } catch (err) {
      setError('Error loading roles: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateRole = async (e) => {
    e.preventDefault()
    try {
      const response = await fetch('/admin/api/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({
          ...formData,
          storage_quota: formData.storage_quota * 1024 * 1024 * 1024,
          upload_speed_limit: formData.upload_speed_limit * 1024 * 1024,
          download_speed_limit: formData.download_speed_limit * 1024 * 1024
        })
      })

      if (response.ok) {
        fetchRoles()
        setShowCreateModal(false)
        resetForm()
      } else {
        const data = await response.json()
        showAlert({ title: 'Error', message: data.error || 'Failed to create role', variant: 'danger', icon: 'fa-exclamation-circle' })
      }
    } catch (err) {
      showAlert({ title: 'Error', message: 'Error creating role: ' + err.message, variant: 'danger', icon: 'fa-exclamation-circle' })
    }
  }

  const handleUpdateRole = async (e) => {
    e.preventDefault()
    if (!editingRole) return

    try {
      const response = await fetch(`/admin/api/roles/${editingRole.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({
          ...formData,
          storage_quota: formData.storage_quota * 1024 * 1024 * 1024,
          upload_speed_limit: formData.upload_speed_limit * 1024 * 1024,
          download_speed_limit: formData.download_speed_limit * 1024 * 1024
        })
      })

      if (response.ok) {
        fetchRoles()
        setEditingRole(null)
        resetForm()
      } else {
        const data = await response.json()
        showAlert({ title: 'Error', message: data.error || 'Failed to update role', variant: 'danger', icon: 'fa-exclamation-circle' })
      }
    } catch (err) {
      showAlert({ title: 'Error', message: 'Error updating role: ' + err.message, variant: 'danger', icon: 'fa-exclamation-circle' })
    }
  }

  const handleDeleteRole = async (roleId, roleName) => {
    const confirmed = await showConfirm({
      title: 'Delete Role',
      message: `Are you sure you want to delete the role "${roleName}"? Users assigned to this role will need to be reassigned.`,
      confirmText: 'Delete Role',
      variant: 'danger',
      icon: 'fa-user-tag'
    })
    if (!confirmed) return

    try {
      const response = await fetch(`/admin/api/roles/${roleId}`, {
        method: 'DELETE',
        headers: {
          'X-CSRFToken': csrfToken
        }
      })

      if (response.ok) {
        fetchRoles()
      } else {
        const data = await response.json()
        showAlert({ title: 'Error', message: data.error || 'Failed to delete role', variant: 'danger', icon: 'fa-exclamation-circle' })
      }
    } catch (err) {
      showAlert({ title: 'Error', message: 'Error deleting role: ' + err.message, variant: 'danger', icon: 'fa-exclamation-circle' })
    }
  }

  const startEdit = (role) => {
    setEditingRole(role)
    setFormData({
      name: role.name,
      display_name: role.display_name || '',
      storage_quota: Math.round(role.storage_quota / (1024 * 1024 * 1024)),
      color: role.color || '#6c757d',
      description: role.description || '',
      is_admin: role.is_admin || false,
      upload_speed_limit: Math.round((role.upload_speed_limit || 0) / (1024 * 1024)),
      download_speed_limit: Math.round((role.download_speed_limit || 0) / (1024 * 1024))
    })
  }

  const resetForm = () => {
    setFormData({
      name: '',
      display_name: '',
      storage_quota: 10,
      color: '#6c757d',
      description: '',
      is_admin: false,
      upload_speed_limit: 0,
      download_speed_limit: 0
    })
  }

  const formatSize = (bytes) => {
    if (bytes >= 1024 * 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1) + ' TB'
    } else if (bytes >= 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
    } else if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }
    return bytes + ' B'
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="role-management">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h5 className="mb-0" style={{ color: theme.textPrimary }}>
          <i className="fas fa-user-tag me-2"></i>Role Management
        </h5>
        <button 
          className="btn btn-primary btn-sm"
          onClick={() => { resetForm(); setShowCreateModal(true); }}
        >
          <i className="fas fa-plus me-1"></i>Create Role
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="table-responsive">
        <table className="table table-hover" style={{ color: theme.textPrimary }}>
          <thead>
            <tr>
              <th>Role</th>
              <th>Storage Quota</th>
              <th>Users</th>
              <th>Admin</th>
              <th>Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.map(role => (
              <tr key={role.id}>
                <td>
                  <span 
                    className="badge me-2" 
                    style={{ backgroundColor: role.color, color: '#fff' }}
                  >
                    {role.display_name || role.name}
                  </span>
                  {role.description && (
                    <small className="text-muted d-block">{role.description}</small>
                  )}
                </td>
                <td>
                  {formatSize(role.storage_quota)}
                  {(role.upload_speed_limit > 0 || role.download_speed_limit > 0) && (
                    <div className="mt-1">
                      {role.upload_speed_limit > 0 && (
                        <small className="badge bg-info me-1"><i className="fas fa-arrow-up me-1"></i>{formatSize(role.upload_speed_limit)}/s</small>
                      )}
                      {role.download_speed_limit > 0 && (
                        <small className="badge bg-warning text-dark"><i className="fas fa-arrow-down me-1"></i>{formatSize(role.download_speed_limit)}/s</small>
                      )}
                    </div>
                  )}
                </td>
                <td>
                  <span className="badge bg-secondary">{role.user_count || 0}</span>
                </td>
                <td>
                  {role.is_admin ? (
                    <i className="fas fa-check text-success"></i>
                  ) : (
                    <i className="fas fa-times text-muted"></i>
                  )}
                </td>
                <td>
                  {role.is_system ? (
                    <span className="badge bg-info">System</span>
                  ) : (
                    <span className="badge bg-secondary">Custom</span>
                  )}
                </td>
                <td>
                  <div className="btn-group btn-group-sm">
                    <button
                      className="btn btn-outline-primary"
                      onClick={() => startEdit(role)}
                      title="Edit Role"
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    {!role.is_system && (
                      <button
                        className="btn btn-outline-danger"
                        onClick={() => handleDeleteRole(role.id, role.name)}
                        title="Delete Role"
                        disabled={role.user_count > 0}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingRole) && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content" style={{ backgroundColor: theme.bgCard, color: theme.textPrimary }}>
              <div className="modal-header" style={{ borderColor: theme.borderColor }}>
                <h5 className="modal-title">
                  {editingRole ? 'Edit Role' : 'Create New Role'}
                </h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => { setShowCreateModal(false); setEditingRole(null); resetForm(); }}
                ></button>
              </div>
              <form onSubmit={editingRole ? handleUpdateRole : handleCreateRole}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Role Name (ID)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')})}
                      placeholder="e.g., marketing, hr, developer"
                      disabled={editingRole?.is_system}
                      required
                      style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
                    />
                    <small className="text-muted">Lowercase letters, numbers, and underscores only</small>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Display Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.display_name}
                      onChange={(e) => setFormData({...formData, display_name: e.target.value})}
                      placeholder="e.g., Marketing Team"
                      disabled={editingRole?.is_system}
                      style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Storage Quota (GB)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={formData.storage_quota}
                      onChange={(e) => setFormData({...formData, storage_quota: parseInt(e.target.value) || 0})}
                      min="1"
                      max="10000"
                      required
                      style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Color</label>
                    <div className="d-flex gap-2">
                      <input
                        type="color"
                        className="form-control form-control-color"
                        value={formData.color}
                        onChange={(e) => setFormData({...formData, color: e.target.value})}
                        disabled={editingRole?.is_system}
                      />
                      <input
                        type="text"
                        className="form-control"
                        value={formData.color}
                        onChange={(e) => setFormData({...formData, color: e.target.value})}
                        disabled={editingRole?.is_system}
                        style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      rows="2"
                      style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
                    />
                  </div>

                  <div className="row mb-3">
                    <div className="col-6">
                      <label className="form-label">Upload Limit (MB/s)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={formData.upload_speed_limit}
                        onChange={(e) => setFormData({...formData, upload_speed_limit: parseInt(e.target.value) || 0})}
                        min="0"
                        placeholder="0 = unlimited"
                        style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
                      />
                      <small className="text-muted">0 = unlimited</small>
                    </div>
                    <div className="col-6">
                      <label className="form-label">Download Limit (MB/s)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={formData.download_speed_limit}
                        onChange={(e) => setFormData({...formData, download_speed_limit: parseInt(e.target.value) || 0})}
                        min="0"
                        placeholder="0 = unlimited"
                        style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
                      />
                      <small className="text-muted">0 = unlimited</small>
                    </div>
                  </div>

                  {!editingRole?.is_system && (
                    <div className="mb-3 form-check">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id="isAdmin"
                        checked={formData.is_admin}
                        onChange={(e) => setFormData({...formData, is_admin: e.target.checked})}
                      />
                      <label className="form-check-label" htmlFor="isAdmin">
                        Grant admin privileges
                      </label>
                    </div>
                  )}
                </div>
                <div className="modal-footer" style={{ borderColor: theme.borderColor }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    onClick={() => { setShowCreateModal(false); setEditingRole(null); resetForm(); }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {editingRole ? 'Save Changes' : 'Create Role'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RoleManagement
