export const storeTimeZone = 'Europe/Lisbon'

const storeClock = new Intl.DateTimeFormat('en-GB', { timeZone: storeTimeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export function formatTime(ts: number): string {
  return storeClock.format(new Date(ts * 1000))
}
