import { useEffect, useState } from 'react'
import { taskGroups, type Task, type TaskKind, type TasksState } from './tasks'

import { CameraDialog, StoreOverview, type CameraSelection } from './StoreOverview'
import { formatTime, getTimeline } from './time'
import { VerifyLabelDialog } from './VerifyLabelDialog'
import type { LabelTarget } from './labelling'
import { useLabellingDataset } from './useLabellingDataset'
import { getDemoStoreSnapshot, type CameraState } from './store'

function Icon({ name, className = '' }: { name: 'eye' | 'check' | 'chevron' | TaskKind; className?: string }) {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'eye' && <><path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8S2 12 2 12Z" /><circle cx="12" cy="12" r="3.5" /></>}
    {name === 'check' && <path d="m5 12 4 4L19 6" />}
    {name === 'chevron' && <path d="m9 6 6 6-6 6" />}
    {name === 'restock' && <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="m6 20 12-16" /></>}
    {name === 'move-product' && <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3h.01" /></>}
    {name === 'top-up' && <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M5 11h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" fill="currentColor" /></>}
  </svg>
}

function Confidence({ task }: { task: Task }) {
  return (task.confidence === null || task.confidence < 0.7)
    ? <span className="confidence">Unsure{task.confidence === null ? '' : ` · ${Math.round(task.confidence * 100)}%`}</span>
    : null
}

function TaskCard({ task, index, onComplete, onSelect, onVerify }: { task: Task; index: number; onComplete: (task: Task) => void; onSelect: (task: Task) => void; onVerify: (task: Task) => void }) {
  return <li className="task-card">
    <button className="task-details" onClick={() => onSelect(task)} aria-label={`View ${task.product}, Camera ${task.camera}, Area ${task.area_id}`}>
      <span className="task-number">{index + 1}</span>
      <span className="task-copy">
        <span className="product-name">{task.product}</span>
        {task.detectedProduct && <span className="detected-product">Shelf shows <strong>{task.detectedProduct}</strong></span>}
        <span className="task-location">{task.location} · Camera {task.camera} · Area {task.area_id}</span>
        <span className="task-time">since <time>{formatTime(task.since)}</time> <Confidence task={task} /></span>
      </span>
      <Icon name="chevron" className="task-chevron" />
    </button>
    <button className="verify-task" onClick={() => onVerify(task)}><Icon name="eye" />Verify label</button>
    <button className="complete-task" onClick={() => onComplete(task)}><Icon name="check" />Mark as done</button>
  </li>
}

function TaskBoard({ state, completed, onComplete, onSelect, onVerify }: { state: TasksState; completed: Set<string>; onComplete: (task: Task) => void; onSelect: (task: Task) => void; onVerify: (task: Task) => void }) {
  if (state.status === 'loading') return <p className="board-message" role="status">Loading area predictions…</p>
  if (state.status === 'error') return <p className="board-message" role="alert">{state.message}</p>
  const tasks = state.tasks.filter(task => !completed.has(task.id))
  return <>
    <div className="board-heading">
      <h1>{tasks.length === 0 ? 'All caught up' : `${tasks.length} to do`}</h1>
      <span className="healthy-areas"><Icon name="check" />{state.healthyAreas} areas OK</span>
    </div>
    {state.unavailableAreas > 0 && <p role="status">Some Areas are unavailable at the selected time. Open Store for details.</p>}
    <div className="task-board">
      {taskGroups.map(group => {
        const groupTasks = tasks.filter(task => task.kind === group.kind)
        return <section className={`task-group ${group.kind}`} key={group.kind} aria-labelledby={`${group.kind}-heading`}>
          <div className="group-heading">
            <span className="group-icon"><Icon name={group.kind} /></span>
            <div className="group-copy"><h2 id={`${group.kind}-heading`}>{group.title}</h2><p>{group.description}</p></div>
            <span className="group-count" aria-label={`${groupTasks.length} tasks`}>{groupTasks.length}</span>
          </div>
          {groupTasks.length > 0 ? <ol>{groupTasks.map((task, index) => <TaskCard key={task.id} task={task} index={index} onComplete={onComplete} onSelect={onSelect} onVerify={onVerify} />)}</ol>
            : <div className="empty-group"><Icon name="check" /><p>No tasks here</p></div>}
        </section>
      })}
    </div>
  </>
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
  const [completed, setCompleted] = useState<Set<string>>(() => new Set())
  const [lastCompleted, setLastCompleted] = useState<Task | null>(null)
  const [view, setView] = useState<'tasks' | 'store'>(readView)
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'closed' })
  const labellingDataset = useLabellingDataset()
  useEffect(() => {
    function syncView() { setView(readView()); setOverlay({ kind: 'closed' }) }
    window.addEventListener('hashchange', syncView)
    return () => window.removeEventListener('hashchange', syncView)
  }, [])
  const timeline = labellingDataset.state.status === 'ready' ? getTimeline(labellingDataset.state.cameras.flatMap(camera => camera.frames.map(frame => frame.ts))) : null
  const now = selectedTime ?? timeline?.initial ?? 0
  const storeState = getDemoStoreSnapshot(now, labellingDataset.state)
  const state: TasksState = storeState.status === 'ready' ? { status: 'ready', tasks: storeState.tasks, healthyAreas: storeState.counts.ok, unavailableAreas: storeState.counts.unavailable } : storeState
  const selectedCamera = overlay.kind === 'camera' && storeState.status === 'ready' ? storeState.cameras.find(camera => camera.id === overlay.selection.cameraId) : undefined
  const progress = timeline && timeline.end > timeline.start ? (now - timeline.start) / (timeline.end - timeline.start) * 100 : 0

  function selectTask(task: Task) { setOverlay({ kind: 'camera', selection: { cameraId: task.camera, areaId: task.area_id, origin: 'tasks' } }) }
  function selectCamera(camera: CameraState) { setOverlay({ kind: 'camera', selection: { cameraId: camera.id, origin: 'store' } }) }
  function verifyTask(task: Task) { setOverlay({ kind: 'verification', target: { cameraId: task.camera, areaId: task.area_id, now }, returnTo: null }) }
  function verifyArea(camera: CameraState, areaId: string) {
    setOverlay({ kind: 'verification', target: { cameraId: camera.id, areaId, now }, returnTo: overlay.kind === 'camera' ? overlay.selection : null })
  }
  function closeVerification() {
    setOverlay(overlay.kind === 'verification' && overlay.returnTo ? { kind: 'camera', selection: overlay.returnTo } : { kind: 'closed' })
  }
  function completeTask(task: Task) {
    setCompleted(previous => new Set([...previous, task.id]))
    setLastCompleted(task)
  }
  function undoCompletion() {
    if (!lastCompleted) return
    setCompleted(previous => {
      const next = new Set(previous)
      next.delete(lastCompleted.id)
      return next
    })
    setLastCompleted(null)
  }

  return <>
    <header className="site-header">
      <a className="brand" href="#tasks" aria-label="Fresh Eyes home"><Icon name="eye" /><span>Fresh Eyes</span></a>
      <nav aria-label="Main navigation">
        <a className={`nav-item${view === 'tasks' ? ' active' : ''}`} href="#tasks" aria-current={view === 'tasks' ? 'page' : undefined}>Tasks</a>
        <a className={`nav-item${view === 'store' ? ' active' : ''}`} href="#store" aria-current={view === 'store' ? 'page' : undefined}>Store</a>
      </nav>
      <span className="store-name">Frutas e Legumes</span>
    </header>
    {timeline && <section className="time-bar" aria-label="Frame timeline">
      <label className="current-time" htmlFor="timeline"><span>Now</span><output htmlFor="timeline">{formatTime(now)}</output></label>
      <div className="timeline-control">
        <input id="timeline" type="range" min={timeline.start} max={timeline.end} step="1" value={now} onChange={event => setSelectedTime(Number(event.target.value))} aria-valuetext={formatTime(now)} style={{ background: `linear-gradient(to right, var(--ink) ${progress}%, #ededed ${progress}%)` }} />
        <div className="timeline-labels"><span>{formatTime(timeline.start)}</span><span>{formatTime(timeline.end)}</span></div>
      </div>
      <button className="jump-latest" onClick={() => setSelectedTime(timeline.end)}>Jump to latest</button>
    </section>}
    <main id={view}>
      {view === 'store' ? <StoreOverview state={storeState} onSelect={selectCamera} /> : <TaskBoard state={state} completed={completed} onComplete={completeTask} onSelect={selectTask} onVerify={verifyTask} />}
      {labellingDataset.state.status === 'error' && <button className="dialog-close" onClick={labellingDataset.retry}>Retry loading Frames and Planogram</button>}
      {labellingDataset.state.status === 'ready' && !timeline && <p role="status">No Frames available. Add dataset Frames to show a timeline.</p>}
      <p className="demo-note">Design preview · Demo predictions · Labels saved in this browser · Task completion saved for this session</p>
    </main>
    {lastCompleted && <div className="completion-toast" role="status"><span><Icon name="check" />{lastCompleted.product} marked as done</span><button onClick={undoCompletion}>Undo</button></div>}
    {overlay.kind === 'camera' && selectedCamera && <CameraDialog camera={selectedCamera} selectedAreaId={overlay.selection.areaId} origin={overlay.selection.origin} onVerify={areaId => verifyArea(selectedCamera, areaId)} onClose={() => setOverlay({ kind: 'closed' })} />}
    {overlay.kind === 'verification' && <VerifyLabelDialog target={overlay.target} state={labellingDataset.state} onRetry={labellingDataset.retry} onClose={closeVerification} />}
  </>
}

export default App
