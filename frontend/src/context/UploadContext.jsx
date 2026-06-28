import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { useCSRF } from './CSRFContext'

const UploadContext = createContext()

export function useUpload() {
  return useContext(UploadContext)
}

const CORNER_KEY = 'nas_upload_corner'
const CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left']

export function UploadProvider({ children }) {
  const { csrfToken } = useCSRF()
  const [uploads, setUploads] = useState([]) // [{id, name, size, progress, status, error}]
  const [minimized, setMinimized] = useState(false)
  const [corner, setCornerState] = useState(() => {
    try { return localStorage.getItem(CORNER_KEY) || 'bottom-right' } catch { return 'bottom-right' }
  })
  const idCounter = useRef(0)
  const xhrRefs = useRef({})
  const [lastCompletedAt, setLastCompletedAt] = useState(0)

  const setCorner = useCallback((c) => {
    setCornerState(c)
    try { localStorage.setItem(CORNER_KEY, c) } catch {}
  }, [])

  const cycleCorner = useCallback(() => {
    setCornerState(prev => {
      const idx = CORNERS.indexOf(prev)
      const next = CORNERS[(idx + 1) % CORNERS.length]
      try { localStorage.setItem(CORNER_KEY, next) } catch {}
      return next
    })
  }, [])

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const startUpload = useCallback((files, category, tagIds, onSuccess) => {
    const newUploads = files.map(file => {
      idCounter.current += 1
      return {
        id: idCounter.current,
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'pending',
        error: null,
        category,
        tagIds,
        onSuccess
      }
    })

    setUploads(prev => [...prev, ...newUploads])
    setMinimized(false)

    // Start uploading each file
    newUploads.forEach(upload => {
      uploadFile(upload)
    })

    return newUploads.map(u => u.id)
  }, [csrfToken])

  const uploadFile = useCallback((upload) => {
    const formData = new FormData()
    formData.append('file', upload.file)
    formData.append('category', upload.category || 'other')
    formData.append('csrf_token', csrfToken)
    if (upload.tagIds) {
      upload.tagIds.forEach(tagId => formData.append('tags', tagId))
    }

    const xhr = new XMLHttpRequest()
    xhrRefs.current[upload.id] = xhr

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const progress = Math.round((e.loaded / e.total) * 100)
        setUploads(prev => prev.map(u =>
          u.id === upload.id ? { ...u, progress, status: 'uploading' } : u
        ))
      }
    }

    xhr.onload = () => {
      delete xhrRefs.current[upload.id]
      if (xhr.status === 200) {
        let response = null
        try { response = JSON.parse(xhr.responseText) } catch {}
        setUploads(prev => prev.map(u =>
          u.id === upload.id ? { ...u, status: 'completed', progress: 100 } : u
        ))
        setLastCompletedAt(Date.now())
        if (upload.onSuccess) upload.onSuccess(response)
      } else {
        let errorMsg = 'Upload failed'
        try {
          const response = JSON.parse(xhr.responseText)
          errorMsg = response.error || errorMsg
        } catch {}
        setUploads(prev => prev.map(u =>
          u.id === upload.id ? { ...u, status: 'error', error: errorMsg } : u
        ))
        setLastCompletedAt(Date.now())
      }
    }

    xhr.onerror = () => {
      delete xhrRefs.current[upload.id]
      setUploads(prev => prev.map(u =>
        u.id === upload.id ? { ...u, status: 'error', error: 'Network error' } : u
      ))
    }

    setUploads(prev => prev.map(u =>
      u.id === upload.id ? { ...u, status: 'uploading' } : u
    ))

    xhr.open('POST', '/files/upload')
    xhr.setRequestHeader('X-CSRFToken', csrfToken)
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
    xhr.send(formData)
  }, [csrfToken])

  const cancelUpload = useCallback((uploadId) => {
    if (xhrRefs.current[uploadId]) {
      xhrRefs.current[uploadId].abort()
      delete xhrRefs.current[uploadId]
    }
    setUploads(prev => prev.map(u =>
      u.id === uploadId ? { ...u, status: 'error', error: 'Cancelled' } : u
    ))
  }, [])

  const dismissUpload = useCallback((uploadId) => {
    setUploads(prev => prev.filter(u => u.id !== uploadId))
  }, [])

  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => u.status !== 'completed' && u.status !== 'error'))
  }, [])

  const hasActiveUploads = uploads.some(u => u.status === 'uploading' || u.status === 'pending')
  const completedCount = uploads.filter(u => u.status === 'completed').length
  const errorCount = uploads.filter(u => u.status === 'error').length
  const totalCount = uploads.length

  return (
    <UploadContext.Provider value={{
      uploads,
      startUpload,
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
      cycleCorner,
      formatSize,
      lastCompletedAt
    }}>
      {children}
    </UploadContext.Provider>
  )
}
