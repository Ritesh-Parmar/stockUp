import { createContext, useContext } from 'react'

/**
 * Auth context object and its consumer hook.
 *
 * These live apart from <AuthProvider> because Fast Refresh only works when a
 * module exports components alone — mixing a provider component and a hook in
 * one file makes every edit to either blow away the other's state.
 * The provider is in ./AuthContext.jsx.
 */
export const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
