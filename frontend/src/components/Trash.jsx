import React, { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useCSRF } from '../context/CSRFContext'
import { useModal } from '../context/ModalContext'

function Trash() {
  const { theme } = useTheme()
  const { csrfToken } = useCSRF()
  const { confirm: showConfirm } = useModal()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  useEffect(() => {
    fetchTrashedFiles()
  }, [])

  const fetchTrashedFiles = async () => {
    try {
      const response = await fetch('/api/trash/')
      if (response.ok) {
        const data = await response.json()
        setFiles(data.files || [])
      }
    } catch (error) {
      console.error('Error fetching trashed files:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const restoreFile = async (trashId) => {
    try {
      const response = await fetch(`/api/trash/restore/${trashId}`, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrfToken }
      })
      const data = await response.json()
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'File restored successfully' })
        setFiles(prev => prev.filter(f => f.id !== trashId))
      } else {
        setMessage({ type: 'danger', text: data.error || 'Failed to restore file' })
      }
    } catch (error) {
      setMessage({ type: 'danger', text: 'Error restoring file' })
    }
  }

  const permanentlyDelete = async (trashId) => {
    const confirmed = await showConfirm({
      title: 'Permanently Delete',
      message: 'This file will be permanently removed and cannot be recovered.',
      confirmText: 'Delete Forever',
      variant: 'danger',
      icon: 'fa-trash'
    })
    if (!confirmed) return
    
    try {
      const response = await fetch(`/api/trash/delete/${trashId}`, {
        method: 'DELETE',
        headers: { 'X-CSRFToken': csrfToken }
      })
      const data = await response.json()
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'File permanently deleted' })
        setFiles(prev => prev.filter(f => f.id !== trashId))
      } else {
        setMessage({ type: 'danger', text: data.error || 'Failed to delete file' })
      }
    } catch (error) {
      setMessage({ type: 'danger', text: 'Error deleting file' })
    }
  }

  const emptyTrash = async () => {
    try {
      const response = await fetch('/api/trash/empty', {
        method: 'DELETE',
        headers: { 'X-CSRFToken': csrfToken }
      })
      const data = await response.json()
      
      if (response.ok) {
        setMessage({ type: 'success', text: `Deleted ${data.deleted} files permanently` })
        setFiles([])
      } else {
        setMessage({ type: 'danger', text: data.error || 'Failed to empty trash' })
      }
    } catch (error) {
      setMessage({ type: 'danger', text: 'Error emptying trash' })
    } finally {
      setConfirmEmpty(false)
    }
  }

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border" style={{ color: theme.colorPrimary }}></div>
      </div>
    )
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 style={{ color: theme.textPrimary, fontWeight: 700 }}>
            <i className="fas fa-trash-alt me-2" style={{ color: theme.colorPrimary }}></i>
            Trash
          </h2>
          <p style={{ color: theme.textSecondary }}>
            Deleted files are kept for 30 days before permanent deletion
          </p>
        </div>
        {files.length > 0 && (
          <button
            className="btn btn-outline-danger"
            onClick={() => setConfirmEmpty(true)}
          >
            <i className="fas fa-trash me-2"></i>Empty Trash
          </button>
        )}
      </div>

      {message && (
        <div className={`alert alert-${message.type} alert-dismissible fade show`}>
          <i className={`fas ${message.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} me-2`}></i>
          {message.text}
          <button className="btn-close" onClick={() => setMessage(null)}></button>
        </div>
      )}

      {files.length === 0 ? (
        <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
          <div className="card-body text-center py-5">
            <i className="fas fa-trash-alt fa-4x mb-3" style={{ color: theme.textSecondary }}></i>
            <h5 style={{ color: theme.textPrimary }}>Trash is empty</h5>
            <p style={{ color: theme.textSecondary }}>Deleted files will appear here</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ color: theme.textPrimary }}>
              <thead>
                <tr style={{ borderColor: theme.borderColor }}>
                  <th style={{ color: theme.textSecondary }}>File</th>
                  <th style={{ color: theme.textSecondary }}>Size</th>
                  <th style={{ color: theme.textSecondary }}>Deleted</th>
                  <th style={{ color: theme.textSecondary }}>Days Remaining</th>
                  <th style={{ color: theme.textSecondary }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map(file => (
                  <tr key={file.id} style={{ borderColor: theme.borderColor }}>
                    <td>
                      <i className="fas fa-file me-2" style={{ color: theme.colorPrimary }}></i>
                      {file.original_filename}
                    </td>
                    <td>{formatSize(file.file_size)}</td>
                    <td>{new Date(file.deleted_at).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge ${file.days_remaining <= 7 ? 'bg-danger' : 'bg-secondary'}`}>
                        {file.days_remaining} days
                      </span>
                    </td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button
                          className="btn btn-success"
                          onClick={() => restoreFile(file.id)}
                          title="Restore"
                        >
                          <i className="fas fa-undo"></i>
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => permanentlyDelete(file.id)}
                          title="Delete Permanently"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty Trash Confirmation Modal */}
      {confirmEmpty && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
              <div className="modal-header border-0" style={{ backgroundColor: theme.bgNav }}>
                <h5 className="modal-title" style={{ color: theme.textPrimary }}>
                  <i className="fas fa-exclamation-triangle text-warning me-2"></i>
                  Empty Trash
                </h5>
                <button className="btn-close" onClick={() => setConfirmEmpty(false)}></button>
              </div>
              <div className="modal-body text-center py-4">
                <i className="fas fa-trash-alt fa-3x mb-3 text-danger"></i>
                <p style={{ color: theme.textPrimary }}>
                  Are you sure you want to permanently delete all {files.length} files?
                </p>
                <p className="text-danger small">This action cannot be undone.</p>
              </div>
              <div className="modal-footer border-0 justify-content-center">
                <button className="btn btn-secondary" onClick={() => setConfirmEmpty(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={emptyTrash}>
                  <i className="fas fa-trash me-2"></i>Empty Trash
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Trash
