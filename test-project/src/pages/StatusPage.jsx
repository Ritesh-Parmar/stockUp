import { useNavigate } from 'react-router-dom'
import StatusGraphView from '../components/StatusGraphView'

/**
 * StatusPage — /dashboard/status
 * Shows the live diagnostics / status graph.
 * Close navigates back to /dashboard.
 */
export default function StatusPage() {
  const navigate = useNavigate()
  return <StatusGraphView onClose={() => navigate('/dashboard')} />
}
