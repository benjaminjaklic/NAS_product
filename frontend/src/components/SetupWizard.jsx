import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCSRF } from '../context/CSRFContext'

const STEPS = [
  { id: 1, title: 'Welcome', icon: 'fa-home' },
  { id: 2, title: 'Admin Account', icon: 'fa-user-shield' },
  { id: 3, title: 'Demo Account', icon: 'fa-user' },
  { id: 4, title: 'Storage', icon: 'fa-hdd' },
  { id: 5, title: 'Email', icon: 'fa-envelope' },
  { id: 6, title: 'Security', icon: 'fa-shield-alt' },
  { id: 7, title: 'Complete', icon: 'fa-check-circle' }
]

function SetupWizard() {
  const navigate = useNavigate()
  const { csrfToken } = useCSRF()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const [config, setConfig] = useState({
    app_name: 'NAS System',
    app_port: 5000,
    admin_username: 'admin',
    admin_email: 'admin@localhost',
    admin_password: '',
    admin_password_confirm: '',
    demo_enabled: false,
    demo_username: 'demo',
    demo_password: 'demo123',
    file_storage_path: 'files',
    database_path: 'instance/nas.db',
    trash_retention_days: 30,
    email_enabled: false,
    email_server: '',
    email_port: 587,
    email_username: '',
    email_password: '',
    email_sender_name: 'NAS System',
    email_use_tls: true,
    require_email_verification: false,
    allow_registration: true,
    require_admin_approval: true
  })

  useEffect(() => {
    checkSetupStatus()
  }, [])

  const checkSetupStatus = async () => {
    try {
      const response = await fetch('/setup/api/status')
      const data = await response.json()
      if (data.setup_complete) {
        navigate('/login')
      }
    } catch (err) {
      console.error('Failed to check setup status:', err)
    }
  }

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  const validateStep = () => {
    switch (currentStep) {
      case 2:
        if (!config.admin_password || config.admin_password.length < 8) {
          setError('Admin password must be at least 8 characters')
          return false
        }
        if (config.admin_password !== config.admin_password_confirm) {
          setError('Passwords do not match')
          return false
        }
        break
      case 3:
        if (config.demo_enabled && !config.demo_password) {
          setError('Demo password is required when demo account is enabled')
          return false
        }
        break
      case 5:
        if (config.email_enabled && !config.email_server) {
          setError('Email server is required when email is enabled')
          return false
        }
        break
    }
    return true
  }

  const nextStep = () => {
    if (validateStep()) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length))
    }
  }

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1))
    setError('')
  }

  const completeSetup = async () => {
    if (!validateStep()) return
    
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/setup/api/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify(config)
      })

      const data = await response.json()

      if (response.ok) {
        setCurrentStep(STEPS.length)
        setTimeout(() => navigate('/login'), 2000)
      } else {
        setError(data.error || 'Setup failed')
      }
    } catch (err) {
      setError('Failed to complete setup: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="text-center py-4">
            <i className="fas fa-server fa-4x mb-4" style={{ color: '#6366f1' }}></i>
            <h3 className="mb-3">Welcome to NAS System Setup</h3>
            <p className="text-secondary mb-4">
              This wizard will help you configure your NAS system for first-time use.
              You'll set up an admin account, configure storage, and optionally enable email notifications.
            </p>
            <div className="alert alert-info">
              <i className="fas fa-info-circle me-2"></i>
              All settings can be changed later in the Server Settings panel.
            </div>
          </div>
        )

      case 2:
        return (
          <div>
            <h4 className="mb-4"><i className="fas fa-user-shield me-2"></i>Admin Account</h4>
            <p className="text-secondary mb-4">Create the primary administrator account.</p>
            
            <div className="mb-3">
              <label className="form-label">Admin Username</label>
              <input
                type="text"
                className="form-control"
                value={config.admin_username}
                onChange={(e) => handleChange('admin_username', e.target.value)}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Admin Email</label>
              <input
                type="email"
                className="form-control"
                value={config.admin_email}
                onChange={(e) => handleChange('admin_email', e.target.value)}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Password <span className="text-danger">*</span></label>
              <input
                type="password"
                className="form-control"
                value={config.admin_password}
                onChange={(e) => handleChange('admin_password', e.target.value)}
                placeholder="Minimum 8 characters"
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Confirm Password <span className="text-danger">*</span></label>
              <input
                type="password"
                className="form-control"
                value={config.admin_password_confirm}
                onChange={(e) => handleChange('admin_password_confirm', e.target.value)}
              />
            </div>
          </div>
        )

      case 3:
        return (
          <div>
            <h4 className="mb-4"><i className="fas fa-user me-2"></i>Demo Account (Optional)</h4>
            <p className="text-secondary mb-4">
              Enable a demo account for testing purposes. Demo files are automatically cleaned up every 24 hours.
            </p>
            
            <div className="form-check form-switch mb-4">
              <input
                type="checkbox"
                className="form-check-input"
                id="demoEnabled"
                checked={config.demo_enabled}
                onChange={(e) => handleChange('demo_enabled', e.target.checked)}
              />
              <label className="form-check-label" htmlFor="demoEnabled">
                Enable Demo Account
              </label>
            </div>
            
            {config.demo_enabled && (
              <>
                <div className="mb-3">
                  <label className="form-label">Demo Username</label>
                  <input
                    type="text"
                    className="form-control"
                    value={config.demo_username}
                    onChange={(e) => handleChange('demo_username', e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Demo Password</label>
                  <input
                    type="password"
                    className="form-control"
                    value={config.demo_password}
                    onChange={(e) => handleChange('demo_password', e.target.value)}
                  />
                </div>
                <div className="alert alert-warning">
                  <i className="fas fa-exclamation-triangle me-2"></i>
                  Demo account files will be automatically deleted every 24 hours.
                </div>
              </>
            )}
          </div>
        )

      case 4:
        return (
          <div>
            <h4 className="mb-4"><i className="fas fa-hdd me-2"></i>Storage Configuration</h4>
            <p className="text-secondary mb-4">Configure where files and database are stored.</p>
            
            <div className="mb-3">
              <label className="form-label">File Storage Path</label>
              <input
                type="text"
                className="form-control"
                value={config.file_storage_path}
                onChange={(e) => handleChange('file_storage_path', e.target.value)}
              />
              <small className="text-muted">Relative to application root, or absolute path</small>
            </div>
            <div className="mb-3">
              <label className="form-label">Database Path</label>
              <input
                type="text"
                className="form-control"
                value={config.database_path}
                onChange={(e) => handleChange('database_path', e.target.value)}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Trash Retention (Days)</label>
              <input
                type="number"
                className="form-control"
                value={config.trash_retention_days}
                onChange={(e) => handleChange('trash_retention_days', parseInt(e.target.value) || 30)}
                min="1"
                max="365"
              />
              <small className="text-muted">How long deleted files stay in trash before permanent deletion</small>
            </div>
          </div>
        )

      case 5:
        return (
          <div>
            <h4 className="mb-4"><i className="fas fa-envelope me-2"></i>Email Configuration (Optional)</h4>
            <p className="text-secondary mb-4">
              Configure email for password resets, notifications, and verification.
            </p>
            
            <div className="form-check form-switch mb-4">
              <input
                type="checkbox"
                className="form-check-input"
                id="emailEnabled"
                checked={config.email_enabled}
                onChange={(e) => handleChange('email_enabled', e.target.checked)}
              />
              <label className="form-check-label" htmlFor="emailEnabled">
                Enable Email Notifications
              </label>
            </div>
            
            {config.email_enabled && (
              <>
                <div className="row">
                  <div className="col-md-8 mb-3">
                    <label className="form-label">SMTP Server</label>
                    <input
                      type="text"
                      className="form-control"
                      value={config.email_server}
                      onChange={(e) => handleChange('email_server', e.target.value)}
                      placeholder="smtp.gmail.com"
                    />
                  </div>
                  <div className="col-md-4 mb-3">
                    <label className="form-label">Port</label>
                    <input
                      type="number"
                      className="form-control"
                      value={config.email_port}
                      onChange={(e) => handleChange('email_port', parseInt(e.target.value) || 587)}
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Email Username</label>
                  <input
                    type="text"
                    className="form-control"
                    value={config.email_username}
                    onChange={(e) => handleChange('email_username', e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Email Password / App Key</label>
                  <input
                    type="password"
                    className="form-control"
                    value={config.email_password}
                    onChange={(e) => handleChange('email_password', e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Sender Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={config.email_sender_name}
                    onChange={(e) => handleChange('email_sender_name', e.target.value)}
                  />
                </div>
                <div className="form-check mb-3">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="emailTls"
                    checked={config.email_use_tls}
                    onChange={(e) => handleChange('email_use_tls', e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="emailTls">Use TLS</label>
                </div>
              </>
            )}
          </div>
        )

      case 6:
        return (
          <div>
            <h4 className="mb-4"><i className="fas fa-shield-alt me-2"></i>Security Settings</h4>
            <p className="text-secondary mb-4">Configure security and registration options.</p>
            
            <div className="form-check form-switch mb-3">
              <input
                type="checkbox"
                className="form-check-input"
                id="allowRegistration"
                checked={config.allow_registration}
                onChange={(e) => handleChange('allow_registration', e.target.checked)}
              />
              <label className="form-check-label" htmlFor="allowRegistration">
                Allow User Registration
              </label>
            </div>
            
            <div className="form-check form-switch mb-3">
              <input
                type="checkbox"
                className="form-check-input"
                id="requireApproval"
                checked={config.require_admin_approval}
                onChange={(e) => handleChange('require_admin_approval', e.target.checked)}
              />
              <label className="form-check-label" htmlFor="requireApproval">
                Require Admin Approval for New Users
              </label>
            </div>
            
            {config.email_enabled && (
              <div className="form-check form-switch mb-3">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="emailVerification"
                  checked={config.require_email_verification}
                  onChange={(e) => handleChange('require_email_verification', e.target.checked)}
                />
                <label className="form-check-label" htmlFor="emailVerification">
                  Require Email Verification
                </label>
              </div>
            )}
            
            <div className="mb-3">
              <label className="form-label">Application Port</label>
              <input
                type="number"
                className="form-control"
                value={config.app_port}
                onChange={(e) => handleChange('app_port', parseInt(e.target.value) || 5000)}
              />
              <small className="text-muted">Default: 5000. Requires restart to take effect.</small>
            </div>
          </div>
        )

      case 7:
        return (
          <div className="text-center py-4">
            <i className="fas fa-check-circle fa-4x mb-4 text-success"></i>
            <h3 className="mb-3">Setup Complete!</h3>
            <p className="text-secondary mb-4">
              Your NAS system has been configured successfully. You will be redirected to the login page shortly.
            </p>
            <div className="alert alert-success">
              <i className="fas fa-info-circle me-2"></i>
              Login with your admin credentials to start using the system.
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#0f172a' }}>
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <div className="card" style={{ backgroundColor: '#1e293b', borderColor: '#334155' }}>
              <div className="card-header py-3" style={{ backgroundColor: '#6366f1' }}>
                <h4 className="mb-0 text-white text-center">
                  <i className="fas fa-cog me-2"></i>
                  NAS System Setup
                </h4>
              </div>
              
              <div className="card-body p-4">
                {/* Step indicators */}
                <div className="d-flex justify-content-between mb-4 px-2">
                  {STEPS.map((step) => (
                    <div
                      key={step.id}
                      className="text-center"
                      style={{ flex: 1, cursor: step.id < currentStep ? 'pointer' : 'default' }}
                      onClick={() => step.id < currentStep && setCurrentStep(step.id)}
                    >
                      <div
                        className={`rounded-circle d-inline-flex align-items-center justify-content-center mb-2`}
                        style={{
                          width: '40px',
                          height: '40px',
                          backgroundColor: currentStep >= step.id ? '#6366f1' : '#334155',
                          color: 'white',
                          transition: 'all 0.3s'
                        }}
                      >
                        {currentStep > step.id ? (
                          <i className="fas fa-check"></i>
                        ) : (
                          <i className={`fas ${step.icon}`}></i>
                        )}
                      </div>
                      <div className="small" style={{ color: currentStep >= step.id ? '#f1f5f9' : '#64748b' }}>
                        {step.title}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Error message */}
                {error && (
                  <div className="alert alert-danger mb-4">
                    <i className="fas fa-exclamation-circle me-2"></i>
                    {error}
                  </div>
                )}

                {/* Step content */}
                <div style={{ color: '#f1f5f9', minHeight: '300px' }}>
                  {renderStepContent()}
                </div>

                {/* Navigation buttons */}
                {currentStep < STEPS.length && (
                  <div className="d-flex justify-content-between mt-4 pt-3" style={{ borderTop: '1px solid #334155' }}>
                    <button
                      className="btn btn-outline-light"
                      onClick={prevStep}
                      disabled={currentStep === 1}
                    >
                      <i className="fas fa-arrow-left me-2"></i>Previous
                    </button>
                    
                    {currentStep < STEPS.length - 1 ? (
                      <button
                        className="btn btn-primary"
                        onClick={nextStep}
                        style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
                      >
                        Next<i className="fas fa-arrow-right ms-2"></i>
                      </button>
                    ) : (
                      <button
                        className="btn btn-success"
                        onClick={completeSetup}
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2"></span>
                            Setting up...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-check me-2"></i>Complete Setup
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SetupWizard
