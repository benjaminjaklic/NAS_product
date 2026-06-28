import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import FileUpload from './FileUpload'
import TagManager from './TagManager'
import FileList from './FileList'
import { FileListSkeleton, StorageBarSkeleton } from './SkeletonLoader'
import { useTheme } from '../context/ThemeContext'
import { useModal } from '../context/ModalContext'
import { useUpload } from '../context/UploadContext'

function Dashboard() {
  const { theme } = useTheme()
  const { alert: showAlert } = useModal()
  const { hasActiveUploads, lastCompletedAt } = useUpload()
  const location = useLocation()
  const [files, setFiles] = useState([])
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [showDeleted, setShowDeleted] = useState(false)
  const [filteredFiles, setFilteredFiles] = useState([])
  const [storageInfo, setStorageInfo] = useState(null)
  const [showStorageRequest, setShowStorageRequest] = useState(false)
  const [requestReason, setRequestReason] = useState('')
  const [requestTier, setRequestTier] = useState('plus')
  const [requestSubmitting, setRequestSubmitting] = useState(false)

  const showDeletedRef = useRef(showDeleted)
  showDeletedRef.current = showDeleted

  // Refresh data when component mounts or when navigating back to dashboard
  useEffect(() => {
    fetchFiles()
    fetchTags()
    fetchStorageInfo()
  }, [location.pathname])

  // Refresh on window focus (when user returns to tab)
  useEffect(() => {
    const handleFocus = () => {
      fetchFiles(showDeletedRef.current)
      fetchTags()
      fetchStorageInfo()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Auto-polling: 5s when uploads active, 15s otherwise
  useEffect(() => {
    const interval = hasActiveUploads ? 5000 : 15000
    const timer = setInterval(() => {
      if (document.hidden) return // skip when tab not visible
      fetchStorageInfo()
      fetchFilesSilent(showDeletedRef.current)
    }, interval)
    return () => clearInterval(timer)
  }, [hasActiveUploads])

  // Refresh immediately when an upload completes
  useEffect(() => {
    if (lastCompletedAt > 0) {
      fetchFilesSilent(showDeletedRef.current)
      fetchStorageInfo()
      fetchTags()
    }
  }, [lastCompletedAt])

  useEffect(() => {
    // Filter files based on search query and selected tags
    let filtered = files
    
    // Filter by search query
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(file => {
        const filename = (file.original_filename || file.filename || '').toLowerCase()
        const category = (file.category || '').toLowerCase()
        const tags = (file.tags || []).map(t => t.name.toLowerCase()).join(' ')
        return filename.includes(query) || category.includes(query) || tags.includes(query)
      })
    }
    
    // Filter by selected tags (files must have ALL selected tags)
    if (selectedTags.length > 0) {
      filtered = filtered.filter(file => {
        const fileTags = (file.tags || []).map(t => t.id)
        return selectedTags.every(tagId => fileTags.includes(tagId))
      })
    }
    
    setFilteredFiles(filtered)
  }, [searchQuery, selectedTags, files])

  const fetchFiles = async (includeDeleted = false) => {
    setLoading(true)
    try {
      const url = includeDeleted ? '/files/api/list?show_deleted=true' : '/files/api/list'
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setFiles(data.files || [])
        setFilteredFiles(data.files || [])
      }
    } catch (error) {
      console.error('Error fetching files:', error)
    } finally {
      setLoading(false)
    }
  }

  // Silent fetch — no loading skeleton, used by polling & upload completion
  const fetchFilesSilent = async (includeDeleted = false) => {
    try {
      const url = includeDeleted ? '/files/api/list?show_deleted=true' : '/files/api/list'
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setFiles(data.files || [])
      }
    } catch (error) {
      // silent — don't spam console during polling
    }
  }

  const toggleShowDeleted = () => {
    const newValue = !showDeleted
    setShowDeleted(newValue)
    fetchFiles(newValue)
  }

  const fetchTags = async () => {
    try {
      const response = await fetch('/files/api/tags')
      if (response.ok) {
        const data = await response.json()
        setTags(data.tags || [])
      }
    } catch (error) {
      console.error('Error fetching tags:', error)
    }
  }

  const fetchStorageInfo = async () => {
    try {
      const response = await fetch('/files/api/storage-info')
      if (response.ok) {
        const data = await response.json()
        setStorageInfo(data)
      }
    } catch (error) {
      console.error('Error fetching storage info:', error)
    }
  }

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const submitStorageRequest = async () => {
    setRequestSubmitting(true)
    try {
      const formData = new URLSearchParams()
      formData.append('reason', requestReason)
      formData.append('requested_tier', requestTier)
      
      const response = await fetch('/files/api/request-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      })
      
      const data = await response.json()
      if (response.ok) {
        showAlert({ title: 'Request Submitted', message: 'An admin will review your storage request soon.', variant: 'success', icon: 'fa-check-circle' })
        setShowStorageRequest(false)
        setRequestReason('')
      } else {
        showAlert({ title: 'Error', message: data.error || 'Failed to submit request', variant: 'danger', icon: 'fa-exclamation-circle' })
      }
    } catch (error) {
      showAlert({ title: 'Error', message: 'Error submitting request: ' + error.message, variant: 'danger', icon: 'fa-exclamation-circle' })
    } finally {
      setRequestSubmitting(false)
    }
  }

  const handleUploadSuccess = (newFile) => {
    // Full refresh after upload to ensure consistency
    fetchFiles()
    fetchTags()
    fetchStorageInfo()
  }

  const handleTagCreated = (newTag) => {
    setTags(prev => [...prev, newTag])
  }

  const handleTagDeleted = (tagId) => {
    setTags(prev => prev.filter(t => t.id !== tagId))
    // Also remove the tag from all files
    setFiles(prev => prev.map(f => ({
      ...f,
      tags: f.tags.filter(t => t.id !== tagId)
    })))
  }

  const handleFileDeleted = (fileId) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const handleTagsUpdated = (fileId, newTags) => {
    setFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, tags: newTags } : f
    ))
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 style={{ color: theme.textPrimary }}>
          <i className="fas fa-home me-2"></i>Dashboard
        </h2>
      </div>

      {/* Storage Warning Banner */}
      {storageInfo && storageInfo.warning_level && (
        <div className={`alert ${storageInfo.warning_level === 'critical' ? 'alert-danger' : 'alert-warning'} d-flex justify-content-between align-items-center mb-4`}>
          <div>
            <i className={`fas ${storageInfo.warning_level === 'critical' ? 'fa-exclamation-triangle' : 'fa-exclamation-circle'} me-2`}></i>
            <strong>
              {storageInfo.warning_level === 'critical' 
                ? 'Critical: Storage almost full!' 
                : 'Warning: Storage running low'}
            </strong>
            <span className="ms-2">
              {formatSize(storageInfo.storage_used)} of {formatSize(storageInfo.storage_limit)} used ({storageInfo.percentage}%)
            </span>
          </div>
          <button 
            className="btn btn-sm btn-outline-dark"
            onClick={() => setShowStorageRequest(true)}
          >
            <i className="fas fa-plus me-1"></i>Request More Space
          </button>
        </div>
      )}

      {/* Storage Info Bar */}
      {storageInfo && (
        <div className="card mb-4" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
          <div className="card-body py-2">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <div className="d-flex align-items-center flex-wrap gap-2">
                <small style={{ 
                  color: storageInfo.percentage >= 90 ? '#dc3545' : 
                         storageInfo.percentage >= 75 ? '#ffc107' : 
                         theme.textSecondary,
                  fontWeight: storageInfo.percentage >= 75 ? 600 : 400
                }}>
                  <i className="fas fa-hdd me-1"></i>
                  Storage: {formatSize(storageInfo.storage_used)} / {formatSize(storageInfo.storage_limit)}
                </small>
                <span className="badge" style={{ 
                  backgroundColor: storageInfo.storage_tier === 'pro' ? '#6f42c1' : 
                                   storageInfo.storage_tier === 'plus' ? '#0d6efd' : 
                                   storageInfo.storage_tier === 'demo' ? '#6c757d' : '#198754'
                }}>
                  {storageInfo.storage_tier?.toUpperCase()}
                </span>
                {(storageInfo.upload_speed_limit > 0 || storageInfo.download_speed_limit > 0) && (
                  <>
                    {storageInfo.upload_speed_limit > 0 && (
                      <span className="badge bg-info" title="Upload speed limit">
                        <i className="fas fa-arrow-up me-1"></i>{formatSize(storageInfo.upload_speed_limit)}/s
                      </span>
                    )}
                    {storageInfo.download_speed_limit > 0 && (
                      <span className="badge bg-warning text-dark" title="Download speed limit">
                        <i className="fas fa-arrow-down me-1"></i>{formatSize(storageInfo.download_speed_limit)}/s
                      </span>
                    )}
                  </>
                )}
                {storageInfo.percentage >= 75 && (
                  <button
                    className="btn btn-sm btn-outline-warning py-0 px-2"
                    onClick={() => setShowStorageRequest(true)}
                    style={{ fontSize: '0.75rem', lineHeight: '1.5' }}
                  >
                    <i className="fas fa-plus me-1"></i>Request More
                  </button>
                )}
              </div>
              <small style={{ 
                color: storageInfo.percentage >= 90 ? '#dc3545' : 
                       storageInfo.percentage >= 75 ? '#ffc107' : 
                       theme.textSecondary,
                fontWeight: storageInfo.percentage >= 75 ? 600 : 400
              }}>
                {storageInfo.percentage}%
              </small>
            </div>
            <div className="progress" style={{ height: '6px', backgroundColor: theme.borderColor }}>
              <div 
                className="progress-bar" 
                style={{ 
                  width: `${storageInfo.percentage}%`,
                  backgroundColor: storageInfo.percentage >= 90 ? '#dc3545' : 
                                   storageInfo.percentage >= 75 ? '#ffc107' : '#28a745'
                }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Storage Request Modal */}
      {showStorageRequest && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content" style={{ backgroundColor: theme.bgCard, color: theme.textPrimary }}>
              <div className="modal-header" style={{ borderColor: theme.borderColor }}>
                <h5 className="modal-title">
                  <i className="fas fa-arrow-up me-2"></i>Request Storage Upgrade
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowStorageRequest(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Current Tier</label>
                  <div className="form-control" style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}>
                    {storageInfo?.storage_tier?.toUpperCase()} ({formatSize(storageInfo?.storage_limit)})
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Requested Tier</label>
                  <select 
                    className="form-select" 
                    value={requestTier} 
                    onChange={(e) => setRequestTier(e.target.value)}
                    style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
                  >
                    <option value="basic">Basic (50GB)</option>
                    <option value="plus">Plus (100GB)</option>
                    <option value="pro">Pro (200GB)</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label">Reason for Request</label>
                  <textarea 
                    className="form-control" 
                    rows="3"
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    placeholder="Why do you need more storage?"
                    style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer" style={{ borderColor: theme.borderColor }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowStorageRequest(false)}>
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={submitStorageRequest}
                  disabled={requestSubmitting}
                >
                  {requestSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="row mb-4">
        <div className="col-lg-8 mb-4 mb-lg-0">
          <FileUpload 
            tags={tags} 
            onUploadSuccess={handleUploadSuccess} 
          />
        </div>
        <div className="col-lg-4">
          <TagManager 
            tags={tags} 
            onTagCreated={handleTagCreated}
            onTagDeleted={handleTagDeleted}
          />
        </div>
      </div>

      <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
        <div className="card-header" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary }}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="mb-0">
              <i className="fas fa-folder me-2"></i>My Files
              {showDeleted && <span className="badge bg-danger ms-2">Showing Deleted</span>}
            </h5>
            <div className="d-flex align-items-center gap-2">
              <button
                className={`btn btn-sm ${showDeleted ? 'btn-danger' : 'btn-outline-secondary'}`}
                onClick={toggleShowDeleted}
                title={showDeleted ? 'Hide deleted files' : 'Show deleted files'}
              >
                <i className={`fas fa-${showDeleted ? 'eye-slash' : 'trash'} me-1`}></i>
                {showDeleted ? 'Hide Deleted' : 'Show Deleted'}
              </button>
              <span className="badge bg-primary">{files.length} files</span>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="input-group mb-3">
            <span className="input-group-text" style={{ backgroundColor: theme.bgBody, borderColor: theme.borderColor }}>
              <i className="fas fa-search" style={{ color: theme.textSecondary }}></i>
            </span>
            <input
              type="text"
              className="form-control"
              placeholder="Search files by name, category, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ 
                backgroundColor: theme.bgBody, 
                color: theme.textPrimary, 
                borderColor: theme.borderColor 
              }}
            />
            {searchQuery && (
              <button 
                className="btn btn-outline-secondary" 
                onClick={() => setSearchQuery('')}
                style={{ borderColor: theme.borderColor }}
              >
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>

          {/* Tag Filter */}
          {tags.length > 0 && (
            <div className="mb-3">
              <label className="form-label mb-2" style={{ color: theme.textSecondary, fontSize: '0.875rem' }}>
                <i className="fas fa-filter me-1"></i>Filter by Tags:
              </label>
              <div className="d-flex flex-wrap gap-2">
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    className={`btn btn-sm ${selectedTags.includes(tag.id) ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => {
                      setSelectedTags(prev => 
                        prev.includes(tag.id) 
                          ? prev.filter(id => id !== tag.id)
                          : [...prev, tag.id]
                      )
                    }}
                    style={{
                      backgroundColor: selectedTags.includes(tag.id) ? tag.color : 'transparent',
                      borderColor: tag.color,
                      color: selectedTags.includes(tag.id) ? '#fff' : tag.color
                    }}
                  >
                    <i className={`fas fa-tag me-1`}></i>
                    {tag.name}
                  </button>
                ))}
                {selectedTags.length > 0 && (
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => setSelectedTags([])}
                  >
                    <i className="fas fa-times me-1"></i>Clear Filters
                  </button>
                )}
              </div>
            </div>
          )}

          {(searchQuery || selectedTags.length > 0) && (
            <small className="text-muted d-block">
              Found {filteredFiles.length} of {files.length} files
            </small>
          )}
        </div>
        <div className="card-body">
          {loading ? (
            <FileListSkeleton rows={5} />
          ) : (
            <FileList 
              files={filteredFiles} 
              tags={tags}
              onFileDeleted={handleFileDeleted}
              onTagsUpdated={handleTagsUpdated}
              onRefresh={() => { fetchFiles(showDeleted); fetchTags(); fetchStorageInfo(); }}
              showDeleted={showDeleted}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
