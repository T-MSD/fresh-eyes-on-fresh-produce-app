import { useEffect, useRef, useState } from 'react'
import { markTaskDone } from './api.ts'
import type { Task } from './tasks.ts'

export type CompletionNotice = { status: 'none' } | { status: 'undoable'; task: Task } | { status: 'failed'; task: Task }

const undoWindowMilliseconds = 5000

/** Hides a Task as soon as it is marked done and saves it to the API once its own undo window closes. */
export function useTaskCompletion() {
  const [hiddenTaskIds, setHiddenTaskIds] = useState<ReadonlySet<string>>(() => new Set())
  const [pendingTasks, setPendingTasks] = useState<Task[]>([])
  const [failedTask, setFailedTask] = useState<Task | null>(null)
  const timers = useRef(new Map<string, { task: Task; timer: ReturnType<typeof setTimeout> }>())

  function setHidden(taskId: string, hidden: boolean) {
    setHiddenTaskIds(previous => {
      const next = new Set(previous)
      if (hidden) next.add(taskId)
      else next.delete(taskId)
      return next
    })
  }

  function takePending(taskId: string): Task | null {
    const entry = timers.current.get(taskId)
    if (!entry) return null
    clearTimeout(entry.timer)
    timers.current.delete(taskId)
    setPendingTasks(previous => previous.filter(task => task.id !== taskId))
    return entry.task
  }

  function save(taskId: string) {
    const task = takePending(taskId)
    if (!task) return
    markTaskDone(task).catch(() => {
      setHidden(task.id, false)
      setFailedTask(task)
    })
  }

  useEffect(() => {
    function saveAll() { for (const taskId of [...timers.current.keys()]) save(taskId) }
    window.addEventListener('pagehide', saveAll)
    return () => window.removeEventListener('pagehide', saveAll)
  })

  function complete(task: Task) {
    if (timers.current.has(task.id)) return
    setHidden(task.id, true)
    setFailedTask(null)
    setPendingTasks(previous => [...previous, task])
    timers.current.set(task.id, { task, timer: setTimeout(() => save(task.id), undoWindowMilliseconds) })
  }

  function undo(task: Task) {
    if (takePending(task.id)) setHidden(task.id, false)
  }

  function dismiss() { setFailedTask(null) }

  const lastPending = pendingTasks.at(-1)
  const notice: CompletionNotice = failedTask ? { status: 'failed', task: failedTask } : lastPending ? { status: 'undoable', task: lastPending } : { status: 'none' }

  return { hiddenTaskIds, notice, complete, undo, dismiss }
}
