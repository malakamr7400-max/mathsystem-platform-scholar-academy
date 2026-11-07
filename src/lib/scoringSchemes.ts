/** Step 59: saved per-assessment scoring settings. All authoritative values are calculated by Supabase. */
export type ScoringScheme = 'standard' | 'sat' | 'act' | 'est'
export type ScoringRole = 'math' | 'reading_writing' | 'english' | 'reading' | 'science' | 'other'
export interface ConversionPoint { raw: number; scaled: number }
export interface ScoringSectionConfig {
  sectionId: string
  role: ScoringRole
  minScaled: number
  maxScaled: number
  includeInComposite: boolean
  /** Exact raw-count lookup. A missing raw count produces no scaled score, never an invented interpolation. */
  conversionTable?: ConversionPoint[]
}
export interface AssessmentScoringConfig {
  scheme: ScoringScheme
  mode: 'default' | 'custom'
  sections: ScoringSectionConfig[]
}
export const defaultScoringConfig: AssessmentScoringConfig = { scheme: 'standard', mode: 'default', sections: [] }
export const scoringLabels: Record<ScoringScheme, string> = {
  standard: 'Standard — points and percentage', sat: 'SAT — raw + practice scaled estimate',
  act: 'ACT — raw + practice scaled estimate', est: 'EST — raw + practice scaled estimate',
}
export function suggestedRole(scheme: ScoringScheme, title: string): ScoringRole {
  const t = title.toLowerCase()
  if (/math|quantitative|algebra|geometry/.test(t)) return 'math'
  if (/science/.test(t)) return 'science'
  if (scheme === 'sat' || scheme === 'est') return /reading|writing|english|verbal|literacy/.test(t) ? 'reading_writing' : 'other'
  if (/english|grammar/.test(t)) return 'english'
  if (/reading/.test(t)) return 'reading'
  return 'other'
}
export function defaultScale(scheme: ScoringScheme): { min: number; max: number } {
  return scheme === 'act' ? { min: 1, max: 36 } : { min: 200, max: 800 }
}
export function scoringSectionDefaults(scheme: ScoringScheme, sectionId: string, title: string): ScoringSectionConfig {
  const role = suggestedRole(scheme, title)
  const { min, max } = defaultScale(scheme)
  return { sectionId, role, minScaled: min, maxScaled: max,
    includeInComposite: scheme === 'act' ? ['english','math','reading'].includes(role)
      : ['math','reading_writing'].includes(role), conversionTable: [] }
}
export function validateScoringConfig(config: AssessmentScoringConfig, sections: Array<{id: string; title: string; questions: unknown[]}>): string[] {
  const errors: string[] = []
  if (!['standard','sat','act','est'].includes(config.scheme)) errors.push('Choose a supported scoring scheme.')
  if (!['default','custom'].includes(config.mode)) errors.push('Choose default or custom mode.')
  if (config.scheme === 'standard' || config.mode === 'default') return errors
  const ids = new Set(sections.map(s => s.id))
  if (new Set(config.sections.map(s => s.sectionId)).size !== config.sections.length) errors.push('Duplicate section scoring configuration.')
  for (const s of config.sections) {
    if (!ids.has(s.sectionId)) errors.push('Scoring configuration references a removed section.')
    if (!Number.isInteger(s.minScaled) || !Number.isInteger(s.maxScaled) || s.minScaled < 0 || s.maxScaled !== defaultScale(config.scheme).max || s.minScaled >= s.maxScaled) errors.push(`Invalid scale for ${s.sectionId}. The score ceiling is fixed at ${defaultScale(config.scheme).max}.`)
    const points = s.conversionTable || []
    if (points.length > 1001) errors.push(`Too many conversion entries for ${s.sectionId}.`)
    const rawSeen = new Set<number>()
    let prevRaw = -1, prevScaled = -1
    for (const p of points) {
      if (!Number.isInteger(p.raw) || p.raw < 0 || !Number.isInteger(p.scaled) || p.scaled < s.minScaled || p.scaled > s.maxScaled || rawSeen.has(p.raw) || p.raw <= prevRaw || p.scaled < prevScaled) {
        errors.push(`Conversion table for ${s.sectionId} must have unique ascending raw counts and nondecreasing scaled scores.`); break
      }
      rawSeen.add(p.raw); prevRaw = p.raw; prevScaled = p.scaled
    }
    if (points.length) {
      const count = sections.find(x => x.id === s.sectionId)?.questions.length ?? 0
      if (count > 0 && (points.length !== count + 1 || points[0]?.raw !== 0 || points.at(-1)?.raw !== count)) errors.push(`Conversion table for ${s.sectionId} must cover every raw count from 0 to ${count}.`)
    }
  }
  return errors
}
export interface SavedSectionScore {
  section_id: string; section_title: string; role: ScoringRole
  raw_correct: number; raw_total: number; points_earned: number; points_possible: number
  scaled_score: number | null; scale_min: number; scale_max: number
  conversion_method: 'practice_linear_estimate' | 'custom_exact_table' | 'custom_linear_estimate' | 'not_available'
  include_in_composite: boolean
}
export interface SavedScoringResult {
  scheme: ScoringScheme; mode: 'default' | 'custom'; label: string
  raw_correct: number; raw_total: number; points_earned: number; points_possible: number; percentage: number
  sections: SavedSectionScore[]
  composite: number | null
  composite_label: string | null
  conversion_note: string
}
export function scoreSummaryLines(score: SavedScoringResult | null | undefined): string[] {
  if (!score) return []
  const lines = [`Scoring scheme: ${scoringLabels[score.scheme] || score.scheme} (${score.mode})`,
    `Raw score: ${score.raw_correct}/${score.raw_total} correct`,
    `Points: ${score.points_earned}/${score.points_possible} (${score.percentage}%)`]
  for (const section of score.sections || []) lines.push(`${section.section_title}: ${section.raw_correct}/${section.raw_total} raw; scaled ${section.scaled_score ?? 'N/A'} (${section.conversion_method.replaceAll('_',' ')})`)
  if (score.composite !== null) lines.push(`${score.composite_label || 'Composite'}: ${score.composite}`)
  lines.push(score.conversion_note)
  return lines
}

