import { useEffect, useRef, useState } from 'react'
import { markTaskDone } from './api.ts'
import type { Task } from './tasks.ts'

export type CompletionNotice = { status: 'none' } | { status: 'undoable'; task: Task } | { status: 'failed'; task: Task }

const undoWindowMilliseconds = 5000

/** Hides a Task as soon as it is marked done and saves it to the API once the undo window closes. */
export function useTaskCompletion() {
  const [hiddenTaskIds, setHiddenTaskIds] = useState<ReadonlySet<string>>(() => new Set())
  const [notice, setNotice] = useState<CompletionNotice>({ status: 'none' })
  const pending = useRef<{ task: Task; timer: ReturnType<typeof setTimeout> } | null>(null)

  function setHidden(taskId: string, hidden: boolean) {
    setHiddenTaskIds(previous => {
      const next = new Set(previous)
      if (hidden) next.add(taskId)
      else next.delete(taskId)
      return next
    })
  }

  function save() {
    const current = pending.current
    if (!current) return
    clearTimeout(current.timer)
    pending.current = null
    const { task } = current
    setNotice(previous => previous.status === 'undoable' && previous.task.id === task.id ? { status: 'none' } : previous)
    markTaskDone(task).catch(() => {
      setHidden(task.id, false)
      setNotice({ status: 'failed', task })
    })
  }

  useEffect(() => {
    window.addEventListener('pagehide', save)
    return () => window.removeEventListener('pagehide', save)
  })

  function complete(task: Task) {
    save()
    setHidden(task.id, true)
    setNotice({ status: 'undoable', task })
    pending.current = { task, timer: setTimeout(save, undoWindowMilliseconds) }
  }

  function undo() {
    const current = pending.current
    if (!current) return
    clearTimeout(current.timer)
    pending.current = null
    setHidden(current.task.id, false)
    setNotice({ status: 'none' })
  }

  function dismiss() { setNotice({ status: 'none' }) }

  return { hiddenTaskIds, notice, complete, undo, dismiss }
}
