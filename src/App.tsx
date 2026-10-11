import { isUnsure } from './confidence'
import { useEffect, useState } from 'react'
import { taskGroups, type Task } from './tasks'
import { Icon } from './Icon'
import { CameraDialog, StoreOverview, StoreStatus, type CameraSelection } from './StoreOverview'
import { formatTime } from './time'
import { VerifyLabelDialog } from './VerifyLabelDialog'
import type { LabelTarget } from './labelling'
import type { CameraState, StoreSnapshot } from './store'
import { useStoreData } from './useStoreData'
import { useTaskCompletion, type CompletionNotice } from './useTaskCompletion'

function Confidence({ task }: { task: Task }) {
  return isUnsure(task.confidence)
    ? <span className="confidence">Unsure{task.confidence === null ? '' : ` · ${Math.round(task.confidence * 100)}%`}</span>
    : null
}

function TaskCard({ task, index, onComplete, onSelect, onVerify }: { task: Task; index: number; onComplete: (task: Task) => void; onSelect: (task: Task) => void; onVerify: (task: Task) => void }) {
  return <li className="task-card">
    <button className="task-details" onClick={() => onSelect(task)} aria-label={`View ${task.product}, Camera ${task.camera}, Area ${task.area_id}`}>
      <span className="task-number">{index + 1}</span>
      <span className="task-copy">
        <span className="product-name">{task.product}</span>
        {task.kind === 'move-product' && <span className="detected-product">{task.detectedProduct ? <>Shelf shows <strong>{task.detectedProduct}</strong></> : 'Shelf shows another product'}</span>}
        <span className="task-location">{task.location} · Camera {task.camera} · Area {task.area_id}</span>
        <span className="task-time">since <time>{formatTime(task.since)}</time> <Confidence task={task} /></span>
      </span>
      <Icon name="chevron" className="task-chevron" />
    </button>
    <button className="verify-task" onClick={() => onVerify(task)}><Icon name="eye" />Verify label</button>
    <button className="complete-task" onClick={() => onComplete(task)}><Icon name="check" />Mark as done</button>
  </li>
}

function TaskBoard({ state, hiddenTaskIds, onComplete, onSelect, onVerify }: { state: StoreSnapshot; hiddenTaskIds: ReadonlySet<string>; onComplete: (task: Task) => void; onSelect: (task: Task) => void; onVerify: (task: Task) => void }) {
  const tasks = state.tasks.filter(task => !hiddenTaskIds.has(task.id))
  const groups = taskGroups.map(group => ({ ...group, tasks: tasks.filter(task => task.kind === group.kind) })).filter(group => group.tasks.length > 0)
  return <>
    <div className="board-heading">
      <h1 className="page-title">{tasks.length === 0 ? 'All caught up' : `${tasks.length} to do`}</h1>
      <span className="healthy-areas"><Icon name="check" />{state.counts.ok} areas OK</span>
    </div>
    {state.counts.unavailable > 0 && <p role="status">Some Areas are unavailable at the selected time. Open Store for details.</p>}
    {groups.length === 0 ? <div className="empty-group"><Icon name="check" /><p>Nothing to do at this time</p></div>
      : <div className="grid grid-cols-3 items-start gap-5 max-[1100px]:gap-3.5 max-[800px]:grid-cols-1 max-[800px]:gap-[22px]">
        {groups.map(group => <section className={`task-group ${group.kind}`} key={group.kind} aria-labelledby={`${group.kind}-heading`}>
          <div className="group-heading">
            <span className="group-icon"><Icon name={group.kind} /></span>
            <div className="group-copy"><h2 id={`${group.kind}-heading`}>{group.title}</h2><p>{group.description}</p></div>
            <span className="group-count" aria-label={`${group.tasks.length} tasks`}>{group.tasks.length}</span>
          </div>
          <ol className="task-list">{group.tasks.map((task, index) => <TaskCard key={task.id} task={task} index={index} onComplete={onComplete} onSelect={onSelect} onVerify={onVerify} />)}</ol>
        </section>)}
      </div>}
  </>
}

function CompletionToast({ notice, onUndo, onDismiss }: { notice: CompletionNotice; onUndo: () => void; onDismiss: () => void }) {
  if (notice.status === 'none') return null
  if (notice.status === 'failed') return <div className="completion-toast" role="alert"><span>Could not save {notice.task.product} as done. It is back in the list.</span><button onClick={onDismiss}>Dismiss</button></div>
  return <div className="completion-toast"><span><Icon name="check" />{notice.task.product} marked as done</span><button onClick={onUndo}>Undo</button></div>
}

type Overlay =
  | { kind: 'closed' }
  | { kind: 'camera'; selection: CameraSelection }
  | { kind: 'verification'; target: LabelTarget; returnTo: CameraSelection | null }

