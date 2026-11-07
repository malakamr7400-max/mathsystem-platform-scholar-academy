/** Parse editor-supported numeric answers without evaluating arbitrary expressions.
 * Accepts decimals (including signed/scientific notation) and simple fractions
 * like 5/2 or -3 / 4. Rejects missing, nonfinite, and zero-denominator values.
 */
export function parseNumericAnswer(input: unknown): number | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null
  const text = String(input).trim()
  if (!text) return null
  // Avoid JS evaluation or implicit coercion of non-numeric text.
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
  if (numeric.test(text)) {
    const result = Number(text)
    return Number.isFinite(result) ? result : null
  }
  const fraction = text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\/\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/)
  if (!fraction) return null
  const numerator = Number(fraction[1])
  const denominator = Number(fraction[2])
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null
  const result = numerator / denominator
  return Number.isFinite(result) ? result : null
}

export function parseNumericTolerance(input: unknown): number | null {
  const value = input === undefined || input === null || String(input).trim() === ''
    ? 0
    : parseNumericAnswer(input)
  return value !== null && value >= 0 ? value : null
}

export function isCorrectNumericAnswer(answer: unknown, key: unknown, tolerance: unknown): boolean {
  const actual = parseNumericAnswer(answer)
  const expected = parseNumericAnswer(key)
  const allowedDifference = parseNumericTolerance(tolerance)
  if (actual === null || expected === null || allowedDifference === null) return false
  const roundingAllowance = Number.EPSILON * 8 * Math.max(1, Math.abs(actual), Math.abs(expected))
  return Math.abs(actual - expected) <= allowedDifference + roundingAllowance
}
