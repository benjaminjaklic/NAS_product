import React from 'react'
import { useTheme } from '../context/ThemeContext'

export function SkeletonBox({ width = '100%', height = '1rem', className = '' }) {
  const { theme } = useTheme()
  return (
    <div 
      className={`skeleton-box ${className}`}
      style={{ 
        width, 
        height, 
        backgroundColor: theme.borderColor,
        borderRadius: '0.25rem',
        animation: 'skeleton-pulse 1.5s ease-in-out infinite'
      }}
    />
  )
}

export function FileListSkeleton({ rows = 5 }) {
  const { theme } = useTheme()
  return (
    <div className="table-responsive">
      <table className="table table-hover mb-0">
        <thead>
          <tr style={{ backgroundColor: theme.bgNav }}>
            <th style={{ color: theme.textPrimary }}>Name</th>
            <th style={{ color: theme.textPrimary }}>Category</th>
            <th style={{ color: theme.textPrimary }}>Tags</th>
            <th style={{ color: theme.textPrimary }}>Size</th>
            <th style={{ color: theme.textPrimary }}>Date</th>
            <th style={{ color: theme.textPrimary }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {[...Array(rows)].map((_, i) => (
            <tr key={i} style={{ backgroundColor: theme.bgCard }}>
              <td><SkeletonBox width="180px" /></td>
              <td><SkeletonBox width="80px" /></td>
              <td><SkeletonBox width="100px" /></td>
              <td><SkeletonBox width="60px" /></td>
              <td><SkeletonBox width="80px" /></td>
              <td><SkeletonBox width="150px" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}

export function CardSkeleton() {
  const { theme } = useTheme()
  return (
    <div className="card" style={{ backgroundColor: theme.bgCard, borderColor: theme.borderColor }}>
      <div className="card-body">
        <SkeletonBox height="1.5rem" width="60%" className="mb-3" />
        <SkeletonBox height="0.875rem" className="mb-2" />
        <SkeletonBox height="0.875rem" width="80%" className="mb-2" />
        <SkeletonBox height="0.875rem" width="40%" />
      </div>
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}

export function StorageBarSkeleton() {
  return (
    <div className="mb-3">
      <div className="d-flex justify-content-between mb-1">
        <SkeletonBox width="100px" height="0.875rem" />
        <SkeletonBox width="80px" height="0.875rem" />
      </div>
      <SkeletonBox height="0.5rem" />
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}

export default { SkeletonBox, FileListSkeleton, CardSkeleton, StorageBarSkeleton }
