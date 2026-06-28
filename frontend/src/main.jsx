import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ThemeProvider } from './context/ThemeContext'
import { CSRFProvider } from './context/CSRFContext'
import { AuthProvider } from './context/AuthContext'
import { ModalProvider } from './context/ModalContext'
import { UploadProvider } from './context/UploadContext'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <CSRFProvider>
          <AuthProvider>
            <ThemeProvider>
              <ModalProvider>
                <UploadProvider>
                  <App />
                </UploadProvider>
              </ModalProvider>
            </ThemeProvider>
          </AuthProvider>
        </CSRFProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