function readView(): 'tasks' | 'store' {
  return window.location.hash === '#store' ? 'store' : 'tasks'
}

function App() {
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [view, setView] = useState<'tasks' | 'store'>(readView)
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'closed' })
  const { store, timeline, now, updating, retry } = useStoreData(selectedTime)
  const completion = useTaskCompletion()
  useEffect(() => {
    function syncView() { setView(readView()); setOverlay({ kind: 'closed' }) }
    window.addEventListener('hashchange', syncView)
    return () => window.removeEventListener('hashchange', syncView)
  }, [])
  const findCamera = (cameraId: string) => store.status === 'ready' ? store.cameras.find(camera => camera.id === cameraId) : undefined
  const selectedCamera = overlay.kind === 'camera' ? findCamera(overlay.selection.cameraId) : undefined
  const progress = timeline && timeline.end > timeline.start ? (now - timeline.start) / (timeline.end - timeline.start) * 100 : 0

  function selectTask(task: Task) { setOverlay({ kind: 'camera', selection: { cameraId: task.camera, areaId: task.area_id, origin: 'tasks' } }) }
  function selectCamera(camera: CameraState) { setOverlay({ kind: 'camera', selection: { cameraId: camera.id, origin: 'store' } }) }
  function verifyTask(task: Task) { setOverlay({ kind: 'verification', target: { cameraId: task.camera, areaId: task.area_id }, returnTo: null }) }
  function verifyArea(camera: CameraState, areaId: string) {
    setOverlay({ kind: 'verification', target: { cameraId: camera.id, areaId }, returnTo: overlay.kind === 'camera' ? overlay.selection : null })
  }
  function closeVerification() {
    setOverlay(overlay.kind === 'verification' && overlay.returnTo ? { kind: 'camera', selection: overlay.returnTo } : { kind: 'closed' })
  }

  return <>
    <header className="site-header">
      <a className="brand" href="#tasks" aria-label="Fresh Eyes home"><Icon name="eye" /><span>Fresh Eyes</span></a>
      <nav className="main-navigation" aria-label="Main navigation">
        <a className={`nav-item${view === 'tasks' ? ' active' : ''}`} href="#tasks" aria-current={view === 'tasks' ? 'page' : undefined}>Tasks</a>
        <a className={`nav-item${view === 'store' ? ' active' : ''}`} href="#store" aria-current={view === 'store' ? 'page' : undefined}>Store</a>
      </nav>
      <span className="store-name">Fruit & Vegetables</span>
    </header>
    {timeline && <section className="time-bar" aria-label="Frame timeline">
      <label className="current-time" htmlFor="timeline"><span>Now</span><output htmlFor="timeline">{formatTime(now)}</output></label>
      <div className="timeline-control">
        <input className="timeline-slider" id="timeline" type="range" min={timeline.start} max={timeline.end} step="1" value={now} onChange={event => setSelectedTime(Number(event.target.value))} aria-valuetext={formatTime(now)} style={{ background: `linear-gradient(to right, var(--ink) ${progress}%, var(--timeline-track) ${progress}%)` }} />
        <div className="timeline-labels"><span>{formatTime(timeline.start)}</span><span>{updating ? <span role="status">Updating…</span> : null}</span><span>{formatTime(timeline.end)}</span></div>
      </div>
      <button className="jump-latest" onClick={() => setSelectedTime(timeline.end)}>Jump to latest</button>
    </section>}
    <main id={view} className="app-page">
      {store.status !== 'ready' ? <StoreStatus state={store} onRetry={retry} />
        : view === 'store' ? <StoreOverview state={store} onSelect={selectCamera} onRetry={retry} />
          : <TaskBoard state={store} hiddenTaskIds={completion.hiddenTaskIds} onComplete={completion.complete} onSelect={selectTask} onVerify={verifyTask} />}
      <p className="demo-note">Predictions from the latest completed analysis run · Labels saved in this browser</p>
    </main>
    <div className="sr-only" role="status" aria-atomic="true">{completion.notice.status === 'undoable' ? `${completion.notice.task.product} marked as done` : ''}</div>
    <CompletionToast notice={completion.notice} onUndo={completion.undo} onDismiss={completion.dismiss} />
    {overlay.kind === 'camera' && selectedCamera && <CameraDialog camera={selectedCamera} selectedAreaId={overlay.selection.areaId} origin={overlay.selection.origin} onVerify={areaId => verifyArea(selectedCamera, areaId)} onClose={() => setOverlay({ kind: 'closed' })} />}
    {overlay.kind === 'verification' && <VerifyLabelDialog target={overlay.target} camera={findCamera(overlay.target.cameraId)} onClose={closeVerification} />}
  </>
}

export default App
