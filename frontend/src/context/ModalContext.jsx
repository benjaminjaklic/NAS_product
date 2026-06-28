import React, { createContext, useContext, useState, useCallback } from 'react'
import { useTheme } from './ThemeContext'

const ModalContext = createContext()

export function useModal() {
  return useContext(ModalContext)
}

export function ModalProvider({ children }) {
  const { theme } = useTheme()
  const [modal, setModal] = useState(null)

  const confirm = useCallback(({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', variant = 'danger', icon = 'fa-exclamation-triangle' }) => {
    return new Promise((resolve) => {
      setModal({
        type: 'confirm',
        title,
        message,
        confirmText,
        cancelText,
        variant,
        icon,
        onConfirm: () => { setModal(null); resolve(true) },
        onCancel: () => { setModal(null); resolve(false) }
      })
    })
  }, [])

  const alert = useCallback(({ title = 'Notice', message, variant = 'info', icon = 'fa-info-circle' }) => {
    return new Promise((resolve) => {
      setModal({
        type: 'alert',
        title,
        message,
        variant,
        icon,
        onConfirm: () => { setModal(null); resolve(true) },
        onCancel: () => { setModal(null); resolve(true) }
      })
    })
  }, [])

  const variantColors = {
    danger: '#dc3545',
    warning: '#ffc107',
    success: '#28a745',
    info: '#0d6efd',
    primary: '#0d6efd'
  }

  const variantBtnClass = {
    danger: 'btn-danger',
    warning: 'btn-warning',
    success: 'btn-success',
    info: 'btn-info',
    primary: 'btn-primary'
  }

  return (
    <ModalContext.Provider value={{ confirm, alert }}>
      {children}

      {modal && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999 }}
          onClick={(e) => { if (e.target === e.currentTarget) modal.onCancel() }}
        >
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '440px', margin: '16px auto', width: 'calc(100% - 32px)' }}>
            <div className="modal-content" style={{
              backgroundColor: theme.bgCard,
              borderColor: theme.borderColor,
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}>
              <div className="modal-body text-center py-4 px-4">
                <div className="mb-3">
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: `${variantColors[modal.variant] || variantColors.info}18`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <i
                      className={`fas ${modal.icon}`}
                      style={{
                        fontSize: '28px',
                        color: variantColors[modal.variant] || variantColors.info
                      }}
                    ></i>
                  </div>
                </div>
                <h5 className="mb-2" style={{ color: theme.textPrimary, fontWeight: 600 }}>
                  {modal.title}
                </h5>
                <p className="mb-0" style={{ color: theme.textSecondary, fontSize: '0.95rem', lineHeight: 1.5 }}>
                  {modal.message}
                </p>
              </div>
              <div className="modal-footer border-0 justify-content-center gap-2 pb-4 pt-0">
                {modal.type === 'confirm' ? (
                  <>
                    <button
                      className="btn btn-secondary px-4"
                      onClick={modal.onCancel}
                      style={{ borderRadius: '8px', minWidth: '100px' }}
                    >
                      {modal.cancelText}
                    </button>
                    <button
                      className={`btn ${variantBtnClass[modal.variant] || 'btn-primary'} px-4`}
                      onClick={modal.onConfirm}
                      style={{ borderRadius: '8px', minWidth: '100px' }}
                    >
                      {modal.confirmText}
                    </button>
                  </>
                ) : (
                  <button
                    className={`btn ${variantBtnClass[modal.variant] || 'btn-primary'} px-4`}
                    onClick={modal.onConfirm}
                    style={{ borderRadius: '8px', minWidth: '120px' }}
                  >
                    OK
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  )
}
