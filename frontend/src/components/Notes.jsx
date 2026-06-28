import React, { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useCSRF } from '../context/CSRFContext'

// Note colors for categorization
const NOTE_COLORS = [
  { name: 'Default', value: '#6c757d', bg: 'rgba(108, 117, 125, 0.1)' },
  { name: 'Blue', value: '#0d6efd', bg: 'rgba(13, 110, 253, 0.1)' },
  { name: 'Green', value: '#198754', bg: 'rgba(25, 135, 84, 0.1)' },
  { name: 'Yellow', value: '#ffc107', bg: 'rgba(255, 193, 7, 0.15)' },
  { name: 'Red', value: '#dc3545', bg: 'rgba(220, 53, 69, 0.1)' },
  { name: 'Purple', value: '#6f42c1', bg: 'rgba(111, 66, 193, 0.1)' },
  { name: 'Cyan', value: '#0dcaf0', bg: 'rgba(13, 202, 240, 0.1)' },
]

// Note categories for students
const NOTE_CATEGORIES = [
  { icon: 'fa-book', label: 'Study Notes', value: 'study' },
  { icon: 'fa-tasks', label: 'To-Do List', value: 'todo' },
  { icon: 'fa-lightbulb', label: 'Ideas', value: 'ideas' },
  { icon: 'fa-calendar', label: 'Schedule', value: 'schedule' },
  { icon: 'fa-flask', label: 'Research', value: 'research' },
  { icon: 'fa-file-alt', label: 'Other', value: 'other' },
]

