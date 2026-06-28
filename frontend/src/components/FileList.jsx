import React, { useState } from 'react'
import { useCSRF } from '../context/CSRFContext'
import { useTheme } from '../context/ThemeContext'
import { useModal } from '../context/ModalContext'
import FilePreview from './FilePreview'
import ShareModal from './ShareModal'

function FileList({ files = [], tags = [], onFileDeleted, onTagsUpdated, onRefresh, showDeleted = false }) {
  const { csrfToken } = useCSRF()
  const { theme } = useTheme()
  const { confirm: showConfirm, alert: showAlert } = useModal()
  const [deletingId, setDeletingId] = useState(null)
  const [restoringId, setRestoringId] = useState(null)
  const [editingTagsId, setEditingTagsId] = useState(null)
  const [selectedTags, setSelectedTags] = useState([])
  const [deleteConfirm, setDeleteConfirm] = useState(null) // {id, name}
  const [notification, setNotification] = useState(null) // {type, message}
  const [previewFile, setPreviewFile] = useState(null)
  const [shareFile, setShareFile] = useState(null)

  const showNotification = (type, message) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString()
  }

  const confirmDelete = (file) => {
    setDeleteConfirm({ id: file.id, name: file.original_filename || file.filename })
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    const fileId = deleteConfirm.id

    setDeletingId(fileId)
    setDeleteConfirm(null)
    
    try {
      const response = await fetch(`/files/delete/${fileId}`, {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrfToken,
          'X-Requested-With': 'XMLHttpRequest'
        }
      })

      if (response.ok) {
        showNotification('success', 'File deleted successfully')
        onFileDeleted?.(fileId)
        onRefresh?.() // Trigger refresh
      } else {
        let errorMsg = 'Failed to delete file'
        try {
          const data = await response.json()
          errorMsg = data.error || errorMsg
        } catch {}
        showNotification('error', errorMsg)
      }
    } catch (err) {
      showNotification('error', 'Error deleting file: ' + err.message)
    } finally {
      setDeletingId(null)
    }
  }

  const openTagEditor = (file) => {
    setEditingTagsId(file.id)
    setSelectedTags((file.tags || []).map(t => t.id))
  }

  const handleTagToggle = (tagId) => {
    setSelectedTags(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }

  const saveTags = async () => {
    const fileId = editingTagsId
    try {
      const formData = new FormData()
      formData.append('csrf_token', csrfToken)
      selectedTags.forEach(tagId => formData.append('tags', tagId))

      const response = await fetch(`/files/tag/${fileId}`, {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrfToken,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: formData
      })

      if (response.ok) {
        const updatedTags = tags.filter(t => selectedTags.includes(t.id))
        onTagsUpdated?.(fileId, updatedTags)
        setEditingTagsId(null)
      } else {
        showAlert({ title: 'Error', message: 'Failed to update tags', variant: 'danger', icon: 'fa-exclamation-circle' })
      }
    } catch (err) {
      showAlert({ title: 'Error', message: 'Error updating tags: ' + err.message, variant: 'danger', icon: 'fa-exclamation-circle' })
    }
  }

  const handleRestore = async (fileId) => {
    setRestoringId(fileId)
    try {
      const response = await fetch(`/files/restore/${fileId}`, {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrfToken,
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      })

      if (response.ok) {
        showNotification('success', 'File restored successfully')
        onRefresh?.()
      } else {
        let errorMsg = 'Failed to restore file'
        try {
          const data = await response.json()
          errorMsg = data.error || errorMsg
        } catch {}
        showNotification('error', errorMsg)
      }
    } catch (err) {
      showNotification('error', 'Error restoring file: ' + err.message)
    } finally {
      setRestoringId(null)
    }
  }

  const handlePermanentDelete = async (fileId) => {
    const confirmed = await showConfirm({
      title: 'Permanently Delete File',
      message: 'This file will be permanently removed and cannot be recovered. This will free up storage space.',
      confirmText: 'Delete Forever',
      variant: 'danger',
      icon: 'fa-trash'
    })
    if (!confirmed) return
    
    setDeletingId(fileId)
    try {
      const response = await fetch(`/files/permanent-delete/${fileId}`, {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrfToken,
          'X-Requested-With': 'XMLHttpRequest'
        }
      })

      if (response.ok) {
        showNotification('success', 'File permanently deleted')
        onFileDeleted?.(fileId)
        onRefresh?.()
      } else {
        let errorMsg = 'Failed to delete file'
        try {
          const data = await response.json()
          errorMsg = data.error || errorMsg
        } catch {}
        showNotification('error', errorMsg)
      }
    } catch (err) {
      showNotification('error', 'Error deleting file: ' + err.message)
    } finally {
      setDeletingId(null)
    }
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-5" style={{ color: theme.textSecondary }}>
        <i className="fas fa-folder-open fa-3x mb-3"></i>
        <p>No files uploaded yet</p>
      </div>
    )
  }

  return (
    <div className="table-responsive">
      <table className="table table-hover" style={{ color: theme.textPrimary }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Tags</th>
            <th>Size</th>
            <th>Uploaded</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {files.map(file => (
            <tr key={file.id}>
              <td>
                <i className="fas fa-file me-2" style={{ color: theme.colorPrimary }}></i>
                {file.original_filename || file.filename}
              </td>
              <td>
                <span className="badge bg-secondary">
                  {file.category || 'other'}
                </span>
              </td>
              <td>
                <div className="d-flex flex-wrap gap-1">
                  {(file.tags || []).map(tag => (
                    <span 
                      key={tag.id} 
                      className="badge"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              </td>
              <td>{formatSize(file.file_size || 0)}</td>
              <td>{formatDate(file.uploaded_at)}</td>
              <td>
                <div className="btn-group btn-group-sm">
                  <button
                    className="btn btn-primary"
                    onClick={() => setPreviewFile(file)}
                    title="Preview"
                  >
                    <i className="fas fa-eye"></i>
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShareFile(file)}
                    title="Share"
                  >
                    <i className="fas fa-share-alt"></i>
                  </button>
                  <a
                    href={`/files/download/${file.id}`}
                    className="btn btn-success"
                    title="Download"
                  >
                    <i className="fas fa-download"></i>
                  </a>
                  <button
                    className="btn btn-info"
                    onClick={() => openTagEditor(file)}
                    title="Edit Tags"
                  >
                    <i className="fas fa-tags"></i>
                  </button>
                  {showDeleted ? (
                    <>
                      <button
                        className="btn btn-success"
                        onClick={() => handleRestore(file.id)}
                        disabled={restoringId === file.id}
                        title="Restore"
                      >
                        {restoringId === file.id ? (
                          <span className="spinner-border spinner-border-sm"></span>
                        ) : (
                          <i className="fas fa-undo"></i>
                        )}
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handlePermanentDelete(file.id)}
                        disabled={deletingId === file.id}
                        title="Delete Permanently"
                      >
                        {deletingId === file.id ? (
                          <span className="spinner-border spinner-border-sm"></span>
                        ) : (
                          <i className="fas fa-times"></i>
                        )}
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-danger"
                      onClick={() => confirmDelete(file)}
                      disabled={deletingId === file.id}
                      title="Delete"
                    >
                      {deletingId === file.id ? (
                        <span className="spinner-border spinner-border-sm"></span>
                      ) : (
                        <i className="fas fa-trash"></i>
                      )}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Notification Toast */}
      {notification && (
        <div 
          className="position-fixed bottom-0 end-0 p-3" 
          style={{ zIndex: 1100 }}
        >
          <div 
            className={`toast show align-items-center text-white border-0 ${
              notification.type === 'success' ? 'bg-success' : 'bg-danger'
            }`}
            role="alert"
          >
            <div className="d-flex">
              <div className="toast-body">
                <i className={`fas ${notification.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} me-2`}></i>
                {notification.message}
              </div>
              <button 
                type="button" 
                className="btn-close btn-close-white me-2 m-auto" 
                onClick={() => setNotification(null)}
              ></button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
              <div className="modal-header border-0" style={{ backgroundColor: theme.bgNav }}>
                <h5 className="modal-title" style={{ color: theme.textPrimary }}>
                  <i className="fas fa-exclamation-triangle text-warning me-2"></i>
                  Confirm Delete
                </h5>
                <button type="button" className="btn-close" onClick={() => setDeleteConfirm(null)}></button>
              </div>
              <div className="modal-body text-center py-4">
                <div className="mb-3">
                  <i className="fas fa-file fa-3x" style={{ color: theme.textSecondary }}></i>
                </div>
                <p style={{ color: theme.textPrimary }} className="mb-1">
                  Are you sure you want to delete this file?
                </p>
                <p className="text-muted small mb-0">
                  <strong>{deleteConfirm.name}</strong>
                </p>
                <p className="text-muted small mt-2">
                  <i className="fas fa-info-circle me-1"></i>
                  File will be moved to deleted files. You can restore it later.
                </p>
              </div>
              <div className="modal-footer border-0 justify-content-center gap-2">
                <button 
                  className="btn btn-secondary px-4" 
                  onClick={() => setDeleteConfirm(null)}
                >
                  <i className="fas fa-times me-1"></i>Cancel
                </button>
                <button 
                  className="btn btn-danger px-4" 
                  onClick={handleDelete}
                >
                  <i className="fas fa-trash me-1"></i>Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tag Editor Modal */}
      {editingTagsId && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
              <div className="modal-header" style={{ borderColor: theme.borderColor }}>
                <h5 className="modal-title" style={{ color: theme.textPrimary }}>Edit Tags</h5>
                <button type="button" className="btn-close" onClick={() => setEditingTagsId(null)}></button>
              </div>
              <div className="modal-body">
                {tags.length === 0 ? (
                  <p style={{ color: theme.textSecondary }}>No tags available. Create some first.</p>
                ) : (
                  <div className="d-flex flex-wrap gap-2">
                    {tags.map(tag => (
                      <div key={tag.id} className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`tag-${tag.id}`}
                          checked={selectedTags.includes(tag.id)}
                          onChange={() => handleTagToggle(tag.id)}
                        />
                        <label className="form-check-label" htmlFor={`tag-${tag.id}`}>
                          <span className="badge" style={{ backgroundColor: tag.color }}>{tag.name}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ borderColor: theme.borderColor }}>
                <button className="btn btn-secondary" onClick={() => setEditingTagsId(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveTags}>Save Tags</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      {/* Share Modal */}
      {shareFile && (
        <ShareModal file={shareFile} onClose={() => setShareFile(null)} />
      )}
    </div>
  )
}

export default FileList
