import { useState } from 'react'

export function useMachine() {
  const [isRunning, setIsRunning] = useState(false)

  const handleStart = () => {
    setIsRunning(true)
    alert(
      '✅ Machine Started\n\nThe machine has been powered on and is now operational.\nAll systems are running normally.\nMonitoring is active.'
    )
  }

  const handleStop = () => {
    setIsRunning(false)
    alert(
      '🛑 Machine Stopped\n\nThe machine has been safely shut down.\nAll processes have been terminated.\nSystem is now idle.'
    )
  }

  return { isRunning, handleStart, handleStop }
}