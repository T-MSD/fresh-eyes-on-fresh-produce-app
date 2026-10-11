import { isUnsure } from './confidence'
import { useEffect, useState } from 'react'
import { taskGroups, type Task } from './tasks'
import { Icon } from './Icon'
import { StoreOverview, StoreStatus } from './StoreOverview'
import { CameraPage, type CameraOrigin } from './CameraPage'
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
        <span className="task-location">Camera {task.camera} · Area {task.area_id}</span>
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

function CompletionToast({ notice, onUndo, onDismiss }: { notice: CompletionNotice; onUndo: (task: Task) => void; onDismiss: () => void }) {
  if (notice.status === 'none') return null
  if (notice.status === 'failed') return <div className="completion-toast" role="alert"><span>Could not save {notice.task.product} as done. It is back in the list.</span><button onClick={onDismiss}>Dismiss</button></div>
  const { task } = notice
  return <div className="completion-toast"><span><Icon name="check" />{task.product} marked as done</span><button onClick={() => onUndo(task)}>Undo</button></div>
}

type Route = { view: 'tasks' } | { view: 'store' } | { view: 'camera'; cameraId: string; areaId: string | null }

function readRoute(): Route {
  const hash = window.location.hash.slice(1)
  if (hash === 'store') return { view: 'store' }
  const camera = hash.match(/^camera\/(\d+)(?:\/(\d+_\d+))?$/)
  if (camera) return { view: 'camera', cameraId: camera[1], areaId: camera[2] ?? null }
  return { view: 'tasks' }
}

function CameraRoute({ route, store, origin, now, hiddenTaskIds, onComplete, onVerify }: { route: Extract<Route, { view: 'camera' }>; store: StoreSnapshot; origin: CameraOrigin; now: number; hiddenTaskIds: ReadonlySet<string>; onComplete: (task: Task) => void; onVerify: (cameraId: string, areaId: string) => void }) {
  const camera = store.cameras.find(camera => camera.id === route.cameraId)
  if (!camera) return <div className="board-message" role="status"><p>Camera {route.cameraId} is not in the latest analysis run.</p><a className="dialog-close" href={`#${origin}`}>Back to {origin === 'tasks' ? 'Tasks' : 'Store'}</a></div>
  return <CameraPage key={`${camera.id}/${route.areaId}`} camera={camera} initialAreaId={route.areaId} origin={origin} now={now} hiddenTaskIds={hiddenTaskIds} onComplete={onComplete} onVerify={areaId => onVerify(camera.id, areaId)} />
}

function App() {
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [route, setRoute] = useState<Route>(readRoute)
  const [cameraOrigin, setCameraOrigin] = useState<CameraOrigin>('tasks')
  const [verification, setVerification] = useState<LabelTarget | null>(null)
  const { store, timeline, now, updating, retry } = useStoreData(selectedTime)
  const completion = useTaskCompletion()
  useEffect(() => {
    function syncRoute() { setRoute(readRoute()); setVerification(null); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])
  const findCamera = (cameraId: string) => store.status === 'ready' ? store.cameras.find(camera => camera.id === cameraId) : undefined
  const progress = timeline && timeline.end > timeline.start ? (now - timeline.start) / (timeline.end - timeline.start) * 100 : 0
  const activeTab = route.view === 'camera' ? cameraOrigin : route.view

  function openCamera(cameraId: string, areaId: string | null, origin: CameraOrigin) {
    setCameraOrigin(origin)
    window.location.hash = areaId ? `camera/${cameraId}/${areaId}` : `camera/${cameraId}`
  }
  function selectTask(task: Task) { openCamera(task.camera, task.area_id, 'tasks') }
  function selectCamera(camera: CameraState) { openCamera(camera.id, null, 'store') }
  function verifyTask(task: Task) { setVerification({ cameraId: task.camera, areaId: task.area_id }) }

  return <>
    <header className="site-header">
      <a className="brand" href="#tasks" aria-label="Fresh Eyes home"><Icon name="eye" /><span>Fresh Eyes</span></a>
      <nav className="main-navigation" aria-label="Main navigation">
        <a className={`nav-item${activeTab === 'tasks' ? ' active' : ''}`} href="#tasks" aria-current={route.view === 'tasks' ? 'page' : undefined}>Tasks</a>
        <a className={`nav-item${activeTab === 'store' ? ' active' : ''}`} href="#store" aria-current={route.view === 'store' ? 'page' : undefined}>Store</a>
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
    <main id={route.view} className="app-page">
      {store.status !== 'ready' ? <StoreStatus state={store} onRetry={retry} />
        : route.view === 'store' ? <StoreOverview state={store} onSelect={selectCamera} onRetry={retry} />
          : route.view === 'camera' ? <CameraRoute route={route} store={store} origin={cameraOrigin} now={now} hiddenTaskIds={completion.hiddenTaskIds} onComplete={completion.complete} onVerify={(cameraId, areaId) => setVerification({ cameraId, areaId })} />
            : <TaskBoard state={store} hiddenTaskIds={completion.hiddenTaskIds} onComplete={completion.complete} onSelect={selectTask} onVerify={verifyTask} />}
      <p className="demo-note">Predictions from the latest completed analysis run · Labels saved in this browser</p>
    </main>
    <div className="sr-only" role="status" aria-atomic="true">{completion.notice.status === 'undoable' ? `${completion.notice.task.product} marked as done` : ''}</div>
    <CompletionToast notice={completion.notice} onUndo={completion.undo} onDismiss={completion.dismiss} />
    {verification && <VerifyLabelDialog target={verification} camera={findCamera(verification.cameraId)} onClose={() => setVerification(null)} />}
  </>
}

export default App
