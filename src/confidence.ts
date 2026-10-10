export const lowConfidenceThreshold = 0.7

export function isUnsure(confidence: number | null): boolean {
  return confidence === null || confidence < lowConfidenceThreshold
}
