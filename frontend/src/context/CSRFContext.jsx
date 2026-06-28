import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const CSRFContext = createContext(null)

export function CSRFProvider({ children }) {
  const [csrfToken, setCsrfToken] = useState('')

  const fetchCSRFToken = async () => {
    try {
      console.log('Fetching CSRF token from API...')
      const res = await fetch('/auth/api/csrf-token', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      })
      console.log('CSRF API response status:', res.status)
      if (res.ok) {
        const data = await res.json()
        console.log('CSRF token received:', data.csrf_token ? 'yes' : 'no')
        if (data.csrf_token) {
          setCsrfToken(data.csrf_token)
          return true
        }
      }
    } catch (err) {
      console.error('Failed to fetch CSRF token:', err)
    }
    return false
  }

  useEffect(() => {
    // Try to get CSRF token from meta tag first (Flask templates)
    const meta = document.querySelector('meta[name="csrf-token"]')
    if (meta && meta.getAttribute('content')) {
      setCsrfToken(meta.getAttribute('content'))
      console.log('CSRF token from meta tag')
    } else {
      // If no meta tag (React routes), fetch from API immediately
      fetchCSRFToken()
    }
  }, [])

  // Configure axios defaults
  useEffect(() => {
    if (csrfToken) {
      axios.defaults.headers.common['X-CSRFToken'] = csrfToken
    }
  }, [csrfToken])

  return (
    <CSRFContext.Provider value={{ csrfToken, setCsrfToken }}>
      {children}
    </CSRFContext.Provider>
  )
}

export function useCSRF() {
  const context = useContext(CSRFContext)
  if (!context) {
    throw new Error('useCSRF must be used within a CSRFProvider')
  }
  return context
}

// Helper function for fetch requests
export function fetchWithCSRF(url, options = {}) {
  const meta = document.querySelector('meta[name="csrf-token"]')
  const token = meta ? meta.getAttribute('content') : ''
  
  return fetch(url, {
    ...options,
    credentials: 'include',  // Important: include cookies for session
    headers: {
      ...options.headers,
      'X-CSRFToken': token
    }
  })
}

export default CSRFContext
