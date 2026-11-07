/** Pure student-flow helpers. No database writes or browser storage. */
export type StudentRegistrationField = {
  id: string
  label: string
  field_key: string
  type: string
  required: boolean
  options?: string[] | null
}

export type RegistrationCheck = {
  valid: boolean
  firstInvalidField: string | null
  message: string | null
  requiredComplete: number
  requiredTotal: number
}

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export function checkStudentRegistration(
  fields: StudentRegistrationField[],
  responses: Record<string, string>,
): RegistrationCheck {
  const required = fields.filter((field) => field.required)
  const requiredComplete = required.filter((field) => Boolean(responses[field.field_key]?.trim())).length
  const result = (field: StudentRegistrationField, message: string): RegistrationCheck => ({
    valid: false, firstInvalidField: field.id, message,
    requiredComplete, requiredTotal: required.length,
  })
  for (const field of fields) {
    const value = (responses[field.field_key] ?? '').trim()
    if (field.required && !value) return result(field, `Please complete ${field.label}.`)
    if (!value) continue
    if ((field.type === 'email' || /^(student_)?email$/i.test(field.field_key)) && !validEmail(value)) {
      return result(field, `Enter a valid email address for ${field.label}.`)
    }
    if (field.type === 'dropdown' && field.options?.length && !field.options.includes(value)) {
      return result(field, `Choose a listed option for ${field.label}.`)
    }
  }
  return { valid: true, firstInvalidField: null, message: null, requiredComplete, requiredTotal: required.length }
}

export function getStudentIdentity(
  responses: Record<string, string>,
  fields: StudentRegistrationField[],
): { name: string; email: string } {
  const pick = (...keys: string[]) => keys.map((key) => responses[key]?.trim()).find(Boolean) ?? ''
  const nameKeys = fields.filter((field) =>
    field.type !== 'email' && /(^|_)(full_?name|student_?name|name)($|_)/i.test(field.field_key)
  ).map((field) => field.field_key)
  const emailKeys = fields.filter((field) => field.type === 'email').map((field) => field.field_key)
  return {
    name: pick('full_name', 'student_name', 'name', ...nameKeys) || 'Student Participant',
    email: pick('student_email', 'email', ...emailKeys),
  }
}

export function countCompletedAnswers(
  questionItemIds: string[],
  answers: Record<string, number | string>,
): { answered: number; unanswered: number; total: number } {
  const answered = questionItemIds.filter((id) => {
    const answer = answers[id]
    return answer !== undefined && answer !== null && String(answer).trim() !== ''
  }).length
  return { answered, unanswered: questionItemIds.length - answered, total: questionItemIds.length }
}

/** Manual completion requires review; timed expiry must submit without waiting. */
export function finalSectionAction(
  isLastSection: boolean,
  timedExpiry: boolean,
): 'advance' | 'review' | 'submit' {
  if (!isLastSection) return 'advance'
  return timedExpiry ? 'submit' : 'review'
}
