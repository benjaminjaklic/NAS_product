import React, { useState, useMemo, useCallback } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useCSRF } from '../context/CSRFContext'
import ColorPicker from './ColorPicker'

// Move ColorPickerRow outside component to prevent re-creation on every render
const ColorPickerRow = React.memo(({ label, colorKey, colors, theme, onColorChange }) => (
  <div className="d-flex align-items-center gap-3 mb-3">
    <label className="flex-grow-1" style={{ color: theme.textPrimary, fontWeight: 500 }}>{label}</label>
    <ColorPicker
      value={colors[colorKey]}
      onChange={(value) => onColorChange(colorKey, value)}
      label={label}
    />
    <input
      type="text"
      className="form-control"
      value={colors[colorKey]}
      onChange={(e) => onColorChange(colorKey, e.target.value)}
      style={{ width: 100, fontFamily: 'monospace', fontSize: '0.875rem' }}
    />
  </div>
))

ColorPickerRow.displayName = 'ColorPickerRow'

function ThemeSettings() {
  const { theme, updateTheme, resetTheme, setThemeMode } = useTheme()
  const { csrfToken } = useCSRF()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const [colors, setColors] = useState(() => ({
    colorPrimary: theme.colorPrimary || '#4f46e5',
    colorSuccess: theme.colorSuccess || '#10b981',
    colorWarning: theme.colorWarning || '#f59e0b',
    colorDanger: theme.colorDanger || '#ef4444',
    bgBody: theme.bgBody || '#ffffff',
    bgCard: theme.bgCard || '#ffffff',
    bgNav: theme.bgNav || '#f8fafc',
    textPrimary: theme.textPrimary || '#1e293b',
    textSecondary: theme.textSecondary || '#64748b',
    borderColor: theme.borderColor || '#e2e8f0'
  }))


  const handleColorChange = useCallback((key, value) => {
    setColors(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    
    try {
      const response = await fetch('/settings/theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRFToken': csrfToken
        },
        body: new URLSearchParams({
          action: 'save',
          color_primary: colors.colorPrimary,
          color_success: colors.colorSuccess,
          color_warning: colors.colorWarning,
          color_danger: colors.colorDanger,
          bg_body: colors.bgBody,
          bg_card: colors.bgCard,
          bg_nav: colors.bgNav,
          text_primary: colors.textPrimary,
          text_secondary: colors.textSecondary,
          border_color: colors.borderColor
        })
      })
      
      if (response.ok) {
        updateTheme(colors)
        setMessage({ type: 'success', text: 'Theme saved successfully!' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ type: 'danger', text: 'Failed to save theme' })
      }
    } catch (error) {
      setMessage({ type: 'danger', text: 'Error saving theme' })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async (mode) => {
    setSaving(true)
    setMessage(null)
    
    try {
      const response = await fetch('/settings/theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRFToken': csrfToken
        },
        body: new URLSearchParams({
          action: mode === 'dark' ? 'reset_dark' : 'reset_light'
        })
      })
      
      if (response.ok) {
        resetTheme(mode)
        // Update local colors to match reset
        const defaultColors = mode === 'dark' ? {
          colorPrimary: '#6366f1',
          colorSuccess: '#10b981',
          colorWarning: '#f59e0b',
          colorDanger: '#ef4444',
          bgBody: '#0f172a',
          bgCard: '#1e293b',
          bgNav: '#1e293b',
          textPrimary: '#f1f5f9',
          textSecondary: '#94a3b8',
          borderColor: '#334155'
        } : {
          colorPrimary: '#4f46e5',
          colorSuccess: '#10b981',
          colorWarning: '#f59e0b',
          colorDanger: '#ef4444',
          bgBody: '#ffffff',
          bgCard: '#ffffff',
          bgNav: '#f8fafc',
          textPrimary: '#1e293b',
          textSecondary: '#64748b',
          borderColor: '#e2e8f0'
        }
        setColors(defaultColors)
        setMessage({ type: 'success', text: `Reset to ${mode} theme!` })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      setMessage({ type: 'danger', text: 'Error resetting theme' })
    } finally {
      setSaving(false)
    }
  }


  return (
    <div className="container py-4">
      <div className="mb-4">
        <h2 className="mb-2" style={{ color: theme.textPrimary, fontWeight: 700 }}>
          <i className="fas fa-palette me-2" style={{ color: theme.colorPrimary }}></i>Theme Customization
        </h2>
        <p className="text-muted mb-0">Personalize your workspace with custom colors and themes</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type} alert-dismissible fade show shadow-sm`} style={{ borderLeft: `4px solid var(--bs-${message.type})` }}>
          <i className={`fas ${message.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} me-2`}></i>
          {message.text}
          <button type="button" className="btn-close" onClick={() => setMessage(null)}></button>
        </div>
      )}

      <div className="row">
        <div className="col-lg-8">
          <div className="card shadow-sm" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor, border: '1px solid' }}>
            <div className="card-header py-3" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary, borderBottom: `2px solid ${theme.borderColor}` }}>
              <h5 className="mb-0" style={{ fontWeight: 600 }}>
                <i className="fas fa-sliders-h me-2" style={{ color: theme.colorPrimary }}></i>Customize Theme
              </h5>
            </div>
            <div className="card-body p-4">
              {/* Quick Presets */}
              <div className="mb-4">
                <label className="form-label fw-semibold" style={{ color: theme.textPrimary, fontSize: '0.95rem' }}>
                  <i className="fas fa-magic me-2"></i>Quick Presets
                </label>
                <div className="d-flex gap-3 flex-wrap">
                  <button 
                    className="btn btn-outline-primary px-4 py-2 rounded-3"
                    onClick={() => handleReset('light')}
                    disabled={saving}
                    style={{ transition: 'all 0.2s ease' }}
                  >
                    <i className="fas fa-sun me-2"></i>Light Theme
                  </button>
                  <button 
                    className="btn btn-outline-secondary px-4 py-2 rounded-3"
                    onClick={() => handleReset('dark')}
                    disabled={saving}
                    style={{ transition: 'all 0.2s ease' }}
                  >
                    <i className="fas fa-moon me-2"></i>Dark Theme
                  </button>
                </div>
              </div>

              <hr style={{ borderColor: theme.borderColor, opacity: 0.5 }} />

              {/* Primary Colors */}
              <h5 className="mb-3 mt-4" style={{ color: theme.textPrimary, fontWeight: 600 }}>
                <i className="fas fa-palette me-2" style={{ color: theme.colorPrimary }}></i>Primary Colors
              </h5>
              <ColorPickerRow label="Primary Color" colorKey="colorPrimary" colors={colors} theme={theme} onColorChange={handleColorChange} />
              <ColorPickerRow label="Success" colorKey="colorSuccess" colors={colors} theme={theme} onColorChange={handleColorChange} />
              <ColorPickerRow label="Warning" colorKey="colorWarning" colors={colors} theme={theme} onColorChange={handleColorChange} />
              <ColorPickerRow label="Danger" colorKey="colorDanger" colors={colors} theme={theme} onColorChange={handleColorChange} />

              <hr style={{ borderColor: theme.borderColor, opacity: 0.5 }} />

              {/* Background Colors */}
              <h5 className="mb-3 mt-4" style={{ color: theme.textPrimary, fontWeight: 600 }}>
                <i className="fas fa-fill-drip me-2" style={{ color: theme.colorPrimary }}></i>Background Colors
              </h5>
              <ColorPickerRow label="Page Background" colorKey="bgBody" colors={colors} theme={theme} onColorChange={handleColorChange} />
              <ColorPickerRow label="Card Background" colorKey="bgCard" colors={colors} theme={theme} onColorChange={handleColorChange} />
              <ColorPickerRow label="Navigation Background" colorKey="bgNav" colors={colors} theme={theme} onColorChange={handleColorChange} />

              <hr style={{ borderColor: theme.borderColor, opacity: 0.5 }} />

              {/* Text Colors */}
              <h5 className="mb-3 mt-4" style={{ color: theme.textPrimary, fontWeight: 600 }}>
                <i className="fas fa-font me-2" style={{ color: theme.colorPrimary }}></i>Text Colors
              </h5>
              <ColorPickerRow label="Primary Text" colorKey="textPrimary" colors={colors} theme={theme} onColorChange={handleColorChange} />
              <ColorPickerRow label="Secondary Text" colorKey="textSecondary" colors={colors} theme={theme} onColorChange={handleColorChange} />
              <ColorPickerRow label="Border Color" colorKey="borderColor" colors={colors} theme={theme} onColorChange={handleColorChange} />

              <hr style={{ borderColor: theme.borderColor, opacity: 0.5 }} />

              <div className="d-flex gap-3 mt-4">
                <button 
                  className="btn btn-primary px-4 py-2 rounded-3 shadow-sm"
                  onClick={handleSave}
                  disabled={saving}
                  style={{ transition: 'all 0.2s ease', fontWeight: 500 }}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-save me-2"></i>Save Theme
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="col-lg-4">
          <div className="card position-sticky shadow-sm" style={{ top: '1rem', backgroundColor: theme.bgCard, borderColor: theme.borderColor, border: '1px solid' }}>
            <div className="card-header py-3" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary, borderBottom: `2px solid ${theme.borderColor}` }}>
              <h5 className="mb-0" style={{ fontWeight: 600 }}>
                <i className="fas fa-eye me-2" style={{ color: theme.colorPrimary }}></i>Live Preview
              </h5>
            </div>
            <div className="card-body p-4">
              <div className="p-3 rounded-3 mb-3 shadow-sm" style={{ backgroundColor: colors.bgBody, border: `1px solid ${colors.borderColor}` }}>
                <div className="p-2 rounded-3 mb-2" style={{ backgroundColor: colors.bgNav }}>
                  <span style={{ color: colors.colorPrimary, fontWeight: 700, fontSize: '1.1rem' }}>NAS System</span>
                </div>
                <div className="p-3 rounded-3" style={{ backgroundColor: colors.bgCard, border: `1px solid ${colors.borderColor}` }}>
                  <h6 style={{ color: colors.textPrimary, marginBottom: '0.5rem', fontWeight: 600 }}>Card Title</h6>
                  <p style={{ color: colors.textSecondary, marginBottom: '0.75rem', fontSize: '0.875rem', lineHeight: 1.6 }}>
                    Preview text showing your custom theme colors and styling.
                  </p>
                  <button className="btn btn-sm rounded-2" style={{ backgroundColor: colors.colorPrimary, color: 'white', fontWeight: 500, padding: '0.375rem 1rem' }}>
                    Sample Button
                  </button>
                </div>
                <div className="d-flex gap-2 mt-2">
                  <div className="rounded-circle" style={{ width: 24, height: 24, backgroundColor: colors.colorSuccess }}></div>
                  <div className="rounded-circle" style={{ width: 24, height: 24, backgroundColor: colors.colorWarning }}></div>
                  <div className="rounded-circle" style={{ width: 24, height: 24, backgroundColor: colors.colorDanger }}></div>
                </div>
              </div>
              <div className="alert alert-info py-2 px-3 mb-0" style={{ fontSize: '0.85rem', backgroundColor: `${theme.colorPrimary}15`, border: 'none' }}>
                <i className="fas fa-info-circle me-2"></i>
                Changes preview in real-time as you customize
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ThemeSettings
