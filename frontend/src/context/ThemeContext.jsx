import React, { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

const defaultTheme = {
  mode: 'light',
  colorPrimary: '#4f46e5',
  colorPrimaryHover: '#4338ca',
  colorSuccess: '#10b981',
  colorWarning: '#f59e0b',
  colorDanger: '#ef4444',
  bgBody: '#f8fafc',
  bgCard: '#ffffff',
  bgNav: '#ffffff',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  borderColor: '#e2e8f0'
}

const darkTheme = {
  mode: 'dark',
  colorPrimary: '#4f46e5',
  colorPrimaryHover: '#4338ca',
  colorSuccess: '#10b981',
  colorWarning: '#f59e0b',
  colorDanger: '#ef4444',
  bgBody: '#0f172a',
  bgCard: '#1e293b',
  bgNav: '#1e293b',
  textPrimary: '#f1f5f9',
  textSecondary: '#cbd5e1',
  borderColor: '#334155'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Try to load full theme from localStorage first
    try {
      const savedTheme = localStorage.getItem('theme')
      if (savedTheme) {
        return JSON.parse(savedTheme)
      }
    } catch (e) {
      console.error('Failed to load theme from localStorage:', e)
    }
    
    // Fallback to cookie for mode only
    const savedMode = document.cookie
      .split('; ')
      .find(row => row.startsWith('theme='))
      ?.split('=')[1]
    
    return savedMode === 'dark' ? darkTheme : defaultTheme
  })

  const saveTheme = (themeToSave) => {
    // Save to localStorage for full theme persistence
    localStorage.setItem('theme', JSON.stringify(themeToSave))
    // Save mode to cookie for backwards compatibility
    document.cookie = `theme=${themeToSave.mode};path=/;max-age=31536000`
    // Update HTML attribute for Bootstrap
    document.documentElement.setAttribute('data-bs-theme', themeToSave.mode)
  }

  const toggleTheme = () => {
    const newTheme = theme.mode === 'light' ? { ...darkTheme } : { ...defaultTheme }
    setTheme(newTheme)
    saveTheme(newTheme)
  }

  const setThemeMode = (mode) => {
    const newTheme = mode === 'dark' ? { ...darkTheme } : { ...defaultTheme }
    setTheme(newTheme)
    saveTheme(newTheme)
  }

  const updateTheme = (updates) => {
    const newTheme = { ...theme, ...updates }
    setTheme(newTheme)
    saveTheme(newTheme)
  }

  const resetTheme = (mode = 'light') => {
    const newTheme = mode === 'dark' ? { ...darkTheme } : { ...defaultTheme }
    setTheme(newTheme)
    saveTheme(newTheme)
  }

  const isDark = theme.mode === 'dark'

  // Apply theme to CSS variables on mount
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--color-primary', theme.colorPrimary)
    root.style.setProperty('--color-primary-hover', theme.colorPrimaryHover)
    root.style.setProperty('--color-success', theme.colorSuccess)
    root.style.setProperty('--color-warning', theme.colorWarning)
    root.style.setProperty('--color-danger', theme.colorDanger)
    root.style.setProperty('--bg-body', theme.bgBody)
    root.style.setProperty('--bg-card', theme.bgCard)
    root.style.setProperty('--bg-nav', theme.bgNav)
    root.style.setProperty('--text-primary', theme.textPrimary)
    root.style.setProperty('--text-secondary', theme.textSecondary)
    root.style.setProperty('--border-color', theme.borderColor)
    
    // Set Bootstrap theme attribute
    document.documentElement.setAttribute('data-bs-theme', theme.mode)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, setThemeMode, updateTheme, resetTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export default ThemeContext
