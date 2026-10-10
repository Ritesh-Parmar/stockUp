import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/auth'

/**
 * ProtectedRoute — wraps any route element.
 * If the user is not authenticated, redirects to /login with
 * the intended destination encoded as ?redirect=<path>.
 *
 * The redirect value is validated to be a same-origin relative path
 * (must start with '/') to prevent open-redirect attacks.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    const intended = location.pathname + location.search + location.hash
    // Safety: only allow relative paths as redirect targets
    const safeRedirect = intended.startsWith('/') ? intended : '/dashboard'
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(safeRedirect)}`}
        replace
      />
    )
  }

  return children
}
