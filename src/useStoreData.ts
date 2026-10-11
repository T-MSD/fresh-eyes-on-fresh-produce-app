import { useEffect, useState } from 'react'
import { ApiError, fetchCameraFrame, fetchCameras, fetchHourRange, fetchTasks, type HourRange } from './api.ts'
import type { CameraPlanogram } from './camera.ts'
import type { TaskRecord } from './tasks.ts'
import { buildStoreSnapshot, type CameraReading, type StoreState } from './store.ts'

type RunData =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unavailable'; reason: 'no-run' | 'no-predictions' }
  | { status: 'ready'; timeline: HourRange; planograms: CameraPlanogram[]; tasks: TaskRecord[] }

type Readings =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; now: number; cameras: ReadonlyMap<string, CameraReading> }

const sliderSettleMilliseconds = 150

function describeFailure(error: unknown): string {
  if (error instanceof ApiError && error.failure === 'invalid-response') return 'The API sent data this app does not understand. Update the app and the pipeline together.'
  return 'The Fresh Eyes API could not be reached. Check that it is running, then try again.'
}

async function loadRun(signal: AbortSignal): Promise<RunData> {
  try {
    const [timeline, tasks, planograms] = await Promise.all([fetchHourRange(signal), fetchTasks(signal), fetchCameras(signal)])
    if (!timeline) return { status: 'unavailable', reason: 'no-predictions' }
    return { status: 'ready', timeline, planograms, tasks }
  } catch (error) {
    if (error instanceof ApiError && error.failure === 'not-found') return { status: 'unavailable', reason: 'no-run' }
    return { status: 'error', message: describeFailure(error) }
  }
}

async function loadReadings(planograms: CameraPlanogram[], now: number, signal: AbortSignal): Promise<Readings> {
  const entries = await Promise.all(planograms.map(async (planogram): Promise<[string, CameraReading]> => {
    try {
      const reading = await fetchCameraFrame(planogram.id, now, signal)
      return [planogram.id, reading ? { status: 'found', reading } : { status: 'no-frame' }]
    } catch { return [planogram.id, { status: 'failed' }] }
  }))
  if (entries.length > 0 && entries.every(([, reading]) => reading.status === 'failed')) return { status: 'error', message: describeFailure(null) }
  return { status: 'ready', now, cameras: new Map(entries) }
}

/** Loads the latest completed run once, then each Camera's Frame at or before `selectedTime` (the run's end when null). */
export function useStoreData(selectedTime: number | null) {
  const [run, setRun] = useState<RunData>({ status: 'loading' })
  const [readings, setReadings] = useState<Readings>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const timeline = run.status === 'ready' ? run.timeline : null
  const now = timeline ? Math.min(Math.max(selectedTime ?? timeline.end, timeline.start), timeline.end) : 0

  useEffect(() => {
    const controller = new AbortController()
    loadRun(controller.signal).then(result => { if (!controller.signal.aborted) setRun(result) })
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    if (run.status !== 'ready') return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      loadReadings(run.planograms, now, controller.signal).then(result => { if (!controller.signal.aborted) setReadings(result) })
    }, sliderSettleMilliseconds)
    return () => { clearTimeout(timer); controller.abort() }
  }, [run, now])

  const store: StoreState = run.status !== 'ready'
    ? run
    : readings.status !== 'ready'
      ? readings
      : buildStoreSnapshot(readings.now, run.planograms, readings.cameras, run.tasks)

  function retry() {
    setRun({ status: 'loading' })
    setReadings({ status: 'loading' })
    setAttempt(previous => previous + 1)
  }

  return { store, timeline, now, updating: readings.status === 'ready' && readings.now !== now, retry }
}