/** Student-facing presentation only. Raw counts stay saved for staff auditing.
 * SAT/EST use a /800 practice section-average (not the official /1600 total).
 * ACT uses the saved /36 composite where available, otherwise a section average.
 * Never substitute raw percentage when scaled data is missing. */
export interface StudentScoreDisplay {
  scheme: ScoringScheme
  label: string
  value: string
  maximum: number | null
  lines: string[]
  note: string | null
}
export function studentScoreDisplay(score: SavedScoringResult | null | undefined): StudentScoreDisplay | null {
  if (!score) return null
  if (score.scheme === 'standard') {
    return {
      scheme: 'standard', label: 'Overall Score',
      value: `${score.points_earned}/${score.points_possible} points (${score.percentage}%)`,
      maximum: null, lines: [], note: null,
    }
  }
  if (!['sat','act','est'].includes(score.scheme)) return null
  const maximum = score.scheme === 'act' ? 36 : 800
  const exam = score.scheme.toUpperCase()
  const sections = Array.isArray(score.sections) ? score.sections : []
  const included = sections.filter(s => s.include_in_composite)
  const selected = included.length ? included : sections
  const valid = (s: SavedSectionScore) =>
    Number.isInteger(s.scaled_score) && s.scaled_score !== null &&
    s.scaled_score >= 0 && s.scaled_score <= maximum &&
    s.scale_max === maximum
  const complete = selected.length > 0 && selected.every(valid)
  const savedComposite = score.scheme === 'act' && Number.isInteger(score.composite) &&
    score.composite !== null && score.composite >= 1 && score.composite <= 36
      ? score.composite : null
  const overall = complete
    ? savedComposite ?? Math.round(selected.reduce((sum, section) => sum + section.scaled_score!, 0) / selected.length)
    : null
  const lines = sections.map(section =>
    `${section.section_title}: ${valid(section) ? `${section.scaled_score}/${maximum}` : `Not available / ${maximum}`}`)
  return {
    scheme: score.scheme,
    label: `${exam} Practice Score`,
    value: overall === null ? `Not available / ${maximum}` : `${overall}/${maximum}`,
    maximum,
    lines,
    note: score.mode === 'custom'
      ? 'Practice score using this assessment’s custom conversion. Not an official exam score.'
      : 'Practice estimate, not an official exam score. Section scores are averaged for the displayed test score.',
  }
}

/** Read-only rule metrics from the score saved with the attempt.
 * Never derive scaled scores from percentages or recompute historical results.
 * SAT/EST use the existing practice /800 section average, ACT the saved /36
 * composite (or the same complete-section fallback as studentScoreDisplay).
 */
export function savedReportScoreMetrics(score: SavedScoringResult | null | undefined): {
  practiceScaledScore: number | null
  practiceScaledMaximum: 36 | 800 | null
} {
  if (!score || score.scheme === 'standard') return { practiceScaledScore: null, practiceScaledMaximum: null }
  if (!['sat', 'act', 'est'].includes(score.scheme)) return { practiceScaledScore: null, practiceScaledMaximum: null }
  const maximum = score.scheme === 'act' ? 36 : 800
  const sections = Array.isArray(score.sections) ? score.sections : []
  const included = sections.filter(s => s.include_in_composite)
  const selected = included.length ? included : sections
  if (!selected.length || !selected.every(s => s.scaled_score !== null &&
    Number.isInteger(s.scaled_score) && s.scaled_score >= (score.scheme === 'act' ? 1 : 0) &&
    s.scaled_score <= maximum && s.scale_max === maximum)) {
    return { practiceScaledScore: null, practiceScaledMaximum: maximum }
  }
  const savedComposite = score.scheme === 'act' && score.composite !== null &&
    Number.isInteger(score.composite) && score.composite >= 1 && score.composite <= 36
      ? score.composite : null
  const practiceScaledScore = savedComposite ?? Math.round(
    selected.reduce((sum, s) => sum + s.scaled_score!, 0) / selected.length,
  )
  return { practiceScaledScore, practiceScaledMaximum: maximum }
}
