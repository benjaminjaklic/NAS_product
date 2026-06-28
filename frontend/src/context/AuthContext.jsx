import React, { createContext, useContext, useState, useEffect } from 'react'
import { useCSRF } from './CSRFContext'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const { csrfToken } = useCSRF()

  useEffect(() => {
    checkAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkAuth = async () => {
    try {
      const response = await fetch('/auth/api/me', {
        credentials: 'include'  // Important: include session cookies
      })
      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setUser(null)
    } finally {
      setLoading(false)
    }
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

  const login = async (username, password) => {
    try {
      // Fetch CSRF token directly if not available from context
      let token = csrfToken
      if (!token) {
        console.log('CSRF token not in context, fetching directly...')
        token = await fetchCSRFToken()
      }
      
      if (!token) {
        console.error('Failed to get CSRF token')
        return { success: false, error: 'Security token error. Please refresh the page.' }
      }
      
      console.log('Login attempt with CSRF token:', token ? 'present' : 'missing')
      
      // Flask login expects form data, not JSON
      const formData = new URLSearchParams()
      formData.append('username', username)
      formData.append('password', password)
      formData.append('csrf_token', token)
      
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRFToken': token
        },
        body: formData,
        credentials: 'include',  // Important: include session cookies
        redirect: 'manual' // Don't follow redirects automatically
      })
      
      console.log('Login response status:', response.status)
      
      // Flask redirects on success (302/303)
      if (response.status === 302 || response.status === 303 || response.type === 'opaqueredirect') {
        // Login successful, check auth
        await checkAuth()
        return { success: true }
      }
      
      // If 200, might be success or error
      if (response.ok) {
        const text = await response.text()
        console.log('Login response text:', text.substring(0, 200))
        
        // Check if it's an error message
        if (text.includes('Invalid username or password')) {
          return { success: false, error: 'Invalid username or password' }
        }
        if (text.includes('pending approval')) {
          return { success: false, error: 'Account pending approval' }
        }
        
        // Otherwise assume success and check auth
        await checkAuth()
        return { success: true }
      }
      
      return { success: false, error: 'Login failed' }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, error: 'Network error: ' + error.message }
    }
  }

  const logout = async () => {
    try {
      // Clear user state immediately
      setUser(null)
      
      // Call Flask logout endpoint
      await fetch('/auth/logout', {
        method: 'GET',
        headers: {
          'X-CSRFToken': csrfToken
        },
        credentials: 'include'  // Important: include session cookies
      })
      
      // Redirect to React login page
      window.location.href = '/login'
    } catch (error) {
      console.error('Logout failed:', error)
      // Even on error, clear user and redirect
      setUser(null)
      window.location.href = '/login'
    }
  }

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    checkAuth
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
