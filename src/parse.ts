export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected an object')
  return Object.fromEntries(Object.entries(value))
}

export function string(value: unknown): string {
  if (typeof value !== 'string' || !value.length) throw new Error('Expected a non-empty string')
  return value
}

export function nullableString(value: unknown): string | null {
  return value === null ? null : string(value)
}

export function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Expected a finite number')
  return value
}

export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected an array')
  return value
}
