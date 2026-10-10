import { useEffect, useMemo, useState } from 'react'
import { ThemeContext } from './theme'

const STORAGE_KEY = 'mstock_theme'

/**
 * Which theme to open with.
 *
 * A saved choice wins; otherwise follow the operating system, because someone
 * running a light desktop almost certainly wants a light app. This used to be
 * a hardcoded `useState(true)`, so the app always opened dark and switching to
 * light was undone by the next refresh.
 *
 * Read in the state initialiser rather than an effect: it runs once, before
 * the first paint, so there is no flash of the wrong theme. localStorage throws
 * in some privacy modes, so every access is guarded.
 */
const initialIsDark = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'dark') return true
    if (saved === 'light') return false
  } catch { /* storage blocked — fall through to the OS preference */ }

  try {
    return !window.matchMedia('(prefers-color-scheme: light)').matches
  } catch {
    return true
  }
}

/**
 * ThemeProvider — owns the dark/light flag and mirrors it onto <html>, so both
 * Tailwind's `dark:` variants and the browser's own form controls follow.
 *
 * The class goes on <html> and nowhere else. It used to also be duplicated onto
 * a wrapper div, which was redundant once the token layer keyed everything off
 * `.dark`, and the wrapper's own `min-height: 100vh` fought the `h-screen`
 * layout inside it.
 *
 * The consumer hook lives in ./theme.js (see the note there).
 */
export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(initialIsDark)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', isDark)
    // So native controls — scrollbars, date pickers, form fields — match.
    root.style.colorScheme = isDark ? 'dark' : 'light'
    try {
      localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light')
    } catch { /* storage blocked: the theme still applies for this session */ }
  }, [isDark])

  const value = useMemo(
    () => ({ isDark, toggleTheme: () => setIsDark((previous) => !previous) }),
    [isDark],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
