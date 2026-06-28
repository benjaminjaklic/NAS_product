import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useUpload } from '../context/UploadContext'
import { useTheme } from '../context/ThemeContext'

function UploadIndicator() {
  const { theme } = useTheme()
  const {
    uploads,
    cancelUpload,
    dismissUpload,
    clearCompleted,
    hasActiveUploads,
    completedCount,
    errorCount,
    totalCount,
    minimized,
    setMinimized,
    corner,
    setCorner,
    formatSize
  } = useUpload()

  const [dragging, setDragging] = useState(false)
  const [dragPos, setDragPos] = useState(null) // {x, y} while dragging
  const dragRef = useRef(null) // offset from cursor to element top-left
  const containerRef = useRef(null)
  const didDrag = useRef(false) // distinguish click from drag

  // --- Drag handlers ---
  const onDragStart = useCallback((clientX, clientY) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragRef.current = { offsetX: clientX - rect.left, offsetY: clientY - rect.top }
    setDragPos({ x: rect.left, y: rect.top })
    setDragging(true)
    didDrag.current = false
  }, [])

  const onDragMove = useCallback((clientX, clientY) => {
    if (!dragRef.current) return
    didDrag.current = true
    const maxX = window.innerWidth - (containerRef.current?.offsetWidth || 300)
    const maxY = window.innerHeight - (containerRef.current?.offsetHeight || 60)
    setDragPos({
      x: Math.max(0, Math.min(clientX - dragRef.current.offsetX, maxX)),
      y: Math.max(0, Math.min(clientY - dragRef.current.offsetY, maxY))
    })
  }, [])

  const onDragEnd = useCallback(() => {
    if (!dragging) return
    setDragging(false)
    dragRef.current = null

    // Snap to nearest corner
    if (dragPos) {
      const el = containerRef.current
      const w = el?.offsetWidth || 300
      const h = el?.offsetHeight || 60
      const cx = dragPos.x + w / 2
      const cy = dragPos.y + h / 2
      const midX = window.innerWidth / 2
      const midY = window.innerHeight / 2
      const isRight = cx >= midX
      const isBottom = cy >= midY
      const snapped = `${isBottom ? 'bottom' : 'top'}-${isRight ? 'right' : 'left'}`
      setCorner(snapped)
    }
    setDragPos(null)
  }, [dragging, dragPos, setCorner])

  // Mouse events
  const handleMouseDown = useCallback((e) => {
    // Ignore if clicking a button inside the header
    if (e.target.closest('button')) return
    e.preventDefault()
    onDragStart(e.clientX, e.clientY)
  }, [onDragStart])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => onDragMove(e.clientX, e.clientY)
    const onUp = () => onDragEnd()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, onDragMove, onDragEnd])

  // Touch events
  const handleTouchStart = useCallback((e) => {
    if (e.target.closest('button')) return
    const touch = e.touches[0]
    onDragStart(touch.clientX, touch.clientY)
  }, [onDragStart])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      e.preventDefault()
      const touch = e.touches[0]
      onDragMove(touch.clientX, touch.clientY)
    }
    const onEnd = () => onDragEnd()
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [dragging, onDragMove, onDragEnd])

  const handleHeaderClick = useCallback(() => {
    // Only toggle minimize if we didn't drag
    if (!didDrag.current) setMinimized(!minimized)
  }, [minimized, setMinimized])

  if (uploads.length === 0) return null

  const activeUploads = uploads.filter(u => u.status === 'uploading' || u.status === 'pending')
  const overallProgress = uploads.length > 0
    ? Math.round(uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length)
    : 0

  // Position: use drag position while dragging, corner-based otherwise
  const positionStyle = {}
  if (dragging && dragPos) {
    positionStyle.left = `${dragPos.x}px`
    positionStyle.top = `${dragPos.y}px`
  } else {
    if (corner.includes('bottom')) positionStyle.bottom = '20px'
    else positionStyle.top = '70px'
    if (corner.includes('right')) positionStyle.right = '20px'
    else positionStyle.left = '20px'
  }

  return (
    <div ref={containerRef} style={{
      position: 'fixed',
      ...positionStyle,
      zIndex: 9000,
      width: minimized ? 'min(280px, calc(100vw - 40px))' : 'min(380px, calc(100vw - 40px))',
      maxHeight: minimized ? 'auto' : 'min(400px, calc(100vh - 120px))',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: dragging ? '0 12px 48px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.3)',
      backgroundColor: theme.bgCard,
      border: `1px solid ${theme.borderColor}`,
      transition: dragging ? 'none' : 'all 0.25s ease',
      opacity: dragging ? 0.92 : 1
    }}>
      {/* Header — drag handle */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: theme.bgNav,
          borderBottom: `1px solid ${theme.borderColor}`,
          cursor: dragging ? 'grabbing' : 'grab',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none'
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={handleHeaderClick}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          {hasActiveUploads ? (
            <span className="spinner-border spinner-border-sm" style={{ color: theme.colorPrimary, flexShrink: 0 }}></span>
          ) : (
            <i className="fas fa-check-circle" style={{ color: '#28a745', flexShrink: 0 }}></i>
          )}
          <span style={{ color: theme.textPrimary, fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {hasActiveUploads
              ? `Uploading ${activeUploads.length} of ${totalCount}...`
              : `${completedCount} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ''}`
            }
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
          <i className="fas fa-grip-vertical" style={{ color: theme.textSecondary, fontSize: '0.7rem', marginRight: '2px', opacity: 0.5 }}></i>
          {!hasActiveUploads && (
            <button
              onClick={(e) => { e.stopPropagation(); clearCompleted() }}
              title="Dismiss all"
              style={{
                border: 'none',
                background: 'none',
                color: theme.textSecondary,
                cursor: 'pointer',
                padding: '2px 4px',
                fontSize: '0.8rem'
              }}
            >
              <i className="fas fa-times"></i>
            </button>
          )}
          <i className={`fas fa-chevron-${minimized ? (corner.includes('top') ? 'down' : 'up') : (corner.includes('top') ? 'up' : 'down')}`} style={{ color: theme.textSecondary, fontSize: '0.8rem' }}></i>
        </div>
      </div>

      {/* Overall progress bar when minimized */}
      {minimized && hasActiveUploads && (
        <div style={{ padding: '0', height: '3px', backgroundColor: theme.borderColor }}>
          <div style={{
            height: '100%',
            width: `${overallProgress}%`,
            backgroundColor: theme.colorPrimary,
            transition: 'width 0.3s ease'
          }}></div>
        </div>
      )}

      {/* Expanded file list */}
      {!minimized && (
        <div style={{ maxHeight: 'min(300px, calc(100vh - 200px))', overflowY: 'auto', padding: '8px', WebkitOverflowScrolling: 'touch' }}>
          {uploads.map(upload => (
            <div
              key={upload.id}
              style={{
                padding: '8px 10px',
                borderRadius: '8px',
                marginBottom: '4px',
                backgroundColor: theme.bgBody,
                border: `1px solid ${
                  upload.status === 'completed' ? '#28a74530' :
                  upload.status === 'error' ? '#dc354530' :
                  'transparent'
                }`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
                  <div style={{
                    color: theme.textPrimary,
                    fontSize: '0.85rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }} title={upload.name}>
                    {upload.name}
                  </div>
                  <div style={{ color: theme.textSecondary, fontSize: '0.75rem' }}>
                    {formatSize(upload.size)}
                    {upload.status === 'error' && upload.error && (
                      <span style={{ color: '#dc3545', marginLeft: '6px' }}>{upload.error}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  {upload.status === 'completed' && (
                    <i className="fas fa-check-circle" style={{ color: '#28a745', fontSize: '1rem' }}></i>
                  )}
                  {upload.status === 'error' && (
                    <i className="fas fa-exclamation-circle" style={{ color: '#dc3545', fontSize: '1rem' }}></i>
                  )}
                  {upload.status === 'uploading' && (
                    <span style={{ color: theme.colorPrimary, fontSize: '0.8rem', fontWeight: 600 }}>
                      {upload.progress}%
                    </span>
                  )}
                  {upload.status === 'pending' && (
                    <span style={{ color: theme.textSecondary, fontSize: '0.75rem' }}>Queued</span>
                  )}
                  {(upload.status === 'uploading' || upload.status === 'pending') && (
                    <button
                      onClick={() => cancelUpload(upload.id)}
                      title="Cancel"
                      style={{
                        border: 'none',
                        background: 'none',
                        color: theme.textSecondary,
                        cursor: 'pointer',
                        padding: '4px',
                        fontSize: '0.85rem'
                      }}
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                  {(upload.status === 'completed' || upload.status === 'error') && (
                    <button
                      onClick={() => dismissUpload(upload.id)}
                      title="Dismiss"
                      style={{
                        border: 'none',
                        background: 'none',
                        color: theme.textSecondary,
                        cursor: 'pointer',
                        padding: '4px',
                        fontSize: '0.85rem'
                      }}
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>
              </div>
              {(upload.status === 'uploading' || upload.status === 'pending') && (
                <div style={{ height: '3px', borderRadius: '2px', backgroundColor: theme.borderColor }}>
                  <div style={{
                    height: '100%',
                    width: `${upload.progress}%`,
                    borderRadius: '2px',
                    backgroundColor: theme.colorPrimary,
                    transition: 'width 0.3s ease'
                  }}></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default UploadIndicator
