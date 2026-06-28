import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useCSRF } from '../context/CSRFContext'

function Register() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { csrfToken } = useCSRF()
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  // Helper to fetch CSRF token directly
  const fetchCSRFToken = async () => {
    try {
      const res = await fetch('/auth/api/csrf-token', {
        method: 'GET',
        credentials: 'include'
      })
      if (res.ok) {
        const data = await res.json()
        return data.csrf_token
      }
    } catch (err) {
      console.error('Failed to fetch CSRF token:', err)
    }
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }

    setLoading(true)

    try {
      // Fetch CSRF token directly if not available from context
      let token = csrfToken
      if (!token) {
        console.log('CSRF token not in context, fetching directly...')
        token = await fetchCSRFToken()
      }
      
      if (!token) {
        console.error('Failed to get CSRF token')
        setError('Security token error. Please refresh the page.')
        setLoading(false)
        return
      }
      
      console.log('Submitting registration with CSRF token:', token ? 'present' : 'missing')
      
      const response = await fetch('/auth/register', {
        method: 'POST',
        credentials: 'include',  // Important: include session cookies
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRFToken': token
        },
        body: new URLSearchParams({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          confirm_password: formData.confirmPassword,
          csrf_token: token
        })
      })

      const text = await response.text()
      
      // Check if response is JSON
      let data
      try {
        data = JSON.parse(text)
      } catch {
        // If not JSON, check if it's a redirect (success)
        if (response.ok) {
          setSuccess('Registration successful! Waiting for admin approval...')
          setTimeout(() => navigate('/login'), 2000)
          return
        } else {
          setError('Registration failed. Please try again.')
          return
        }
      }

      if (response.ok) {
        setSuccess('Registration successful! Waiting for admin approval...')
        setTimeout(() => navigate('/login'), 2000)
      } else {
        setError(data.error || 'Registration failed. Please try again.')
      }
    } catch (err) {
      console.error('Registration error:', err)
      setError('An error occurred during registration')
    } finally {
      setLoading(false)
    }
  }

  const handleLoginRedirect = () => {
    navigate('/login')
  }

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          {/* Theme Toggle Button */}
          <div className="text-end mb-3">
            <button 
              onClick={toggleTheme}
              className="btn btn-outline-secondary btn-sm"
              title={`Switch to ${theme.mode === 'dark' ? 'light' : 'dark'} mode`}
            >
              <i className={`fas fa-${theme.mode === 'dark' ? 'sun' : 'moon'} me-2`}></i>
              {theme.mode === 'dark' ? 'Light' : 'Dark'} Mode
            </button>
          </div>

          <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
            <div className="card-header text-center" style={{ backgroundColor: theme.bgNav, color: theme.textPrimary }}>
              <h4 className="mb-0">
                <i className="fas fa-user-plus me-2"></i>Register
              </h4>
            </div>
            <div className="card-body">
              {error && (
                <div className="alert alert-danger">
                  <i className="fas fa-exclamation-circle me-2"></i>
                  {error}
                </div>
              )}

              {success && (
                <div className="alert alert-success">
                  <i className="fas fa-check-circle me-2"></i>
                  {success}
                </div>
              )}

              <div className="alert alert-info" style={{ fontSize: '0.9rem' }}>
                <i className="fas fa-info-circle me-2"></i>
                After registration, you will need to wait for administrator approval.
              </div>

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label" style={{ color: theme.textPrimary }}>
                    <i className="fas fa-user me-2"></i>Username
                  </label>
                  <input
                    type="text"
                    name="username"
                    className="form-control"
                    value={formData.username}
                    onChange={handleChange}
                    required
                    minLength="3"
                    maxLength="64"
                    style={{ 
                      backgroundColor: theme.bgBody, 
                      color: theme.textPrimary, 
                      borderColor: theme.borderColor 
                    }}
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label" style={{ color: theme.textPrimary }}>
                    <i className="fas fa-envelope me-2"></i>Email Address
                  </label>
                  <input
                    type="email"
                    name="email"
                    className="form-control"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    style={{ 
                      backgroundColor: theme.bgBody, 
                      color: theme.textPrimary, 
                      borderColor: theme.borderColor 
                    }}
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label" style={{ color: theme.textPrimary }}>
                    <i className="fas fa-lock me-2"></i>Password
                  </label>
                  <input
                    type="password"
                    name="password"
                    className="form-control"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength="6"
                    style={{ 
                      backgroundColor: theme.bgBody, 
                      color: theme.textPrimary, 
                      borderColor: theme.borderColor 
                    }}
                  />
                  <small className="form-text" style={{ color: theme.textSecondary }}>
                    Minimum 6 characters
                  </small>
                </div>

                <div className="mb-3">
                  <label className="form-label" style={{ color: theme.textPrimary }}>
                    <i className="fas fa-lock me-2"></i>Confirm Password
                  </label>
                  <input
                    type="password"
                    name="confirmPassword"
                    className="form-control"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    minLength="6"
                    style={{ 
                      backgroundColor: theme.bgBody, 
                      color: theme.textPrimary, 
                      borderColor: theme.borderColor 
                    }}
                  />
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary w-100 mb-3"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Registering...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-user-plus me-2"></i>Register
                    </>
                  )}
                </button>
              </form>

              <hr style={{ borderColor: theme.borderColor }} />

              <p className="text-center mb-2" style={{ color: theme.textSecondary }}>
                Already have an account?
              </p>
              <button 
                onClick={handleLoginRedirect}
                className="btn btn-outline-secondary w-100"
              >
                <i className="fas fa-sign-in-alt me-2"></i>Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register
