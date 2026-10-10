import { useEffect, useState } from 'react'
import { fetchLabellingDataset, type LabellingState } from './labelling'

export function useLabellingDataset() {
  const [state, setState] = useState<LabellingState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetchLabellingDataset(controller.signal).then(cameras => {
      if (!controller.signal.aborted) setState({ status: 'ready', cameras })
    }).catch(() => {
      if (!controller.signal.aborted) setState({ status: 'error', message: 'The Frames and Planogram could not be loaded.' })
    })
    return () => controller.abort()
  }, [attempt])
  function retry() { setState({ status: 'loading' }); setAttempt(previous => previous + 1) }
  return { state, retry }
}
