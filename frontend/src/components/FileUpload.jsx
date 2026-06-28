import React, { useState, useRef } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useUpload } from '../context/UploadContext'

function FileUpload({ tags = [], onUploadSuccess }) {
  const { theme } = useTheme()
  const { startUpload, hasActiveUploads, formatSize } = useUpload()
  const [files, setFiles] = useState([])
  const [category, setCategory] = useState('document')
  const [selectedTags, setSelectedTags] = useState([])
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const fileInputRef = useRef(null)

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files)
    setFiles(selectedFiles)
    setError('')
    setSubmitted(false)
  }

  const handleTagToggle = (tagId) => {
    setSelectedTags(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (files.length === 0) {
      setError('Please select at least one file')
      return
    }

    setError('')

    // Pre-upload check: verify total file size fits within storage quota
    let storageData = null
    try {
      const storageRes = await fetch('/files/api/storage-info')
      if (storageRes.ok) {
        storageData = await storageRes.json()
      }
    } catch (err) {
      console.error('Could not check storage info:', err)
    }

    if (storageData && storageData.storage_limit > 0) {
      const available = (storageData.storage_limit || 0) - (storageData.storage_used || 0)
      const totalUploadSize = files.reduce((sum, f) => sum + f.size, 0)
      
      if (totalUploadSize > available) {
        setError(
          `This upload (${formatSize(totalUploadSize)}) will exceed your storage limit. ` +
          `You have ${formatSize(available)} remaining out of ${formatSize(storageData.storage_limit)}.`
        )
        return
      }
    } else {
      // Can't verify storage — warn but allow (server will enforce)
      console.warn('Storage info unavailable, relying on server-side check')
    }

    // Hand off to global upload context — uploads continue in background
    startUpload(
      Array.from(files),
      category,
      selectedTags,
      onUploadSuccess
    )

    // Reset form immediately so user can continue working
    setFiles([])
    setSelectedTags([])
    setSubmitted(true)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    // Clear success message after a moment
    setTimeout(() => setSubmitted(false), 3000)
  }

  return (
    <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
      <div className="card-header" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary }}>
        <h5 className="mb-0">
          <i className="fas fa-upload me-2"></i>
          Upload File
        </h5>
      </div>
      <div className="card-body">
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-danger" role="alert">
              <i className="fas fa-exclamation-circle me-2"></i>
              {error}
            </div>
          )}

          {submitted && (
            <div className="alert alert-success" role="alert">
              <i className="fas fa-check-circle me-2"></i>
              Upload started! You can navigate away — progress is shown in the bottom-right corner.
            </div>
          )}

          <div className="mb-3">
            <label className="form-label" style={{ color: theme.textPrimary }}>
              Select Files <small className="text-muted">(multiple allowed)</small>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              className="form-control"
              onChange={handleFileChange}
              multiple
            />
            {files.length > 1 && (
              <small className="text-muted">{files.length} files selected</small>
            )}
          </div>

          <div className="mb-3">
            <label className="form-label" style={{ color: theme.textPrimary }}>
              Category
            </label>
            <select
              className="form-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="document">Document</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="other">Other</option>
            </select>
          </div>

          {tags.length > 0 && (
            <div className="mb-3">
              <label className="form-label" style={{ color: theme.textPrimary }}>
                Tags
              </label>
              <div className="d-flex flex-wrap gap-2">
                {tags.map(tag => (
                  <div key={tag.id} className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id={`tag-${tag.id}`}
                      checked={selectedTags.includes(tag.id)}
                      onChange={() => handleTagToggle(tag.id)}
                    />
                    <label 
                      className="form-check-label"
                      htmlFor={`tag-${tag.id}`}
                    >
                      <span 
                        className="badge"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.name}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary w-100"
            disabled={files.length === 0}
            style={{ backgroundColor: theme.colorPrimary }}
          >
            <i className="fas fa-upload me-2"></i>
            Upload {files.length > 1 ? `${files.length} Files` : 'File'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default FileUpload
