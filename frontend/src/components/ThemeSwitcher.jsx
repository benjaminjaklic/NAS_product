import React from 'react'
import { useTheme } from '../context/ThemeContext'

function ThemeSwitcher() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme.mode === 'dark'

  return (
    <button
      onClick={toggleTheme}
      className="btn btn-outline-secondary d-flex align-items-center gap-2"
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {isDark ? (
        <>
          <i className="fas fa-sun"></i>
          <span>Light Mode</span>
        </>
      ) : (
        <>
          <i className="fas fa-moon"></i>
          <span>Dark Mode</span>
        </>
      )}
    </button>
  )
}

export default ThemeSwitcher
