export const storeTimeZone = 'Europe/Lisbon'

const storeClock = new Intl.DateTimeFormat('en-GB', { timeZone: storeTimeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export function formatTime(ts: number): string {
  return storeClock.format(new Date(ts * 1000))
}

export type Timeline = { start: number; end: number; initial: number }

export function getTimeline(timestamps: number[]): Timeline | null {
  if (!timestamps.length) return null
  const sorted = [...timestamps].sort((left, right) => left - right)
  const start = sorted[0], end = sorted[sorted.length - 1]
  return { start, end, initial: sorted[Math.floor(sorted.length * 0.65)] }
}
