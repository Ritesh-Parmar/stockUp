import { createContext, useContext, useState, useCallback, useMemo } from 'react'

const AuthContext = createContext(null)
const STORAGE_KEY = 'mstock_session'

// sessionStorage throws in some privacy modes — never let that take the app down.
const storage = {
  read() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') }
    catch { return null }
  },
  write(value) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value)); return true }
    catch { return false }
  },
  clear() {
    try { sessionStorage.removeItem(STORAGE_KEY); return true }
    catch { return false }
  },
}

/**
 * AuthProvider — wraps the app and exposes:
 *   isAuthenticated  boolean, derived from authData
 *   authData         { accessToken, apiKey, session } | null
 *   login(data)      call after a successful OTP verify
 *   logout()         clears everything and forces re-login
 *
 * authData is the single source of truth: isAuthenticated is derived from it,
 * so the two can no longer disagree. Previously only a boolean flag was
 * persisted, which meant a page refresh restored "logged in" with no tokens —
 * ProtectedRoute let you through and every API call then failed.
 *
 * The whole payload lives in sessionStorage, which is per-tab and cleared when
 * the tab closes. That does put the access token in storage where the old code
 * deliberately kept it in memory only; it is the price of surviving a refresh.
 * If you would rather a refresh sign the user out, drop the storage calls here
 * and initialise authData to null — nothing else needs to change.
 */
export function AuthProvider({ children }) {
  const [authData, setAuthData] = useState(storage.read)

  const login = useCallback((data) => {
    setAuthData(data ?? null)
    if (data) storage.write(data)
    else storage.clear()
  }, [])

  const logout = useCallback(() => {
    setAuthData(null)
    storage.clear()
  }, [])

  const value = useMemo(
    () => ({ isAuthenticated: Boolean(authData?.accessToken), authData, login, logout }),
    [authData, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
