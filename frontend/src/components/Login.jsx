import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useCSRF } from '../context/CSRFContext'

function Login() {
  const { login } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { csrfToken } = useCSRF()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await login(username, password)
      if (!result.success) {
        setError(result.error || 'Login failed')
      }
    } catch (err) {
      setError('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Navigate to register page
  const handleRegister = () => {
    window.location.href = '/register'
  }

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-4">
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
                <i className="fas fa-lock me-2"></i>Login
              </h4>
            </div>
            <div className="card-body">
              {error && (
                <div className="alert alert-danger">{error}</div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label" style={{ color: theme.textPrimary }}>Username</label>
                  <input
                    type="text"
                    className="form-control"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label" style={{ color: theme.textPrimary }}>Password</label>
                  <input
                    type="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ backgroundColor: theme.bgBody, color: theme.textPrimary, borderColor: theme.borderColor }}
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
                      Logging in...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-sign-in-alt me-2"></i>Login
                    </>
                  )}
                </button>
              </form>

              <hr style={{ borderColor: theme.borderColor }} />

              <p className="text-center mb-2" style={{ color: theme.textSecondary }}>
                Don't have an account?
              </p>
              <button 
                onClick={handleRegister}
                className="btn btn-outline-primary w-100"
              >
                <i className="fas fa-user-plus me-2"></i>Register
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
