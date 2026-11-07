import type { AssessmentSettings } from './assessmentService'
import { savedReportScoreMetrics, type SavedScoringResult, type ScoringScheme } from './scoringSchemes'

export type PassingBenchmark = { scheme: ScoringScheme; value: number }
export const benchmarkRange = (scheme: ScoringScheme) =>
  scheme === 'act' ? { min: 1, max: 36, unit: '/36 (practice)' } :
    scheme === 'sat' || scheme === 'est' ? { min: 0, max: 800, unit: '/800 (practice)' } :
      { min: 0, max: 100, unit: '%' }

export function resolvePassingBenchmark(settings: AssessmentSettings | undefined): PassingBenchmark | null {
  if (!settings) return null
  const scheme = settings.scoring?.scheme ?? 'standard'
  const configured = settings.passingBenchmark
  if (configured) {
    if (configured.scheme !== scheme) return null // previous scheme's benchmark is not applicable
    const range = benchmarkRange(scheme)
    return Number.isFinite(configured.value) && configured.value >= range.min && configured.value <= range.max &&
      (scheme === 'standard' || Number.isInteger(configured.value)) ? configured : null
  }
  // Backward compatibility for historic Standard assessments only.
  const value = settings.passingPercentage
  return scheme === 'standard' && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? { scheme, value } : null
}

export function benchmarkScore(scheme: ScoringScheme, percentage: number | null, saved: SavedScoringResult | null): number | null {
  if (scheme === 'standard') return percentage !== null && Number.isFinite(percentage) ? percentage : null
  if (!saved || saved.scheme !== scheme) return null
  const result = savedReportScoreMetrics(saved)
  return result.practiceScaledScore
}
export function benchmarkLabel(benchmark: PassingBenchmark | null, scheme: ScoringScheme): string {
  return benchmark ? `${benchmark.value}${benchmarkRange(scheme).unit === '%' ? '%' : ' ' + benchmarkRange(scheme).unit}` : 'Not configured'
}
