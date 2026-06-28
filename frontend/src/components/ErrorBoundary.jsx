import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo })
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-vh-100 d-flex align-items-center justify-content-center" 
             style={{ backgroundColor: '#0f172a' }}>
          <div className="text-center p-5">
            <div className="mb-4">
              <i className="fas fa-exclamation-triangle fa-4x text-warning"></i>
            </div>
            <h2 className="text-white mb-3">Something went wrong</h2>
            <p className="text-secondary mb-4">
              The application encountered an unexpected error. Please try refreshing the page.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="text-start mb-4" style={{ maxWidth: '600px', margin: '0 auto' }}>
                <summary className="text-warning cursor-pointer mb-2">Error Details</summary>
                <pre className="bg-dark text-danger p-3 rounded small overflow-auto" 
                     style={{ maxHeight: '200px' }}>
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <div className="d-flex gap-3 justify-content-center">
              <button 
                className="btn btn-primary px-4"
                onClick={this.handleReset}
              >
                <i className="fas fa-home me-2"></i>Go to Dashboard
              </button>
              <button 
                className="btn btn-outline-light px-4"
                onClick={() => window.location.reload()}
              >
                <i className="fas fa-sync me-2"></i>Refresh Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