function Notes() {
  const { theme } = useTheme()
  const { csrfToken } = useCSRF()
  const [notes, setNotes] = useState([])
  const [activeNote, setActiveNote] = useState(null)
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [noteColor, setNoteColor] = useState('#6c757d')
  const [noteCategory, setNoteCategory] = useState('other')
  const [isPinned, setIsPinned] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [viewMode, setViewMode] = useState('list') // 'list' or 'grid'

  useEffect(() => {
    fetchNotes()
  }, [])

  const fetchNotes = async () => {
    try {
      const response = await fetch('/api/notes')
      if (response.ok) {
        const data = await response.json()
        setNotes(data.notes || [])
        if (data.notes?.length > 0 && !activeNote) {
          selectNote(data.notes[0])
        }
      }
    } catch (error) {
      console.error('Error fetching notes:', error)
    } finally {
      setLoading(false)
    }
  }

  const selectNote = (note) => {
    setActiveNote(note)
    setTitle(note.title || '')
    setContent(note.content || '')
    setNoteColor(note.color || '#6c757d')
    setNoteCategory(note.category || 'other')
    setIsPinned(note.is_pinned || false)
  }

  const saveNote = useCallback(async () => {
    if (!activeNote) return
    
    setSaving(true)
    try {
      const response = await fetch(`/api/notes/${activeNote.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({ title, content, color: noteColor, category: noteCategory, is_pinned: isPinned })
      })
      
      if (response.ok) {
        setLastSaved(new Date())
        setNotes(prev => prev.map(n => 
          n.id === activeNote.id ? { ...n, title, content, color: noteColor, category: noteCategory, is_pinned: isPinned } : n
        ))
      }
    } catch (error) {
      console.error('Error saving note:', error)
    } finally {
      setSaving(false)
    }
  }, [activeNote?.id, title, content, noteColor, noteCategory, isPinned, csrfToken])

  // Autosave after 2 seconds of inactivity
  useEffect(() => {
    if (!activeNote) return
    
    const timer = setTimeout(() => {
      saveNote()
    }, 2000)
    
    return () => clearTimeout(timer)
  }, [content, title, noteColor, noteCategory, isPinned, activeNote?.id, saveNote])

  const createNote = async () => {
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({ title: 'New Note', content: '' })
      })
      
      if (response.ok) {
        const data = await response.json()
        const newNote = data.note
        setNotes(prev => [newNote, ...prev])
        selectNote(newNote)
      }
    } catch (error) {
      console.error('Error creating note:', error)
    }
  }

  const deleteNote = async (noteId) => {
    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'DELETE',
        headers: {
          'X-CSRFToken': csrfToken
        }
      })
      
      if (response.ok) {
        setNotes(prev => prev.filter(n => n.id !== noteId))
        if (activeNote?.id === noteId) {
          setActiveNote(null)
          setTitle('')
          setContent('')
        }
        setShowDeleteConfirm(null)
      }
    } catch (error) {
      console.error('Error deleting note:', error)
    }
  }

  // Filter and sort notes
  const filteredNotes = notes
    .filter(note => {
      const matchesSearch = searchQuery === '' || 
        note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = filterCategory === 'all' || note.category === filterCategory
      return matchesSearch && matchesCategory
    })
    .sort((a, b) => {
      // Pinned notes first
      if (a.is_pinned && !b.is_pinned) return -1
      if (!a.is_pinned && b.is_pinned) return 1
      return 0
    })

  const getCategoryIcon = (category) => {
    const cat = NOTE_CATEGORIES.find(c => c.value === category)
    return cat ? cat.icon : 'fa-file-alt'
  }

  const getColorBg = (color) => {
    const c = NOTE_COLORS.find(nc => nc.value === color)
    return c ? c.bg : 'rgba(108, 117, 125, 0.1)'
  }

  return (
    <div className="container-fluid py-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 style={{ color: theme.textPrimary }}>
          <i className="fas fa-sticky-note me-2"></i>Notes
        </h2>
        <div className="d-flex gap-2">
          <div className="btn-group">
            <button 
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setViewMode('list')}
            >
              <i className="fas fa-list"></i>
            </button>
            <button 
              className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setViewMode('grid')}
            >
              <i className="fas fa-th-large"></i>
            </button>
          </div>
          <button className="btn btn-primary" onClick={createNote}>
            <i className="fas fa-plus me-1"></i>New Note
          </button>
        </div>
      </div>

      <div className="row">
        {/* Sidebar */}
        <div className="col-md-4 col-lg-3 mb-4">
          {/* Search */}
          <div className="input-group mb-3">
            <span className="input-group-text" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
              <i className="fas fa-search" style={{ color: theme.textSecondary }}></i>
            </span>
            <input
              type="text"
              className="form-control"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ backgroundColor: theme.bgCard, color: theme.textPrimary, borderColor: theme.borderColor }}
            />
          </div>

          {/* Category Filter */}
          <div className="card mb-3" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
            <div className="card-header py-2" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary }}>
              <small className="fw-bold"><i className="fas fa-filter me-1"></i>Categories</small>
            </div>
            <div className="list-group list-group-flush">
              <button
                className={`list-group-item list-group-item-action py-2 ${filterCategory === 'all' ? 'active' : ''}`}
                onClick={() => setFilterCategory('all')}
                style={{ 
                  backgroundColor: filterCategory === 'all' ? theme.colorPrimary : theme.bgCard,
                  color: filterCategory === 'all' ? 'white' : theme.textPrimary,
                  borderColor: theme.borderColor
                }}
              >
                <i className="fas fa-folder me-2"></i>All Notes
                <span className="badge bg-secondary float-end">{notes.length}</span>
              </button>
              {NOTE_CATEGORIES.map(cat => {
                const count = notes.filter(n => n.category === cat.value).length
                return (
                  <button
                    key={cat.value}
                    className={`list-group-item list-group-item-action py-2 ${filterCategory === cat.value ? 'active' : ''}`}
                    onClick={() => setFilterCategory(cat.value)}
                    style={{ 
                      backgroundColor: filterCategory === cat.value ? theme.colorPrimary : theme.bgCard,
                      color: filterCategory === cat.value ? 'white' : theme.textPrimary,
                      borderColor: theme.borderColor
                    }}
                  >
                    <i className={`fas ${cat.icon} me-2`}></i>{cat.label}
                    {count > 0 && <span className="badge bg-secondary float-end">{count}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
            <div className="card-body py-2">
              <div className="d-flex justify-content-around text-center">
                <div>
                  <div className="fw-bold" style={{ color: theme.colorPrimary }}>{notes.length}</div>
                  <small style={{ color: theme.textSecondary }}>Total</small>
                </div>
                <div>
                  <div className="fw-bold text-warning">{notes.filter(n => n.is_pinned).length}</div>
                  <small style={{ color: theme.textSecondary }}>Pinned</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="col-md-8 col-lg-9">
          {activeNote ? (
            /* Note Editor */
            <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
              <div className="card-header py-2" style={{ backgroundColor: theme.bgNav, borderColor: theme.borderColor }}>
                <div className="d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center gap-2">
                    <button
                      className={`btn btn-sm ${isPinned ? 'btn-warning' : 'btn-outline-secondary'}`}
                      onClick={() => setIsPinned(!isPinned)}
                      title={isPinned ? 'Unpin' : 'Pin'}
                    >
                      <i className="fas fa-thumbtack"></i>
                    </button>
                    <select
                      className="form-select form-select-sm"
                      value={noteCategory}
                      onChange={(e) => setNoteCategory(e.target.value)}
                      style={{ width: 'auto', backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
                    >
                      {NOTE_CATEGORIES.map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                    <div className="d-flex gap-1">
                      {NOTE_COLORS.map(color => (
                        <button
                          key={color.value}
                          className={`btn btn-sm rounded-circle p-0 ${noteColor === color.value ? 'border-2 border-dark' : ''}`}
                          style={{ width: '20px', height: '20px', backgroundColor: color.value }}
                          onClick={() => setNoteColor(color.value)}
                          title={color.name}
                        ></button>
                      ))}
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    {saving && (
                      <span className="text-muted small">
                        <i className="fas fa-sync fa-spin me-1"></i>Saving...
                      </span>
                    )}
                    {!saving && lastSaved && (
                      <span className="text-success small">
                        <i className="fas fa-check-circle me-1"></i>Saved
                      </span>
                    )}
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => { setActiveNote(null); setTitle(''); setContent(''); }}
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                </div>
              </div>
              <div className="card-body" style={{ backgroundColor: getColorBg(noteColor) }}>
                <input
                  type="text"
                  className="form-control border-0 mb-3"
                  placeholder="Note title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{ 
                    fontSize: '1.5rem', 
                    fontWeight: 600,
                    backgroundColor: 'transparent',
                    color: theme.textPrimary
                  }}
                />
                <textarea
                  className="form-control border-0"
                  placeholder="Start writing your note..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={18}
                  style={{ 
                    resize: 'none',
                    backgroundColor: 'transparent',
                    color: theme.textPrimary,
                    fontSize: '1rem',
                    lineHeight: '1.8'
                  }}
                />
              </div>
            </div>
          ) : (
            /* Notes Grid/List View */
            <div>
              {loading ? (
                <div className="text-center py-5">
                  <div className="spinner-border" role="status"></div>
                </div>
              ) : filteredNotes.length === 0 ? (
                <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
                  <div className="card-body text-center py-5">
                    <i className="fas fa-sticky-note fa-4x mb-3" style={{ color: theme.textSecondary }}></i>
                    <h5 style={{ color: theme.textPrimary }}>No notes yet</h5>
                    <p style={{ color: theme.textSecondary }}>Create your first note to get started!</p>
                    <button className="btn btn-primary" onClick={createNote}>
                      <i className="fas fa-plus me-1"></i>Create Note
                    </button>
                  </div>
                </div>
              ) : (
                <div className={viewMode === 'grid' ? 'row g-3' : ''}>
                  {filteredNotes.map(note => (
                    <div key={note.id} className={viewMode === 'grid' ? 'col-md-6 col-lg-4' : 'mb-2'}>
                      <div 
                        className="card h-100 cursor-pointer position-relative"
                        style={{ 
                          backgroundColor: getColorBg(note.color || '#6c757d'),
                          borderColor: note.color || theme.borderColor,
                          borderLeftWidth: '4px',
                          cursor: 'pointer',
                          transition: 'transform 0.2s, box-shadow 0.2s'
                        }}
                        onClick={() => selectNote(note)}
                        onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                      >
                        {note.is_pinned && (
                          <div className="position-absolute top-0 end-0 p-2">
                            <i className="fas fa-thumbtack text-warning"></i>
                          </div>
                        )}
                        <div className="card-body">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <h6 className="card-title mb-0" style={{ color: theme.textPrimary }}>
                              <i className={`fas ${getCategoryIcon(note.category)} me-2`} style={{ color: note.color || theme.textSecondary }}></i>
                              {note.title || 'Untitled'}
                            </h6>
                          </div>
                          <p className="card-text small mb-2" style={{ 
                            color: theme.textSecondary,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: viewMode === 'grid' ? 3 : 1,
                            WebkitBoxOrient: 'vertical'
                          }}>
                            {note.content || 'No content...'}
                          </p>
                          <div className="d-flex justify-content-between align-items-center">
                            <small style={{ color: theme.textSecondary }}>
                              {NOTE_CATEGORIES.find(c => c.value === note.category)?.label || 'Other'}
                            </small>
                            <button
                              className="btn btn-sm btn-outline-danger"
                              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(note); }}
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content" style={{ backgroundColor: theme.bgCard }}>
              <div className="modal-header border-0" style={{ backgroundColor: theme.bgNav }}>
                <h5 className="modal-title" style={{ color: theme.textPrimary }}>
                  <i className="fas fa-exclamation-triangle text-warning me-2"></i>Delete Note
                </h5>
                <button className="btn-close" onClick={() => setShowDeleteConfirm(null)}></button>
              </div>
              <div className="modal-body text-center py-4">
                <i className="fas fa-sticky-note fa-3x mb-3" style={{ color: showDeleteConfirm.color || theme.textSecondary }}></i>
                <p style={{ color: theme.textPrimary }}>Delete "{showDeleteConfirm.title || 'Untitled'}"?</p>
                <p className="text-danger small">This action cannot be undone.</p>
              </div>
              <div className="modal-footer border-0 justify-content-center">
                <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => deleteNote(showDeleteConfirm.id)}>
                  <i className="fas fa-trash me-1"></i>Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Notes
