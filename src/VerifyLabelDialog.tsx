import { useEffect, useRef, useState } from 'react'
import type { StockLevel } from './tasks'
import { formatTime } from './time'
import { CameraFrameView } from './CameraFrameView'
import { extendsOutsideFrame, type PlanogramArea } from './camera'
import type { CameraState } from './store'
import { exportLabels, loadLabels, saveLabels, resetUnreadableLabels, type LabelTarget, type SavedLabel } from './labelling'

function LabelForm({ area, saved, canLabel, outside, onSave, onClose }: { area: PlanogramArea; saved: SavedLabel | undefined; canLabel: boolean; outside: boolean; onSave: (stock: StockLevel, compliant: boolean) => void; onClose: () => void }) {
  const [stock, setStock] = useState<StockLevel | null>(saved?.stock ?? null)
  const [compliant, setCompliant] = useState<boolean | null>(saved?.compliant ?? null)
  return <form onSubmit={event => { event.preventDefault(); if (stock !== null && compliant !== null && canLabel) onSave(stock, compliant) }}>
    <h2>Planogram expects {area.productName}</h2>
    {outside && <p className="label-warning" role="status">This Area extends beyond the Frame. Verification is unavailable because it is not fully visible.</p>}
    {saved && <p className="label-hint">Your saved label is selected. Confirm it or change your answers.</p>}
    <fieldset disabled={!canLabel}><legend>How full is it?</legend><div className="label-options stock-options grid grid-cols-3 gap-2.5">
      {(['empty', 'half', 'full'] as const).map(level => <label key={level} className={stock === level ? 'chosen' : ''}><input type="radio" name="stock" required checked={stock === level} onChange={() => setStock(level)} />{level[0].toUpperCase() + level.slice(1)}</label>)}
    </div></fieldset>
    <fieldset disabled={!canLabel}><legend>Is it the right product?</legend><div className="label-options grid grid-cols-2 gap-2.5">
      <label className={compliant === true ? 'chosen' : ''}><input type="radio" name="compliance" required checked={compliant === true} onChange={() => setCompliant(true)} />Right product</label>
      <label className={compliant === false ? 'chosen' : ''}><input type="radio" name="compliance" required checked={compliant === false} onChange={() => setCompliant(false)} />Wrong product</label>
    </div></fieldset>
    <p className="label-hint">Verify what you see in the highlighted Area. Predictions stay hidden so they cannot sway you.</p>
    <button className="label-save" type="submit" disabled={!canLabel || stock === null || compliant === null}>{saved ? 'Confirm label' : 'Save verified label'}</button>
    <button className="label-skip" type="button" onClick={onClose}>Cancel</button>
  </form>
}

function LabelVerification({ target, camera, onClose }: { target: LabelTarget; camera: CameraState | undefined; onClose: () => void }) {
  const [labelsState, setLabelsState] = useState(loadLabels)
  const [saveError, setSaveError] = useState('')
  const [readyFrame, setReadyFrame] = useState('')
  const [savedNotice, setSavedNotice] = useState('')
  if (!camera) return <p className="board-message">Camera {target.cameraId} is unavailable for verification.</p>
  if (camera.frame.status === 'missing') return <p className="board-message">No Frame at or before Now. Choose a later time and reopen verification.</p>
  if (camera.frame.status === 'failed') return <p className="board-message">Camera {camera.id} could not be loaded. Close this view and try again.</p>
  if (camera.frame.status === 'unreadable') return <p className="board-message">Frame {camera.frame.image} is unreadable, so it cannot be verified.</p>
  const frame = camera.frame.frame
  const area = camera.areas.find(area => area.id === target.areaId)
  if (!area) return <p className="board-message">Area {target.areaId} is missing from the Planogram. Verification is unavailable.</p>
  const labels = labelsState.status === 'ready' ? labelsState.labels : []
  const saved = labels.find(label => label.camera === camera.id && label.image === frame.image && label.areaId === area.id)
  const outside = extendsOutsideFrame(area, frame)

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
    <div className="grid grid-cols-[minmax(0,2.6fr)_minmax(340px,1fr)] items-start gap-[22px] max-[1100px]:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)] max-[1100px]:gap-4 max-[800px]:grid-cols-1">
      <CameraFrameView key={`${camera.id}/${frame.image}`} cameraId={camera.id} frame={frame} areas={camera.areas} showPredictions={false} selectedAreaId={area.id} onImageReady={setReadyFrame} />
      <section className="label-panel" aria-label="Area label">
        {savedNotice ? <div className="verified-label" role="status"><span aria-hidden="true">✓</span><h2>{savedNotice}</h2><p>Stock level: {saved?.stock} · {saved?.compliant ? 'Right product' : 'Wrong product'}</p><button className="label-save" onClick={onClose}>Back</button><button className="label-skip" onClick={() => setSavedNotice('')}>Edit label</button></div> : <LabelForm key={`${camera.id}/${frame.image}/${area.id}`} area={area} saved={saved} canLabel={!outside && readyFrame === frame.url && labelsState.status === 'ready'} outside={outside} onSave={save} onClose={onClose} />}
        {saveError && <p className="label-warning" role="alert">{saveError}</p>}
      </section>
    </div>
    <div className="label-footer"><p>Labels are saved in this browser. Verifying a label does not mark a Task as done.</p><button className="label-export" disabled={!labels.length} onClick={() => exportLabels(labels)}>Export labels</button></div>
  </div>
}

export function VerifyLabelDialog({ target, camera, onClose }: { target: LabelTarget; camera: CameraState | undefined; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog ref={dialogRef} className="area-dialog verification-dialog" onCancel={onClose} aria-labelledby="verification-title">
    <div className="dialog-heading"><h1 className="page-title" id="verification-title">Verify label</h1><button onClick={onClose} aria-label="Close label verification">×</button></div>
    <LabelVerification target={target} camera={camera} onClose={onClose} />
  </dialog>
}
