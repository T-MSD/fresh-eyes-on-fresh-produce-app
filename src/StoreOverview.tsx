import { useEffect, useRef } from 'react'
import { formatTime } from './time'
import { isUnsure } from './confidence'
import { extendsOutsideFrame } from './camera'
import { CameraFrameView } from './CameraFrameView'
import { Icon, type IconName } from './Icon'
import { countAreas, type CameraFrame, type CameraState, type StoreArea, type StoreSnapshot, type StoreState } from './store'

const unavailableAreaLabels: Record<Extract<StoreArea, { status: 'unavailable' }>['reason'], string> = {
  'no-prediction': 'No prediction',
  'frame-missing': 'Frame missing',
  'camera-failed': 'Camera not loaded',
}

export function StoreStatus({ state, onRetry }: { state: Exclude<StoreState, StoreSnapshot>; onRetry: () => void }) {
  if (state.status === 'loading') return <p className="board-message" role="status">Loading Cameras and area predictions…</p>
  if (state.status === 'error') return <div className="board-message" role="alert"><p>{state.message}</p><button className="dialog-close" onClick={onRetry}>Try again</button></div>
  return <div className="board-message" role="status">
    <p>{state.reason === 'no-run' ? 'No analysis run has finished yet. Tasks appear here after the first completed run.' : 'The latest analysis run has no predictions yet.'}</p>
    <button className="dialog-close" onClick={onRetry}>Check again</button>
  </div>
}

function areaIcon(area: Extract<StoreArea, { status: 'available' }>): IconName {
  if (!area.compliant) return 'move-product'
  return area.stock === 'empty' ? 'restock' : area.stock === 'half' ? 'top-up' : 'check'
}

export function AreaIndicator({ area }: { area: StoreArea }) {
  const available = area.status === 'available'
  const uncertain = available && isUnsure(area.confidence)
  const label = available ? `Area ${area.number}: ${area.stock}${area.compliant ? '' : ', wrong product'}${uncertain ? ', low confidence' : ''}` : `Area ${area.number}: ${unavailableAreaLabels[area.reason].toLowerCase()}`
  return <span className={`area-indicator ${available ? `stock-${area.stock}${area.compliant ? '' : ' wrong-product'}` : 'area-unavailable'}${uncertain ? ' uncertain' : ''}`} title={label} role="img" aria-label={label}>
    {available ? <Icon name={areaIcon(area)} /> : '?'}
  </span>
}

function CameraSummary({ camera }: { camera: CameraState }) {
  if (camera.frame.status === 'failed') return <span className="camera-summary">? State unknown</span>
  const counts = countAreas(camera.areas)
  const issues = [counts.empty && `${counts.empty} empty`, counts.wrong && `${counts.wrong} wrong product`, counts.half && `${counts.half} half`, counts.unavailable && `${counts.unavailable} unavailable`].filter(Boolean)
  return <span className={`camera-summary${issues.length ? '' : ' all-ok'}`}>{issues.length ? issues.join(' · ') : '✓ All areas OK'}</span>
}

function FrameTime({ frame }: { frame: CameraFrame }) {
  if (frame.status === 'available') return <>Frame <time>{formatTime(frame.frame.ts)}</time></>
  if (frame.status === 'unreadable') return <>Frame <time>{formatTime(frame.ts)}</time></>
  return frame.status === 'missing' ? 'Frame missing' : 'Not loaded'
}

function FrameNotice({ camera }: { camera: CameraState }) {
  const { frame } = camera
  if (frame.status === 'missing') return <span className="camera-notice">No Frame at or before Now.</span>
  if (frame.status === 'failed') return <span className="camera-notice">This Camera could not be loaded.</span>
  const ts = frame.status === 'available' ? frame.frame.ts : frame.ts
  return <>
    {frame.status === 'unreadable' && <span className="camera-notice">The Frame image is unreadable. Predictions are fallbacks.</span>}
    {frame.stale && <span className="camera-notice">No Frame since {formatTime(ts)}, showing the last one.</span>}
    {frame.status === 'available' && camera.areas.some(area => extendsOutsideFrame(area, frame.frame)) && <span className="camera-notice">Some Areas extend outside the Frame.</span>}
  </>
}

