import React, { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'

function FilePreview({ file, onClose }) {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [textContent, setTextContent] = useState(null)

  useEffect(() => {
    if (file) {
      loadPreview()
    }
  }, [file])

  const loadPreview = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Get preview info
      const infoRes = await fetch(`/files/api/preview/${file.id}`)
      if (!infoRes.ok) throw new Error('Failed to load preview info')
      
      const info = await infoRes.json()
      setPreviewData(info)
      
      // For text files, fetch content
      if (info.preview_type === 'text') {
        const contentRes = await fetch(`/files/api/preview/${file.id}/content`)
        if (contentRes.ok) {
          const data = await contentRes.json()
          setTextContent(data.content)
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formatSize = (bytes) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = (type) => {
    switch (type) {
      case 'image': return 'fa-image'
      case 'pdf': return 'fa-file-pdf'
      case 'text': return 'fa-file-alt'
      case 'video': return 'fa-video'
      case 'audio': return 'fa-music'
      default: return 'fa-file'
    }
  }

  const renderPreview = () => {
    if (!previewData) return null

    const { preview_type } = previewData
    const contentUrl = `/files/api/preview/${file.id}/content`

    switch (preview_type) {
      case 'image':
        return (
          <div className="text-center">
            <img 
              src={contentUrl} 
              alt={file.original_filename}
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
              onError={() => setError('Failed to load image')}
            />
          </div>
        )
      
      case 'pdf':
        return (
          <div style={{ height: '70vh' }}>
            <iframe
              src={contentUrl}
              title={file.original_filename}
              width="100%"
              height="100%"
              style={{ border: 'none' }}
            />
          </div>
        )
      
      case 'text':
        return (
          <div 
            style={{ 
              maxHeight: '70vh', 
              overflow: 'auto',
              backgroundColor: theme.bgBody,
              padding: '1rem',
              borderRadius: '0.5rem',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {textContent || 'Loading...'}
          </div>
        )
      
      case 'video':
        return (
          <video 
            controls 
            style={{ maxWidth: '100%', maxHeight: '70vh' }}
            src={contentUrl}
          >
            Your browser does not support video playback.
          </video>
        )
      
      case 'audio':
        return (
          <div className="text-center py-5">
            <i className="fas fa-music fa-4x mb-4" style={{ color: theme.colorPrimary }}></i>
            <audio controls src={contentUrl} style={{ width: '100%' }}>
              Your browser does not support audio playback.
            </audio>
          </div>
        )
      
      default:
        return (
          <div className="text-center py-5" style={{ color: theme.textSecondary }}>
            <i className="fas fa-file fa-4x mb-3"></i>
            <p>Preview not available for this file type</p>
          </div>
        )
    }
  }

  if (!file) return null

  return (
    <div 
      className="modal show d-block" 
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1050 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-dialog modal-xl modal-dialog-centered">
        <div className="modal-content" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
          <div className="modal-header" style={{ backgroundColor: theme.bgNav, borderColor: theme.borderColor }}>
            <div className="d-flex align-items-center">
              <i className={`fas ${getFileIcon(previewData?.preview_type)} me-2`} style={{ color: theme.colorPrimary }}></i>
              <div>
                <h5 className="modal-title mb-0" style={{ color: theme.textPrimary }}>
                  {file.original_filename || file.filename}
                </h5>
                <small style={{ color: theme.textSecondary }}>
                  {formatSize(file.file_size)} • {file.file_type || 'Unknown type'}
                </small>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <a 
                href={`/files/download/${file.id}`}
                className="btn btn-sm btn-outline-primary"
                download
              >
                <i className="fas fa-download me-1"></i>Download
              </a>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
          </div>
          <div className="modal-body p-3">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="mt-2" style={{ color: theme.textSecondary }}>Loading preview...</p>
              </div>
            ) : error ? (
              <div className="text-center py-5">
                <i className="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                <p style={{ color: theme.textPrimary }}>{error}</p>
                <button className="btn btn-primary" onClick={loadPreview}>
                  <i className="fas fa-redo me-1"></i>Retry
                </button>
              </div>
            ) : (
              renderPreview()
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default FilePreview
