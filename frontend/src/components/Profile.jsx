import React, { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useCSRF } from '../context/CSRFContext'
import { useAuth } from '../context/AuthContext'

function Profile() {
  const { theme } = useTheme()
  const { csrfToken } = useCSRF()
  const { user, checkAuth } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [profileData, setProfileData] = useState(null)
  
  // Password change fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      const response = await fetch('/auth/api/profile')
      if (response.ok) {
        const data = await response.json()
        setProfileData(data)
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'danger', text: 'New passwords do not match' })
      return
    }
    
    if (newPassword.length < 6) {
      setMessage({ type: 'danger', text: 'Password must be at least 6 characters' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/auth/api/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      })

      const data = await response.json()
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'Password changed successfully!' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setMessage({ type: 'danger', text: data.error || 'Failed to change password' })
      }
    } catch (error) {
      setMessage({ type: 'danger', text: 'Error changing password' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border" role="status" style={{ color: theme.colorPrimary }}>
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    )
  }

  const storageUsed = profileData?.storage_used || 0
  const storageLimit = profileData?.storage_limit || 0
  const usagePercent = storageLimit > 0 ? Math.round((storageUsed / storageLimit) * 100) : 0

  return (
    <div className="container py-4">
      <div className="mb-4">
        <h2 style={{ color: theme.textPrimary, fontWeight: 700 }}>
          <i className="fas fa-user-cog me-2" style={{ color: theme.colorPrimary }}></i>
          Profile & Settings
        </h2>
        <p style={{ color: theme.textSecondary }}>Manage your account settings and preferences</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type} alert-dismissible fade show`}>
          <i className={`fas ${message.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} me-2`}></i>
          {message.text}
          <button type="button" className="btn-close" onClick={() => setMessage(null)}></button>
        </div>
      )}

      <div className="row">
        {/* User Info Card */}
        <div className="col-lg-4 mb-4">
          <div className="card h-100" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
            <div className="card-header py-3" style={{ backgroundColor: theme.colorPrimary, color: 'white' }}>
              <h5 className="mb-0">
                <i className="fas fa-user me-2"></i>User Information
              </h5>
            </div>
            <div className="card-body">
              <div className="text-center mb-4">
                <div 
                  className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3"
                  style={{ 
                    width: '80px', 
                    height: '80px', 
                    backgroundColor: theme.colorPrimary,
                    color: 'white',
                    fontSize: '2rem',
                    fontWeight: 700
                  }}
                >
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <h4 style={{ color: theme.textPrimary }}>{user?.username}</h4>
                <p style={{ color: theme.textSecondary }}>{profileData?.email}</p>
              </div>
              
              <div className="border-top pt-3" style={{ borderColor: theme.borderColor }}>
                <div className="d-flex justify-content-between mb-2">
                  <span style={{ color: theme.textSecondary }}>Role</span>
                  <span className={`badge ${user?.is_admin ? 'bg-danger' : 'bg-primary'}`}>
                    {user?.is_admin ? 'Administrator' : 'User'}
                  </span>
                </div>
                <div className="d-flex justify-content-between mb-2">
                  <span style={{ color: theme.textSecondary }}>Status</span>
                  <span className="badge bg-success">Active</span>
                </div>
                <div className="d-flex justify-content-between mb-2">
                  <span style={{ color: theme.textSecondary }}>Joined</span>
                  <span style={{ color: theme.textPrimary }}>
                    {profileData?.created_at ? new Date(profileData.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                <div className="d-flex justify-content-between">
                  <span style={{ color: theme.textSecondary }}>Last Login</span>
                  <span style={{ color: theme.textPrimary }}>
                    {profileData?.last_login ? new Date(profileData.last_login).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Storage & Password */}
        <div className="col-lg-8">
          {/* Storage Usage Card */}
          <div className="card mb-4" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
            <div className="card-header py-3" style={{ backgroundColor: theme.bgNav, borderColor: theme.borderColor }}>
              <h5 className="mb-0" style={{ color: theme.textPrimary }}>
                <i className="fas fa-hdd me-2" style={{ color: theme.colorPrimary }}></i>Storage Usage
              </h5>
            </div>
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span style={{ color: theme.textSecondary }}>
                  {formatSize(storageUsed)} of {formatSize(storageLimit)} used
                </span>
                <span 
                  className="badge"
                  style={{ 
                    backgroundColor: profileData?.storage_tier === 'pro' ? '#6f42c1' : 
                                     profileData?.storage_tier === 'plus' ? '#0d6efd' : 
                                     profileData?.storage_tier === 'demo' ? '#6c757d' : '#198754'
                  }}
                >
                  {profileData?.storage_tier?.toUpperCase() || 'BASIC'}
                </span>
              </div>
              <div className="progress mb-3" style={{ height: '12px', backgroundColor: theme.borderColor }}>
                <div 
                  className="progress-bar" 
                  style={{ 
                    width: `${usagePercent}%`,
                    backgroundColor: usagePercent >= 90 ? '#dc3545' : 
                                     usagePercent >= 75 ? '#ffc107' : '#28a745'
                  }}
                ></div>
              </div>
              <div className="d-flex justify-content-between">
                <small style={{ color: theme.textSecondary }}>{usagePercent}% used</small>
                <small style={{ color: theme.textSecondary }}>
                  {formatSize(storageLimit - storageUsed)} remaining
                </small>
              </div>
            </div>
          </div>

          {/* Change Password Card */}
          <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
            <div className="card-header py-3" style={{ backgroundColor: theme.bgNav, borderColor: theme.borderColor }}>
              <h5 className="mb-0" style={{ color: theme.textPrimary }}>
                <i className="fas fa-key me-2" style={{ color: theme.colorPrimary }}></i>Change Password
              </h5>
            </div>
            <div className="card-body">
              <form onSubmit={handlePasswordChange}>
                <div className="row g-3">
                  <div className="col-md-12">
                    <label className="form-label" style={{ color: theme.textPrimary }}>
                      Current Password
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      style={{ 
                        backgroundColor: theme.bgBody, 
                        color: theme.textPrimary, 
                        borderColor: theme.borderColor 
                      }}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" style={{ color: theme.textPrimary }}>
                      New Password
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      style={{ 
                        backgroundColor: theme.bgBody, 
                        color: theme.textPrimary, 
                        borderColor: theme.borderColor 
                      }}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" style={{ color: theme.textPrimary }}>
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      style={{ 
                        backgroundColor: theme.bgBody, 
                        color: theme.textPrimary, 
                        borderColor: theme.borderColor 
                      }}
                    />
                  </div>
                  <div className="col-12">
                    <button 
                      type="submit" 
                      className="btn btn-primary"
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
                          <i className="fas fa-save me-2"></i>Update Password
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Profile
