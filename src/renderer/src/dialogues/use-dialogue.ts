import { useCallback, useEffect, useRef, useState } from 'react'
import { DialogueSelector } from '@shared/dialogue-selector'

export function useDialogue(enabled: boolean): {
  dialogue: string | null
  show(category: string, lines: readonly string[], required?: boolean): string | null
  clear(): void
} {
  const selector = useRef(new DialogueSelector())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dialogue, setDialogue] = useState<string | null>(null)
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setDialogue(null)
  }, [])
  const show = useCallback((category: string, lines: readonly string[], required = false): string | null => {
    const selected = selector.current.select({
      category,
      lines,
      now: Date.now(),
      random: Math.random,
      enabled: required || enabled
    })
    if (!selected) return null
    clear()
    setDialogue(selected)
    timer.current = setTimeout(() => {
      timer.current = null
      setDialogue(null)
    }, 2_800)
    return selected
  }, [clear, enabled])
  useEffect(() => () => clear(), [clear])
  return { dialogue, show, clear }
}
