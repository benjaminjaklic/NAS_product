import React, { useState } from 'react'
import { useCSRF } from '../context/CSRFContext'
import { useTheme } from '../context/ThemeContext'
import { useModal } from '../context/ModalContext'

function TagManager({ tags = [], onTagCreated, onTagDeleted }) {
  const { csrfToken } = useCSRF()
  const { theme } = useTheme()
  const { confirm: showConfirm } = useModal()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6c757d')
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('Tag name is required')
      return
    }

    setLoading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('action', 'create')
      formData.append('name', name)
      formData.append('color', color)
      formData.append('csrf_token', csrfToken)

      const response = await fetch('/files/tags', {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrfToken,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        onTagCreated?.(data.tag || { name, color, id: Date.now() })
        setName('')
        setColor('#6c757d')
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to create tag')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (tagId, tagName) => {
    const confirmed = await showConfirm({
      title: 'Delete Tag',
      message: `Are you sure you want to delete the tag "${tagName}"?`,
      confirmText: 'Delete',
      variant: 'danger',
      icon: 'fa-tag'
    })
    if (!confirmed) return

    setDeletingId(tagId)
    setError('')

    try {
      const formData = new FormData()
      formData.append('action', 'delete')
      formData.append('tag_id', tagId)
      formData.append('csrf_token', csrfToken)

      const response = await fetch('/files/tags', {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrfToken,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: formData
      })

      if (response.ok) {
        onTagDeleted?.(tagId)
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to delete tag')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
      <div className="card-header" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary }}>
        <h5 className="mb-0">
          <i className="fas fa-tags me-2"></i>
          Tags
        </h5>
      </div>
      <div className="card-body">
        {error && (
          <div className="alert alert-danger alert-sm" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mb-3">
          <div className="input-group">
            <input
              type="text"
              className="form-control"
              placeholder="Tag name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
            <input
              type="color"
              className="form-control form-control-color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              disabled={loading}
              style={{ maxWidth: '50px' }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !name.trim()}
              style={{ backgroundColor: theme.colorPrimary }}
            >
              {loading ? (
                <span className="spinner-border spinner-border-sm"></span>
              ) : (
                <i className="fas fa-plus"></i>
              )}
            </button>
          </div>
        </form>

        <div className="d-flex flex-wrap gap-2">
          {tags.map(tag => (
            <span
              key={tag.id}
              className="badge d-inline-flex align-items-center gap-1"
              style={{ 
                backgroundColor: tag.color,
                fontSize: '0.875rem',
                padding: '0.4rem 0.6rem'
              }}
            >
              {tag.name}
              {!tag.is_system && (
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  style={{
                    fontSize: '0.6rem',
                    opacity: 0.7,
                    padding: 0,
                    width: '0.75rem',
                    height: '0.75rem'
                  }}
                  onClick={() => handleDelete(tag.id, tag.name)}
                  disabled={deletingId === tag.id}
                  title="Delete tag"
                  aria-label="Delete tag"
                />
              )}
            </span>
          ))}
          {tags.length === 0 && (
            <p className="text-muted mb-0" style={{ color: theme.textSecondary }}>
              No tags yet
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default TagManager
