import { useEffect, useRef, useState } from 'react'
import type { StockLevel } from './tasks'
import { formatTime } from './time'
import { CameraFrameView } from './CameraFrameView'
import { exportLabels, findLabelFrame, loadLabels, saveLabels, resetUnreadableLabels, type LabelArea, type LabelTarget, type LabellingState, type SavedLabel } from './labelling'

function LabelForm({ area, saved, canLabel, outside, onSave, onClose }: { area: LabelArea; saved: SavedLabel | undefined; canLabel: boolean; outside: boolean; onSave: (stock: StockLevel, compliant: boolean) => void; onClose: () => void }) {
  const [stock, setStock] = useState<StockLevel | null>(saved?.stock ?? null)
  const [compliant, setCompliant] = useState<boolean | null>(saved?.compliant ?? null)
  return <form onSubmit={event => { event.preventDefault(); if (stock !== null && compliant !== null && canLabel) onSave(stock, compliant) }}>
    <h2>Planogram expects {area.productName}</h2>
    {outside && <p className="label-warning" role="status">This Area extends beyond the Frame. Verification is unavailable because it is not fully visible.</p>}
    {saved && <p className="label-hint">Your saved label is selected. Confirm it or change your answers.</p>}
    <fieldset disabled={!canLabel}><legend>How full is it?</legend><div className="label-options stock-options">
      {(['empty', 'half', 'full'] as const).map(level => <label key={level} className={stock === level ? 'chosen' : ''}><input type="radio" name="stock" required checked={stock === level} onChange={() => setStock(level)} />{level[0].toUpperCase() + level.slice(1)}</label>)}
    </div></fieldset>
    <fieldset disabled={!canLabel}><legend>Is it the right product?</legend><div className="label-options compliance-options">
      <label className={compliant === true ? 'chosen' : ''}><input type="radio" name="compliance" required checked={compliant === true} onChange={() => setCompliant(true)} />Right product</label>
      <label className={compliant === false ? 'chosen' : ''}><input type="radio" name="compliance" required checked={compliant === false} onChange={() => setCompliant(false)} />Wrong product</label>
    </div></fieldset>
    <p className="label-hint">Verify what you see in the highlighted Area. Predictions stay hidden so they cannot sway you.</p>
    <button className="label-save" type="submit" disabled={!canLabel || stock === null || compliant === null}>{saved ? 'Confirm label' : 'Save verified label'}</button>
    <button className="label-skip" type="button" onClick={onClose}>Cancel</button>
  </form>
}

function LabelVerification({ target, state, onRetry, onClose }: { target: LabelTarget; state: LabellingState; onRetry: () => void; onClose: () => void }) {
  const [labelsState, setLabelsState] = useState(loadLabels)
  const [saveError, setSaveError] = useState('')
  const [readyFrame, setReadyFrame] = useState('')
  const [savedNotice, setSavedNotice] = useState('')
  if (state.status === 'loading') return <p className="board-message" role="status">Loading Frame and Planogram…</p>
  if (state.status === 'error') return <div className="board-message" role="alert">{state.message} <button className="label-skip" onClick={onRetry}>Try again</button></div>
  const camera = state.cameras.find(camera => camera.id === target.cameraId)
  if (!camera) return <p className="board-message">Camera {target.cameraId} is unavailable for verification.</p>
  const frame = findLabelFrame(camera, target.now)
  const area = camera.areas.find(area => area.id === target.areaId)
  if (!frame) return <p className="board-message">No Frame at or before Now ({formatTime(target.now)}). Choose a later time and reopen verification.</p>
  if (!area) return <p className="board-message">Area {target.areaId} is missing from the Planogram. Verification is unavailable.</p>
  const labels = labelsState.status === 'ready' ? labelsState.labels : []
  const saved = labels.find(label => label.camera === camera.id && label.image === frame.image && label.areaId === area.id)
  const outside = area.corners.some(([x, y]) => x < 0 || y < 0 || x > frame.width || y > frame.height)

  function save(stock: StockLevel, compliant: boolean) {
    if (!camera || !frame || !area || labelsState.status !== 'ready') return
    const label: SavedLabel = { camera: camera.id, image: frame.image, areaId: area.id, productId: area.productId, stock, compliant }
    const next = [...labels.filter(item => !(item.camera === label.camera && item.image === label.image && item.areaId === label.areaId)), label]
    const result = saveLabels(next)
    if (result.status === 'error') { setSaveError(result.message); return }
    setLabelsState({ status: 'ready', labels: next })
    setSaveError('')
    setSavedNotice(`Verified label saved for Area ${area.id}.`)
  }

  return <div className="labelling-mode">
    <p className="verification-frame-meta">Camera {camera.id} · Area {area.id} · Frame {formatTime(frame.ts)} · {frame.image}</p>
    {labelsState.status === 'error' && <div className="label-warning" role="alert"><p>{labelsState.message}</p><button className="label-skip" onClick={() => setLabelsState(labelsState.reason === 'corrupt' ? resetUnreadableLabels() : loadLabels())}>{labelsState.reason === 'corrupt' ? 'Back up and reset labels' : 'Retry browser storage'}</button></div>}
    <div className="label-workspace">
      <CameraFrameView key={`${camera.id}/${frame.image}`} camera={camera} frame={frame} selectedAreaId={area.id} onImageReady={setReadyFrame} />
      <section className="label-panel" aria-label="Area label">
        {savedNotice ? <div className="verified-label" role="status"><span aria-hidden="true">✓</span><h2>{savedNotice}</h2><p>Stock level: {saved?.stock} · {saved?.compliant ? 'Right product' : 'Wrong product'}</p><button className="label-save" onClick={onClose}>Back</button><button className="label-skip" onClick={() => setSavedNotice('')}>Edit label</button></div> : <LabelForm key={`${camera.id}/${frame.image}/${area.id}`} area={area} saved={saved} canLabel={!outside && readyFrame === frame.url && labelsState.status === 'ready'} outside={outside} onSave={save} onClose={onClose} />}
        {saveError && <p className="label-warning" role="alert">{saveError}</p>}
      </section>
    </div>
    <div className="label-footer"><p>Labels are saved in this browser. Verifying a label does not mark a Task as done.</p><button className="label-export" disabled={!labels.length} onClick={() => exportLabels(labels)}>Export labels</button></div>
  </div>
}

export function VerifyLabelDialog({ target, state, onRetry, onClose }: { target: LabelTarget; state: LabellingState; onRetry: () => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog ref={dialogRef} className="area-dialog verification-dialog" onCancel={onClose} aria-labelledby="verification-title">
    <div className="dialog-heading"><h1 id="verification-title">Verify label</h1><button onClick={onClose} aria-label="Close label verification">×</button></div>
    <LabelVerification target={target} state={state} onRetry={onRetry} onClose={onClose} />
  </dialog>
}
