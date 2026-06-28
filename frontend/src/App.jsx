import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useTheme } from './context/ThemeContext'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Dashboard from './components/Dashboard'
import ThemeSettings from './components/ThemeSettings'
import Notes from './components/Notes'
import Login from './components/Login'
import Register from './components/Register'
import Admin from './components/Admin'
import AdminLogs from './components/AdminLogs'
import Profile from './components/Profile'
import Trash from './components/Trash'
import ServerSettings from './components/ServerSettings'
import SetupWizard from './components/SetupWizard'
import UploadIndicator from './components/UploadIndicator'

function App() {
  const { theme } = useTheme()
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh', backgroundColor: theme.bgBody }}>
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: theme.bgBody, minHeight: '100vh' }}>
      <Navbar />
      <Routes>
        <Route path="/setup" element={<SetupWizard />} />
        <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
        <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to="/" />} />
        <Route path="/" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} />
        <Route path="/admin" element={isAuthenticated ? <Admin /> : <Navigate to="/login" />} />
        <Route path="/admin/logs" element={isAuthenticated ? <AdminLogs /> : <Navigate to="/login" />} />
        <Route path="/settings/theme" element={isAuthenticated ? <ThemeSettings /> : <Navigate to="/login" />} />
        <Route path="/settings/server" element={isAuthenticated ? <ServerSettings /> : <Navigate to="/login" />} />
        <Route path="/notes" element={isAuthenticated ? <Notes /> : <Navigate to="/login" />} />
        <Route path="/profile" element={isAuthenticated ? <Profile /> : <Navigate to="/login" />} />
        <Route path="/trash" element={isAuthenticated ? <Trash /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      {isAuthenticated && <UploadIndicator />}
    </div>
  )
}

export default App
