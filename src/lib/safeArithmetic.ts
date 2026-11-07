/** A small, bounded arithmetic parser for the student calculator. Never evaluates JavaScript. */
export function calculateArithmetic(expression: string): string {
  const input = expression.replace(/\s+/g, '')
  if (!input || input.length > 120 || !/^[\d.+\-*/()]+$/.test(input)) {
    throw new Error('Enter a valid arithmetic expression.')
  }
  let pos = 0
  const peek = () => input[pos]
  const consume = (char: string) => {
    if (peek() === char) { pos += 1; return true }
    return false
  }
  const parseNumber = (): number => {
    const start = pos
    while (/[0-9]/.test(peek() || '')) pos++
    if (consume('.')) while (/[0-9]/.test(peek() || '')) pos++
    const raw = input.slice(start, pos)
    if (!raw || raw === '.' || !/^\d+(?:\.\d*)?$|^\.\d+$/.test(raw)) {
      throw new Error('Expected a number.')
    }
    return Number(raw)
  }
  const factor = (): number => {
    if (consume('+')) return factor()
    if (consume('-')) return -factor()
    if (consume('(')) {
      const value = expressionValue()
      if (!consume(')')) throw new Error('Missing closing parenthesis.')
      return value
    }
    return parseNumber()
  }
  const term = (): number => {
    let result = factor()
    while (true) {
      if (consume('*')) result *= factor()
      else if (consume('/')) {
        const divisor = factor()
        if (divisor === 0) throw new Error('Cannot divide by zero.')
        result /= divisor
      } else return result
    }
  }
  const expressionValue = (): number => {
    let result = term()
    while (true) {
      if (consume('+')) result += term()
      else if (consume('-')) result -= term()
      else return result
    }
  }
  const result = expressionValue()
  if (pos !== input.length || !Number.isFinite(result)) throw new Error('Invalid expression or result.')
  return String(Number(result.toPrecision(12)))
}
