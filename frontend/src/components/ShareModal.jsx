import React, { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useCSRF } from '../context/CSRFContext'

function ShareModal({ file, onClose }) {
  const { theme } = useTheme()
  const { csrfToken } = useCSRF()
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(null)
  const [notification, setNotification] = useState(null)
  
  // New link options
  const [expiresIn, setExpiresIn] = useState('')
  const [password, setPassword] = useState('')
  const [allowDownload, setAllowDownload] = useState(true)
  const [allowPreview, setAllowPreview] = useState(true)

  useEffect(() => {
    if (file) fetchLinks()
  }, [file])

  const fetchLinks = async () => {
    try {
      const res = await fetch(`/files/api/share/${file.id}/links`)
      if (res.ok) {
        const data = await res.json()
        setLinks(data.links || [])
      }
    } catch (err) {
      console.error('Error fetching links:', err)
    } finally {
      setLoading(false)
    }
  }

  const createLink = async () => {
    setCreating(true)
    try {
      const res = await fetch(`/files/api/share/${file.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({
          expires_in: expiresIn || null,
          password: password || null,
          allow_download: allowDownload,
          allow_preview: allowPreview
        })
      })
      
      if (res.ok) {
        const data = await res.json()
        setLinks(prev => [data.share, ...prev])
        showNotification('success', 'Share link created!')
        // Reset form
        setExpiresIn('')
        setPassword('')
      } else {
        const err = await res.json()
        showNotification('error', err.error || 'Failed to create link')
      }
    } catch (err) {
      showNotification('error', 'Error creating link')
    } finally {
      setCreating(false)
    }
  }

  const revokeLink = async (linkId) => {
    try {
      const res = await fetch(`/files/api/share/revoke/${linkId}`, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrfToken }
      })
      
      if (res.ok) {
        setLinks(prev => prev.map(l => 
          l.id === linkId ? { ...l, is_revoked: true, is_valid: false } : l
        ))
        showNotification('success', 'Link revoked')
      }
    } catch (err) {
      showNotification('error', 'Error revoking link')
    }
  }

  const copyLink = async (token) => {
    const url = `${window.location.origin}/s/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      showNotification('error', 'Failed to copy')
    }
  }

  const showNotification = (type, message) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  if (!file) return null

  return (
    <div 
      className="modal show d-block" 
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
          <div className="modal-header" style={{ backgroundColor: theme.bgNav, borderColor: theme.borderColor }}>
            <h5 className="modal-title" style={{ color: theme.textPrimary }}>
              <i className="fas fa-share-alt me-2"></i>
              Share: {file.original_filename || file.filename}
            </h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          
          <div className="modal-body">
            {/* Create New Link */}
            <div className="card mb-4" style={{ backgroundColor: theme.bgBody, borderColor: theme.borderColor }}>
              <div className="card-header py-2" style={{ backgroundColor: theme.bgNav }}>
                <h6 className="mb-0" style={{ color: theme.textPrimary }}>
                  <i className="fas fa-plus-circle me-2"></i>Create New Link
                </h6>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label small" style={{ color: theme.textSecondary }}>Expires In</label>
                    <select 
                      className="form-select form-select-sm"
                      value={expiresIn}
                      onChange={(e) => setExpiresIn(e.target.value)}
                      style={{ backgroundColor: theme.bgCard, color: theme.textPrimary, borderColor: theme.borderColor }}
                    >
                      <option value="">Never</option>
                      <option value="1">1 hour</option>
                      <option value="24">24 hours</option>
                      <option value="168">7 days</option>
                      <option value="720">30 days</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small" style={{ color: theme.textSecondary }}>Password (optional)</label>
                    <input 
                      type="password"
                      className="form-control form-control-sm"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Leave empty for no password"
                      style={{ backgroundColor: theme.bgCard, color: theme.textPrimary, borderColor: theme.borderColor }}
                    />
                  </div>
                  <div className="col-12">
                    <div className="d-flex gap-3">
                      <div className="form-check">
                        <input 
                          type="checkbox" 
                          className="form-check-input" 
                          id="allowPreview"
                          checked={allowPreview}
                          onChange={(e) => setAllowPreview(e.target.checked)}
                        />
                        <label className="form-check-label small" htmlFor="allowPreview" style={{ color: theme.textSecondary }}>
                          Allow Preview
                        </label>
                      </div>
                      <div className="form-check">
                        <input 
                          type="checkbox" 
                          className="form-check-input" 
                          id="allowDownload"
                          checked={allowDownload}
                          onChange={(e) => setAllowDownload(e.target.checked)}
                        />
                        <label className="form-check-label small" htmlFor="allowDownload" style={{ color: theme.textSecondary }}>
                          Allow Download
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="col-12">
                    <button 
                      className="btn btn-primary btn-sm"
                      onClick={createLink}
                      disabled={creating}
                    >
                      {creating ? (
                        <><span className="spinner-border spinner-border-sm me-1"></span>Creating...</>
                      ) : (
                        <><i className="fas fa-link me-1"></i>Create Link</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Existing Links */}
            <h6 style={{ color: theme.textPrimary }}>
              <i className="fas fa-list me-2"></i>Active Links ({links.filter(l => l.is_valid).length})
            </h6>
            
            {loading ? (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm"></div>
              </div>
            ) : links.length === 0 ? (
              <div className="text-center py-3" style={{ color: theme.textSecondary }}>
                <i className="fas fa-link-slash fa-2x mb-2"></i>
                <p className="mb-0">No share links yet</p>
              </div>
            ) : (
              <div className="list-group">
                {links.map(link => (
                  <div 
                    key={link.id} 
                    className="list-group-item d-flex justify-content-between align-items-center"
                    style={{ 
                      backgroundColor: link.is_valid ? theme.bgBody : 'rgba(220,53,69,0.1)',
                      borderColor: theme.borderColor,
                      opacity: link.is_valid ? 1 : 0.6
                    }}
                  >
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <code style={{ fontSize: '0.8rem', color: theme.colorPrimary }}>
                          /s/{link.token.substring(0, 12)}...
                        </code>
                        {link.has_password && (
                          <span className="badge bg-warning text-dark">
                            <i className="fas fa-lock"></i>
                          </span>
                        )}
                        {!link.is_valid && (
                          <span className="badge bg-danger">
                            {link.is_revoked ? 'Revoked' : 'Expired'}
                          </span>
                        )}
                      </div>
                      <small style={{ color: theme.textSecondary }}>
                        <i className="fas fa-eye me-1"></i>{link.access_count} views
                        {' • '}
                        <i className="fas fa-clock me-1"></i>
                        {link.expires_at ? `Expires: ${formatDate(link.expires_at)}` : 'Never expires'}
                      </small>
                    </div>
                    <div className="d-flex gap-1">
                      {link.is_valid && (
                        <>
                          <button 
                            className={`btn btn-sm ${copied === link.token ? 'btn-success' : 'btn-outline-primary'}`}
                            onClick={() => copyLink(link.token)}
                            title="Copy link"
                          >
                            <i className={`fas ${copied === link.token ? 'fa-check' : 'fa-copy'}`}></i>
                          </button>
                          <button 
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => revokeLink(link.id)}
                            title="Revoke"
                          >
                            <i className="fas fa-ban"></i>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="position-fixed bottom-0 end-0 p-3" style={{ zIndex: 1100 }}>
          <div className={`toast show align-items-center text-white border-0 ${
            notification.type === 'success' ? 'bg-success' : 'bg-danger'
          }`}>
            <div className="d-flex">
              <div className="toast-body">
                <i className={`fas ${notification.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} me-2`}></i>
                {notification.message}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ShareModal
