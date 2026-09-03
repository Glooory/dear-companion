import { useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import styles from './Tooltip.module.css'

interface TooltipProps {
  content: string
  children: ReactNode
  position?: 'top' | 'bottom' | 'right' | 'left' | 'top-end'
  className?: string
  disabled?: boolean
}

const positionClassMap: Record<'top' | 'bottom' | 'right' | 'left' | 'top-end', string | undefined> = {
  top: styles.top,
  bottom: styles.bottom,
  right: styles.right,
  left: styles.left,
  'top-end': styles.topEnd,
}

export function Tooltip({
  content,
  children,
  position = 'top',
  className = '',
  disabled = false,
}: TooltipProps): React.JSX.Element {
  const [visible, setVisible] = useState(false)
  const isEnabled = !disabled && Boolean(content)

  return (
    <span
      className={clsx(styles.wrapper, className)}
      onMouseEnter={() => {
        if (isEnabled) setVisible(true)
      }}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => {
        if (isEnabled) setVisible(true)
      }}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && isEnabled && (
        <span className={clsx(styles.bubble, positionClassMap[position])} role="tooltip">
          {content}
        </span>
      )}
    </span>
  )
}

export function InfoTooltip({
  text,
  position = 'top',
}: {
  text: string
  position?: 'top' | 'bottom' | 'right' | 'left'
}): React.JSX.Element {
  return (
    <Tooltip content={text} position={position} className={styles.infoTrigger}>
      <button type="button" className={styles.infoButton} aria-label={text} tabIndex={0}>
        <svg
          viewBox="0 0 16 16"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8" cy="8" r="6.5" />
          <line x1="8" y1="7.2" x2="8" y2="11" />
          <circle cx="8" cy="4.8" r="0.6" fill="currentColor" />
        </svg>
      </button>
    </Tooltip>
  )
}
