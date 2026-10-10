import { useEffect, useState } from 'react'
import InstrumentDiffView from '../components/InstrumentDiffView'
import { getApi, postApi } from '../lib/mstockApi'
import { useAuth } from '../context/auth'
import { logEvent } from '../lib/activityLog'

/**
 * InstrumentDiffPage — /dashboard/instruments
 *
 * Snapshots are captured by the backend after each sign-in, so this page only
 * has to list the days it already holds and ask for a comparison.
 */
export default function InstrumentDiffPage() {
  const { authData } = useAuth()
  const [snapshots, setSnapshots] = useState([])
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getApi('/instruments/snapshots', authData?.accessToken)
      .then(({ data }) => { if (!cancelled) setSnapshots(data) })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not list saved snapshots.') })
    return () => { cancelled = true }
  }, [authData])

  const compare = async (body, detail) => {
    setLoading(true)
    setError('')
    try {
      const { data } = await postApi('/instruments/compare', { ...body, access_token: authData?.accessToken })
      setResult(data)
      logEvent('instruments.compare', { target: '/dashboard/instruments', outcome: 'ok', detail: { ...detail, added: data.summary.added, deleted: data.summary.deleted, changed: data.summary.changed } })
    } catch (err) {
      setError(err.message || 'The comparison failed.')
      logEvent('instruments.compare', { target: '/dashboard/instruments', outcome: 'error', detail: { ...detail, errorMessage: err.message } })
    } finally {
      setLoading(false)
    }
  }

  const handleCompare = (from, to) => compare({ from, to }, { from, to })

  const handleCompareFiles = async (oldFile, newFile) => {
    if (!oldFile || !newFile) return
    const [oldCsv, newCsv] = await Promise.all([oldFile.text(), newFile.text()])
    return compare({ oldCsv, newCsv }, { from: 'uploaded', to: 'uploaded' })
  }

  return (
    <div className="flex h-full w-full overflow-y-auto bg-page p-8">
      <div className="w-full">
        <InstrumentDiffView
          snapshots={snapshots}
          result={result}
          loading={loading}
          error={error}
          onCompare={handleCompare}
          onCompareFiles={handleCompareFiles}
        />
      </div>
    </div>
  )
}
