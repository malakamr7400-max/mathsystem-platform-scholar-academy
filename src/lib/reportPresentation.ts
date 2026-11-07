import type { BreakdownRow, QuestionReviewItem } from '../components/Reports/Types'

/** Read-only display summary; does not alter the saved authoritative score. */
export function difficultyFromSavedQuestions(questions: QuestionReviewItem[]): BreakdownRow[] {
  const groups = new Map<string, { total: number; correct: number; earned: number; possible: number }>()
  for (const q of questions) {
    const key = typeof q.difficulty === 'string' ? q.difficulty.trim().toLowerCase() : ''
    if (!key) continue
    const prev = groups.get(key) ?? { total: 0, correct: 0, earned: 0, possible: 0 }
    const earned = Number(q.points_earned)
    const possible = Number(q.points_possible)
    prev.total++
    if (q.status === 'correct' || q.is_correct) prev.correct++
    prev.earned += Number.isFinite(earned) ? Math.max(0, earned) : 0
    prev.possible += Number.isFinite(possible) ? Math.max(0, possible) : 0
    groups.set(key, prev)
  }
  return [...groups.entries()].map(([key, stats]) => ({
    type: 'difficulty' as const,
    id: null,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    total_questions: stats.total,
    correct_count: stats.correct,
    points_earned: stats.earned,
    points_possible: stats.possible,
    percentage: stats.possible > 0 ? Math.round(1000 * stats.earned / stats.possible) / 10 : 0,
    classification: null,
  }))
}
