import React, { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

function Navbar() {
  const { user, logout, isAuthenticated } = useAuth()
  const { theme, toggleTheme, isDark } = useTheme()
  const location = useLocation()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [appName, setAppName] = useState('NAS System')
  const dropdownRef = useRef(null)

  // Fetch app name from config
  useEffect(() => {
    const fetchAppConfig = async () => {
      try {
        const response = await fetch('/setup/api/app-config')
        if (response.ok) {
          const data = await response.json()
          if (data.app_name) {
            setAppName(data.app_name)
            document.title = data.app_name
          }
        }
      } catch (error) {
        console.error('Failed to fetch app config:', error)
      }
    }
    fetchAppConfig()
  }, [])

  const isActive = (path) => location.pathname === path ? 'active' : ''

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dropdown on route change
  useEffect(() => {
    setDropdownOpen(false)
    setMobileMenuOpen(false)
  }, [location.pathname])

  if (!isAuthenticated) {
    return null
  }

  const handleLogout = () => {
    setDropdownOpen(false)
    logout()
  }

  const handleThemeToggle = () => {
    toggleTheme()
    setDropdownOpen(false)
  }

  return (
    <nav className="navbar navbar-expand-lg" style={{ 
      backgroundColor: theme.bgNav,
      borderBottom: `1px solid ${theme.borderColor}`
    }}>
      <div className="container">
        <Link className="navbar-brand" to="/" style={{ color: theme.colorPrimary, fontWeight: 600 }}>
          {appName}
        </Link>
        
        <button 
          className="navbar-toggler" 
          type="button" 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{ borderColor: theme.borderColor }}
        >
          <i className="fas fa-bars" style={{ color: theme.textSecondary }}></i>
        </button>
        
        <div className={`collapse navbar-collapse ${mobileMenuOpen ? 'show' : ''}`} id="navbarNav">
          <ul className="navbar-nav me-auto">
            <li className="nav-item">
              <Link className={`nav-link ${isActive('/')}`} to="/" style={{ color: theme.textSecondary }}>
                <i className="fas fa-home me-1"></i> Dashboard
              </Link>
            </li>
            {user?.is_admin && (
              <li className="nav-item">
                <Link className={`nav-link ${isActive('/admin')}`} to="/admin" style={{ color: theme.textSecondary }}>
                  <i className="fas fa-user-shield me-1"></i> Admin
                </Link>
              </li>
            )}
            <li className="nav-item">
              <Link className={`nav-link ${isActive('/settings/theme')}`} to="/settings/theme" style={{ color: theme.textSecondary }}>
                <i className="fas fa-palette me-1"></i> Theme
              </Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link ${isActive('/notes')}`} to="/notes" style={{ color: theme.textSecondary }}>
                <i className="fas fa-sticky-note me-1"></i> Notes
              </Link>
            </li>
            {user?.is_admin && (
              <li className="nav-item">
                <Link className={`nav-link ${isActive('/settings/server')}`} to="/settings/server" style={{ color: theme.textSecondary }}>
                  <i className="fas fa-server me-1"></i> Server
                </Link>
              </li>
            )}
          </ul>
          
          <ul className="navbar-nav">
            <li className="nav-item dropdown" ref={dropdownRef} style={{ position: 'relative' }}>
              <button 
                className="nav-link dropdown-toggle btn btn-link" 
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{ 
                  color: theme.textSecondary, 
                  textDecoration: 'none',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <i className="fas fa-user me-1"></i> {user?.username || 'User'}
              </button>
              {dropdownOpen && (
                <ul 
                  className="dropdown-menu dropdown-menu-end show" 
                  style={{ 
                    backgroundColor: theme.bgCard,
                    borderColor: theme.borderColor,
                    display: 'block',
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    minWidth: '200px',
                    zIndex: 1000,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    borderRadius: '8px',
                    padding: '8px 0'
                  }}
                >
                  <li>
                    <Link 
                      className="dropdown-item" 
                      to="/profile" 
                      onClick={() => setDropdownOpen(false)}
                      style={{ color: theme.textPrimary, padding: '10px 16px', display: 'block', textDecoration: 'none' }}
                    >
                      <i className="fas fa-user-cog me-2"></i>Profile & Settings
                    </Link>
                  </li>
                  <li><hr className="dropdown-divider" style={{ borderColor: theme.borderColor, margin: '8px 0' }} /></li>
                  <li>
                    <button 
                      className="dropdown-item d-flex align-items-center gap-2" 
                      onClick={handleThemeToggle}
                      style={{ 
                        color: theme.textPrimary, 
                        padding: '10px 16px',
                        width: '100%',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <i className={`fas ${isDark ? 'fa-sun' : 'fa-moon'}`}></i>
                      <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>
                  </li>
                  <li><hr className="dropdown-divider" style={{ borderColor: theme.borderColor, margin: '8px 0' }} /></li>
                  <li>
                    <button 
                      className="dropdown-item" 
                      onClick={handleLogout} 
                      style={{ 
                        color: theme.textPrimary, 
                        padding: '10px 16px',
                        width: '100%',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <i className="fas fa-sign-out-alt me-2"></i>Logout
                    </button>
                  </li>
                </ul>
              )}
            </li>
          </ul>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
