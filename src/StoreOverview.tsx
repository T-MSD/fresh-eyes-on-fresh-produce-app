import { useEffect, useRef } from 'react'
import { formatTime } from './time'
import { lowConfidenceThreshold } from './tasks'
import { CameraFrameView } from './CameraFrameView'
import { countAreas, getCameraPlanogram, type CameraState, type StoreArea, type StoreState } from './store'

export function AreaIndicator({ area }: { area: StoreArea }) {
  const available = area.status === 'available'
  const uncertain = available && (area.confidence === null || area.confidence < lowConfidenceThreshold)
  const label = available ? `Area ${area.number}: ${area.stock}${area.compliant ? '' : ', wrong product'}${uncertain ? ', low confidence' : ''}` : `Area ${area.number}: ${area.reason === 'area-outside-frame' ? 'outside Frame' : area.reason === 'frame-missing' ? 'Frame missing' : 'no predictions'}`
  return <span className={`area-indicator ${available ? `stock-${area.stock}${area.compliant ? '' : ' wrong-product'}` : 'area-unavailable'}${uncertain ? ' uncertain' : ''}`} title={label} role="img" aria-label={label}>
    {!available ? '?' : !area.compliant ? '⚠' : area.stock === 'empty' ? <span className="empty-slash" /> : area.stock === 'half' ? '½' : '✓'}
  </span>
}

function CameraSummary({ camera }: { camera: CameraState }) {
  const counts = countAreas(camera.areas)
  const issues = [counts.empty && `${counts.empty} empty`, counts.wrong && `${counts.wrong} wrong product`, counts.half && `${counts.half} half`, counts.unavailable && `${counts.unavailable} unavailable`].filter(Boolean)
  return <span className={`camera-summary${issues.length ? '' : ' all-ok'}`}>{issues.length ? issues.join(' · ') : '✓ All areas OK'}</span>
}

export function StoreOverview({ state, onSelect }: { state: StoreState; onSelect: (camera: CameraState) => void }) {
  if (state.status === 'loading') return <p className="board-message" role="status">Loading Cameras and area predictions…</p>
  if (state.status === 'error') return <p className="board-message" role="alert">{state.message}</p>
  return <div className="store-overview">
    <h1 className="page-title">Store</h1>
    <dl className="store-counts mb-7 grid grid-cols-4 gap-3.5 max-[600px]:grid-cols-2 max-[600px]:gap-2.5">
      <div className="count-empty"><dt><span aria-hidden="true">▱</span> Empty</dt><dd>{state.counts.empty}</dd></div>
      <div className="count-wrong"><dt><span aria-hidden="true">⚠</span> Wrong product</dt><dd>{state.counts.wrong}</dd></div>
      <div className="count-half"><dt><span aria-hidden="true">◩</span> Half</dt><dd>{state.counts.half}</dd></div>
      <div className="count-ok"><dt><span aria-hidden="true">✓</span> OK</dt><dd>{state.counts.ok}</dd></div>
    </dl>
    {state.counts.unavailable > 0 && <p className="store-notice" role="status">{state.counts.unavailable} Areas unavailable at the selected time.</p>}
    <h2 className="camera-list-heading">Gondolas, most urgent first</h2>
    {state.cameras.length === 0 ? <p className="board-message">No Cameras configured. Add a Planogram to see Areas here.</p> : <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-[600px]:grid-cols-1 max-[600px]:gap-3">
      {state.cameras.map(camera => <button key={camera.id} className="camera-card" onClick={() => onSelect(camera)}>
        <span className="camera-title">{camera.name}<span className="camera-chevron" aria-hidden="true">›</span></span>
        <span className="camera-meta">Camera {camera.id} · {camera.areas.length} Areas · {camera.frame.status === 'available' ? <>Frame <time>{formatTime(camera.frame.frame.ts)}</time></> : 'Frame missing'}</span>
        <span className="area-indicators">{camera.areas.map(area => <AreaIndicator key={area.id} area={area} />)}</span>
        <CameraSummary camera={camera} />
        {camera.frame.status === 'missing' ? <span className="camera-notice">No Frame at or before Now.</span> : camera.frame.stale && <span className="camera-notice">No Frame since {formatTime(camera.frame.frame.ts)}, showing the last one.</span>}
        {camera.areas.some(area => area.status === 'unavailable' && area.reason === 'area-outside-frame') && <span className="camera-notice">Some Areas extend outside the Frame.</span>}
      </button>)}
    </div>}
    <div className="store-legend" aria-label="Area indicator legend"><span>Stock level: ✓ green full · ½ amber half · ▱ red empty</span><span>⚠ Purple outline: wrong product</span><span>Dashed outline: low or unknown confidence</span></div>
  </div>
}

export type CameraSelection = { cameraId: string; areaId?: string; origin: 'tasks' | 'store' }

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
    {camera.frame.status === 'available' ? <><p>Frame <time>{formatTime(camera.frame.frame.ts)}</time> · {camera.frame.frame.image}</p><CameraFrameView key={camera.frame.frame.image} camera={getCameraPlanogram(camera)} frame={camera.frame.frame} selectedAreaId={selectedAreaId} areas={camera.areas} /></> : <p className="label-frame-message" role="status">No Frame at or before Now.</p>}
    <ul className="camera-area-list">{camera.areas.map(area => <li key={area.id} className={area.id === selectedAreaId ? 'selected-camera-area' : ''}>
      <AreaIndicator area={area} />
      <div className="camera-area-copy"><strong>{area.productName}</strong><span>Area {area.number} · {area.status === 'available' ? `${area.stock}${area.compliant ? '' : ' · ⚠ wrong product'}` : area.reason === 'frame-missing' ? 'Frame missing' : area.reason === 'area-outside-frame' ? 'Outside Frame' : 'No predictions'}{area.status === 'available' && (area.confidence === null || area.confidence < lowConfidenceThreshold) ? ` · Unsure${area.confidence === null ? '' : ` ${Math.round(area.confidence * 100)}%`}` : ''}</span></div>
      <button className="verify-label-button" onClick={() => onVerify(area.id)} aria-label={`Verify label for ${area.productName}, Area ${area.number}`}>Verify label</button>
    </li>)}</ul>
    <button className="dialog-close" onClick={onClose}>Back to {origin === 'tasks' ? 'Tasks' : 'Store'}</button>
  </dialog>
}
