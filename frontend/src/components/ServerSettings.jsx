import React, { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useCSRF } from '../context/CSRFContext'
import { useAuth } from '../context/AuthContext'
import RoleManagement from './RoleManagement'

function ServerSettings() {
  const { theme } = useTheme()
  const { csrfToken } = useCSRF()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [activeTab, setActiveTab] = useState('general')
  
  const [settings, setSettings] = useState({
    general: {},
    storage: {},
    email: {},
    security: {}
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch('/setup/api/settings')
      if (response.ok) {
        const data = await response.json()
        setSettings(data)
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (category, key, value) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: { ...prev[category][key], value }
      }
    }))
  }

  const saveSettings = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const flatSettings = {}
      Object.values(settings).forEach(category => {
        Object.entries(category).forEach(([key, config]) => {
          flatSettings[key] = config.value
        })
      })

      const response = await fetch('/setup/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify(flatSettings)
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: 'Settings saved successfully' })
      } else {
        setMessage({ type: 'danger', text: data.error || 'Failed to save settings' })
      }
    } catch (error) {
      setMessage({ type: 'danger', text: 'Error saving settings' })
    } finally {
      setSaving(false)
    }
  }

  const testEmail = async () => {
    try {
      const response = await fetch('/setup/api/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({ recipient: user?.email })
      })

      const data = await response.json()
      setMessage({
        type: data.success ? 'success' : 'danger',
        text: data.message
      })
    } catch (error) {
      setMessage({ type: 'danger', text: 'Failed to send test email' })
    }
  }

  if (!user?.is_admin) {
    return (
      <div className="container py-5 text-center">
        <i className="fas fa-lock fa-4x mb-3" style={{ color: theme.textSecondary }}></i>
        <h4 style={{ color: theme.textPrimary }}>Admin Access Required</h4>
        <p style={{ color: theme.textSecondary }}>You need administrator privileges to access this page.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border" style={{ color: theme.colorPrimary }}></div>
      </div>
    )
  }

  const tabs = [
    { id: 'general', label: 'General', icon: 'fa-cog' },
    { id: 'storage', label: 'Storage', icon: 'fa-hdd' },
    { id: 'roles', label: 'Roles', icon: 'fa-user-tag' },
    { id: 'email', label: 'Email', icon: 'fa-envelope' },
    { id: 'security', label: 'Security', icon: 'fa-shield-alt' }
  ]

  const renderSettingInput = (key, config, category) => {
    const value = config.value || ''
    const isSensitive = config.is_sensitive
    
    if (config.value_type === 'bool') {
      return (
        <div className="form-check form-switch">
          <input
            type="checkbox"
            className="form-check-input"
            id={key}
            checked={value === 'true' || value === true}
            onChange={(e) => handleChange(category, key, e.target.checked ? 'true' : 'false')}
          />
          <label className="form-check-label" htmlFor={key} style={{ color: theme.textSecondary }}>
            {config.description || key}
          </label>
        </div>
      )
    }

    return (
      <div className="mb-3">
        <label className="form-label" style={{ color: theme.textPrimary }}>
          {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </label>
        <input
          type={isSensitive ? 'password' : config.value_type === 'int' ? 'number' : 'text'}
          className="form-control"
          value={isSensitive && value === '[HIDDEN]' ? '' : value}
          onChange={(e) => handleChange(category, key, e.target.value)}
          placeholder={isSensitive ? '••••••••' : ''}
          style={{
            backgroundColor: theme.bgBody,
            color: theme.textPrimary,
            borderColor: theme.borderColor
          }}
        />
        {config.description && (
          <small style={{ color: theme.textSecondary }}>{config.description}</small>
        )}
      </div>
    )
  }

  return (
    <div className="container py-4">
      <div className="mb-4">
        <h2 style={{ color: theme.textPrimary, fontWeight: 700 }}>
          <i className="fas fa-server me-2" style={{ color: theme.colorPrimary }}></i>
          Server Settings
        </h2>
        <p style={{ color: theme.textSecondary }}>Configure system-wide settings</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type} alert-dismissible fade show`}>
          <i className={`fas ${message.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} me-2`}></i>
          {message.text}
          <button className="btn-close" onClick={() => setMessage(null)}></button>
        </div>
      )}

      <div className="row">
        <div className="col-md-3 mb-4">
          <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
            <div className="list-group list-group-flush">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`list-group-item list-group-item-action d-flex align-items-center gap-2`}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    backgroundColor: activeTab === tab.id ? theme.colorPrimary : theme.bgCard,
                    color: activeTab === tab.id ? 'white' : theme.textPrimary,
                    borderColor: theme.borderColor
                  }}
                >
                  <i className={`fas ${tab.icon}`}></i>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="col-md-9">
          <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
            <div className="card-header" style={{ backgroundColor: theme.bgNav, borderColor: theme.borderColor }}>
              <h5 className="mb-0" style={{ color: theme.textPrimary }}>
                <i className={`fas ${tabs.find(t => t.id === activeTab)?.icon} me-2`}></i>
                {tabs.find(t => t.id === activeTab)?.label} Settings
              </h5>
            </div>
            <div className="card-body">
              {activeTab === 'roles' ? (
                <RoleManagement />
              ) : settings[activeTab] && Object.keys(settings[activeTab]).length > 0 ? (
                <>
                  {Object.entries(settings[activeTab]).map(([key, config]) => (
                    <div key={key}>
                      {renderSettingInput(key, config, activeTab)}
                    </div>
                  ))}
                  
                  {activeTab === 'email' && (
                    <button
                      className="btn btn-outline-primary mt-3"
                      onClick={testEmail}
                    >
                      <i className="fas fa-paper-plane me-2"></i>
                      Send Test Email
                    </button>
                  )}
                </>
              ) : (
                <p style={{ color: theme.textSecondary }}>
                  No settings configured for this category yet.
                </p>
              )}
            </div>
            {activeTab !== 'roles' && (
              <div className="card-footer" style={{ backgroundColor: theme.bgNav, borderColor: theme.borderColor }}>
                <button
                  className="btn btn-primary"
                  onClick={saveSettings}
                  disabled={saving}
                  style={{ backgroundColor: theme.colorPrimary }}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-save me-2"></i>
                      Save Settings
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ServerSettings
