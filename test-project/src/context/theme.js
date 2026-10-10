import { createContext, useContext } from 'react'

/**
 * Theme context object and its consumer hook.
 * Kept apart from <ThemeProvider> for the same Fast Refresh reason as ./auth.js.
 * The provider is in ./ThemeContext.jsx.
 */
export const ThemeContext = createContext(null)

export function useTheme() {
  return useContext(ThemeContext)
}
