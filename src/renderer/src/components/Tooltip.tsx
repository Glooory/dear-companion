import { useState, type ReactNode } from 'react'

interface TooltipProps {
  content: string
  children: ReactNode
  position?: 'top' | 'bottom' | 'right' | 'left'
  className?: string
}

export function Tooltip({ content, children, position = 'top', className = '' }: TooltipProps): React.JSX.Element {
  const [visible, setVisible] = useState(false)

  return (
    <span
      className={`tooltip-wrapper ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span className={`tooltip-bubble tooltip-${position}`} role="tooltip">
          {content}
        </span>
      )}
    </span>
  )
}

export function InfoTooltip({ text, position = 'top' }: { text: string; position?: 'top' | 'bottom' | 'right' | 'left' }): React.JSX.Element {
  return (
    <Tooltip content={text} position={position} className="info-tooltip-trigger">
      <button type="button" className="info-icon-button" aria-label={text} tabIndex={0}>
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6.5" />
          <line x1="8" y1="7.2" x2="8" y2="11" />
          <circle cx="8" cy="4.8" r="0.6" fill="currentColor" />
        </svg>
      </button>
    </Tooltip>
  )
}
