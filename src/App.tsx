import { useEffect, useRef, useState } from 'react'
import { formatTime, getDemoSnapshot, taskGroups, timeline, type Task, type TaskKind, type TasksState } from './tasks'

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
  return task.confidence !== null && task.confidence < 0.7
    ? <span className="confidence">Unsure · {Math.round(task.confidence * 100)}%</span>
    : null
}

function TaskCard({ task, index, onComplete, onSelect }: { task: Task; index: number; onComplete: (task: Task) => void; onSelect: (task: Task) => void }) {
  return <li className="task-card">
    <button className="task-details" onClick={() => onSelect(task)} aria-label={`View ${task.product}, Camera ${task.camera}, Area ${task.area}`}>
      <span className="task-number">{index + 1}</span>
      <span className="task-copy">
        <span className="product-name">{task.product}</span>
        {task.detectedProduct && <span className="detected-product">Shelf shows <strong>{task.detectedProduct}</strong></span>}
        <span className="task-location">{task.location} · Camera {task.camera} · Area {task.area}</span>
        <span className="task-time">since <time>{formatTime(task.since)}</time> <Confidence task={task} /></span>
      </span>
      <Icon name="chevron" className="task-chevron" />
    </button>
    <button className="complete-task" onClick={() => onComplete(task)}><Icon name="check" />Mark as done</button>
  </li>
}

function TaskBoard({ state, completed, onComplete, onSelect }: { state: TasksState; completed: Set<string>; onComplete: (task: Task) => void; onSelect: (task: Task) => void }) {
  if (state.status === 'loading') return <p className="board-message" role="status">Loading area predictions…</p>
  if (state.status === 'error') return <p className="board-message" role="alert">{state.message}</p>
  const tasks = state.tasks.filter(task => !completed.has(task.id))
  return <>
    <div className="board-heading">
      <h1>{tasks.length === 0 ? 'All caught up' : `${tasks.length} to do`}</h1>
      <span className="healthy-areas"><Icon name="check" />{state.healthyAreas} areas OK</span>
    </div>
    {state.unavailableAreas > 0 && <p role="status">Some areas have no predictions yet. Their status is unavailable.</p>}
    <div className="task-board">
      {taskGroups.map(group => {
        const groupTasks = tasks.filter(task => task.kind === group.kind)
        return <section className={`task-group ${group.kind}`} key={group.kind} aria-labelledby={`${group.kind}-heading`}>
          <div className="group-heading">
            <span className="group-icon"><Icon name={group.kind} /></span>
            <div className="group-copy"><h2 id={`${group.kind}-heading`}>{group.title}</h2><p>{group.description}</p></div>
            <span className="group-count" aria-label={`${groupTasks.length} tasks`}>{groupTasks.length}</span>
          </div>
          {groupTasks.length > 0 ? <ol>{groupTasks.map((task, index) => <TaskCard key={task.id} task={task} index={index} onComplete={onComplete} onSelect={onSelect} />)}</ol>
            : <div className="empty-group"><Icon name="check" /><p>No tasks here</p></div>}
        </section>
      })}
    </div>
  </>
}

function TaskDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog ref={dialogRef} className="area-dialog" onCancel={onClose} aria-labelledby="area-dialog-title">
    <div className="dialog-heading"><span>Camera {task.camera} · Area {task.area}</span><button onClick={onClose} aria-label="Close task details">×</button></div>
    <h2 id="area-dialog-title">{task.product}</h2>
    <p>{task.location}</p>
    <div className={`dialog-action ${task.kind}`}><Icon name={task.kind} /><strong>{taskGroups.find(group => group.kind === task.kind)?.title}</strong></div>
    {task.detectedProduct && <p>Shelf shows <strong>{task.detectedProduct}</strong>.</p>}
    <p>Since {formatTime(task.since)} <Confidence task={task} /></p>
    <div className="frame-placeholder">Camera frame unavailable in this demo. The camera view will highlight this area once connected.</div>
    <button className="dialog-close" onClick={onClose}>Back to tasks</button>
  </dialog>
}

function App() {
  const [now, setNow] = useState(timeline.initial)
  const [completed, setCompleted] = useState<Set<string>>(() => new Set())
  const [lastCompleted, setLastCompleted] = useState<Task | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const state = getDemoSnapshot(now)
  const progress = (now - timeline.start) / (timeline.end - timeline.start) * 100

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
        <a className="nav-item active" href="#tasks" aria-current="page">Tasks</a>
        <button className="nav-item" disabled title="Store overview is coming next">Store</button>
        <button className="nav-item" disabled title="Labelling mode is coming next">Label</button>
      </nav>
      <span className="store-name">Frutas e Legumes</span>
    </header>
    <section className="time-bar" aria-label="Frame timeline">
      <label className="current-time" htmlFor="timeline"><span>Now</span><output htmlFor="timeline">{formatTime(now)}</output></label>
      <div className="timeline-control">
        <input id="timeline" type="range" min={timeline.start} max={timeline.end} value={now} onChange={event => setNow(Number(event.target.value))} aria-valuetext={formatTime(now)} style={{ background: `linear-gradient(to right, var(--ink) ${progress}%, #ededed ${progress}%)` }} />
        <div className="timeline-labels"><span>{formatTime(timeline.start)}</span><span>{formatTime(timeline.end)}</span></div>
      </div>
      <button className="jump-latest" onClick={() => setNow(timeline.end)}>Jump to latest</button>
    </section>
    <main id="tasks"><TaskBoard state={state} completed={completed} onComplete={completeTask} onSelect={setSelectedTask} /><p className="demo-note">Design preview · Demo data · Task completion is saved for this session only</p></main>
    {lastCompleted && <div className="completion-toast" role="status"><span><Icon name="check" />{lastCompleted.product} marked as done</span><button onClick={undoCompletion}>Undo</button></div>}
    {selectedTask && <TaskDialog task={selectedTask} onClose={() => setSelectedTask(null)} />}
  </>
}

export default App
