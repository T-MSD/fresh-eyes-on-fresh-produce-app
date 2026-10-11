import { useEffect, useRef, useState } from 'react'
import { fetchCamera, fetchStockHistory } from './cameraApi'
import type { StockSample } from './cameraContract'
import { CameraDialog } from './StoreOverview'
import type { CameraState } from './store'
import { formatTime } from './time'
import { isUnsure } from './confidence'

function StockHistory({ areaId }: { areaId: string }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; samples: StockSample[] }>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetchStockHistory(areaId, controller.signal).then(samples => {
      if (!controller.signal.aborted) setState({ status: 'ready', samples })
    }).catch(() => { if (!controller.signal.aborted) setState({ status: 'error' }) })
    return () => controller.abort()
  }, [areaId])
  return <section aria-label={`Stock today for Area ${areaId}`}><h3>Stock today · Area {areaId}</h3>
    {state.status === 'loading' ? <p role="status">Loading stock history…</p> : state.status === 'error' ? <p role="alert">Stock history unavailable.</p> : state.samples.length === 0 ? <p>No stock predictions yet.</p> : <div className="stock-history">{state.samples.map(sample => <div key={sample.ts} className={`stock-sample stock-${sample.stock}${isUnsure(sample.confidence) ? ' uncertain' : ''}`} title={`${formatTime(sample.ts)} · ${sample.stock}${isUnsure(sample.confidence) ? ' · Unsure' : ''}`}><span>{sample.stock === 'full' ? '✓' : sample.stock === 'half' ? '½' : '▱'}</span><time>{formatTime(sample.ts)}</time></div>)}</div>}
  </section>
}

export function ApiCameraDialog({ cameraId, now, selectedAreaId, origin, onClose, onVerify }: { cameraId: string; now: number; selectedAreaId?: string; origin: 'tasks' | 'store'; onClose: () => void; onVerify: (areaId: string) => void }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; camera: CameraState }>({ status: 'loading' })
  const [areaId, setAreaId] = useState(selectedAreaId)
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetchCamera(cameraId, now, controller.signal).then(camera => {
      if (!controller.signal.aborted) { setState({ status: 'ready', camera }); setAreaId(previous => previous ?? camera.areas[0]?.id) }
    }).catch(error => { if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : 'Camera unavailable.' }) })
    return () => controller.abort()
  }, [cameraId, now])
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [state.status])
  if (state.status === 'ready') return <CameraDialog camera={state.camera} selectedAreaId={areaId} origin={origin} onClose={onClose} onVerify={onVerify}>
    <label>Selected Area <select value={areaId ?? ''} onChange={event => setAreaId(event.target.value)}>{state.camera.areas.map(area => <option key={area.id} value={area.id}>{area.number} · {area.productName}</option>)}</select></label>
    {areaId && <StockHistory key={areaId} areaId={areaId} />}
  </CameraDialog>
  return <dialog className="area-dialog camera-dialog" ref={dialogRef} onCancel={onClose} aria-label={`Camera ${cameraId}`}>
    <button onClick={onClose} aria-label="Close Camera details">×</button>
    {state.status === 'loading' ? <p role="status">Loading Camera…</p> : <p role="alert">{state.message}</p>}
  </dialog>
}