export function StoreOverview({ state, onSelect, onRetry }: { state: StoreSnapshot; onSelect: (camera: CameraState) => void; onRetry: () => void }) {
  const failedCameras = state.cameras.filter(camera => camera.frame.status === 'failed').length
  return <div className="store-overview">
    <h1 className="page-title">Store</h1>
    <dl className="store-counts mb-7 grid grid-cols-4 gap-3.5 max-[600px]:grid-cols-2 max-[600px]:gap-2.5">
      <div className="count-empty"><dt><Icon name="restock" /> Empty</dt><dd>{state.counts.empty}</dd></div>
      <div className="count-wrong"><dt><Icon name="move-product" /> Wrong product</dt><dd>{state.counts.wrong}</dd></div>
      <div className="count-half"><dt><Icon name="top-up" /> Half</dt><dd>{state.counts.half}</dd></div>
      <div className="count-ok"><dt><Icon name="check" /> OK</dt><dd>{state.counts.ok}</dd></div>
    </dl>
    {failedCameras > 0 && <p className="store-notice" role="alert">{failedCameras === 1 ? 'One Camera' : `${failedCameras} Cameras`} could not be loaded. Counts leave them out. <button className="label-skip" onClick={onRetry}>Try again</button></p>}
    {state.counts.unavailable > 0 && <p className="store-notice" role="status">{state.counts.unavailable} Areas unavailable at the selected time.</p>}
    <h2 className="camera-list-heading">Gondolas, most urgent first</h2>
    {state.cameras.length === 0 ? <p className="board-message">The latest analysis run has no Cameras.</p> : <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-[600px]:grid-cols-1 max-[600px]:gap-3">
      {state.cameras.map(camera => <button key={camera.id} className="camera-card" onClick={() => onSelect(camera)}>
        <span className="camera-title">{camera.name}<span className="camera-chevron" aria-hidden="true">›</span></span>
        <span className="camera-meta">Camera {camera.id} · {camera.areas.length} Areas · <FrameTime frame={camera.frame} /></span>
        <span className="area-indicators">{camera.areas.map(area => <AreaIndicator key={area.id} area={area} />)}</span>
        <CameraSummary camera={camera} />
        <FrameNotice camera={camera} />
      </button>)}
    </div>}
    <div className="store-legend" aria-label="Area indicator legend"><span className="count-ok"><Icon name="check" /> Full</span><span className="count-half"><Icon name="top-up" /> Half</span><span className="count-empty"><Icon name="restock" /> Empty</span><span className="count-wrong"><Icon name="move-product" /> Wrong product</span><span>Dashed outline: low or unknown confidence</span></div>
  </div>
}

export type CameraSelection = { cameraId: string; areaId?: string; origin: 'tasks' | 'store' }

function CameraFrameSection({ camera, selectedAreaId }: { camera: CameraState; selectedAreaId?: string }) {
  const { frame } = camera
  if (frame.status === 'available') return <><p>Frame <time>{formatTime(frame.frame.ts)}</time> · {frame.frame.image}</p><CameraFrameView key={frame.frame.image} cameraId={camera.id} frame={frame.frame} areas={camera.areas} showPredictions selectedAreaId={selectedAreaId} /></>
  if (frame.status === 'unreadable') return <p className="label-frame-message" role="status">Frame <time>{formatTime(frame.ts)}</time> · {frame.image} is unreadable, so it cannot be shown.</p>
  return <p className="label-frame-message" role="status">{frame.status === 'missing' ? 'No Frame at or before Now.' : 'This Camera could not be loaded.'}</p>
}

export function CameraDialog({ camera, selectedAreaId, origin, onClose, onVerify }: { camera: CameraState; selectedAreaId?: string; origin: 'tasks' | 'store'; onClose: () => void; onVerify: (areaId: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog className="area-dialog camera-dialog" ref={dialogRef} onCancel={onClose} aria-labelledby="camera-dialog-title">
    <div className="dialog-heading"><span>Camera {camera.id}</span><button onClick={onClose} aria-label="Close Camera details">×</button></div>
    <h2 id="camera-dialog-title">{camera.name}</h2>
    <CameraSummary camera={camera} />
    <CameraFrameSection camera={camera} selectedAreaId={selectedAreaId} />
    <ul className="camera-area-list">{camera.areas.map(area => <li key={area.id} className={area.id === selectedAreaId ? 'selected-camera-area' : ''}>
      <AreaIndicator area={area} />
      <div className="camera-area-copy"><strong>{area.productName}</strong><span>Area {area.number} · {area.status === 'available' ? `${area.stock}${area.compliant ? '' : ` · ⚠ wrong product${area.detectedProductName ? `: ${area.detectedProductName}` : ''}`}` : unavailableAreaLabels[area.reason]}{area.status === 'available' && isUnsure(area.confidence) ? ` · Unsure${area.confidence === null ? '' : ` ${Math.round(area.confidence * 100)}%`}` : ''}</span></div>
      <button className="verify-label-button" onClick={() => onVerify(area.id)} aria-label={`Verify label for ${area.productName}, Area ${area.number}`}>Verify label</button>
    </li>)}</ul>
    <button className="dialog-close" onClick={onClose}>Back to {origin === 'tasks' ? 'Tasks' : 'Store'}</button>
  </dialog>
}
