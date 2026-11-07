import { isCorrectNumericAnswer, parseNumericAnswer } from './numericAnswer'

/** Multiple accepted Grid-in values; equivalent fractions/decimals count as one value. */
export function isAcceptedGridAnswer(answer: unknown, accepted: unknown, tolerance: unknown): boolean {
  if (!Array.isArray(accepted) || accepted.length === 0) return false
  return accepted.some(value => isCorrectNumericAnswer(answer, value, tolerance))
}

export function validateAcceptedGridAnswers(primary: string, alternatives: string[]): boolean {
  return parseNumericAnswer(primary) !== null && alternatives.every(value => parseNumericAnswer(value) !== null)
}
