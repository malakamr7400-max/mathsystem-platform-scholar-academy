/** Local, token-free progress for restoring an active assessment in the same browser tab.
 * Not an authoritative server record and never extends a timer on reload.
 */
export interface StudentAttemptProgress {
  sectionIndex: number
  questionIndex: number
  sectionDeadline: number | null
  breakDeadline: number | null
  onBreak: boolean
  optionalDecisionSection: number | null
  flaggedQuestionIds: string[]
}
const PREFIX = 'mathsystem:student-attempt-progress:v1:'
const MAX_AGE = 24 * 60 * 60 * 1000
const validId = (id: string) => /^[a-zA-Z0-9-]{8,80}$/.test(id)
export function readStudentAttemptProgress(id: string, sectionCount: number): StudentAttemptProgress | null {
  if (!validId(id)) return null
  try {
    const raw = sessionStorage.getItem(PREFIX + id)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data.version !== 1 || !Number.isFinite(data.savedAt) || data.savedAt > Date.now() + 60_000 || Date.now() - data.savedAt > MAX_AGE ||
      !Number.isInteger(data.sectionIndex) || data.sectionIndex < 0 || data.sectionIndex >= sectionCount ||
      !Number.isInteger(data.questionIndex) || data.questionIndex < 0 ||
      (data.sectionDeadline !== null && (!Number.isFinite(data.sectionDeadline) || data.sectionDeadline < 0)) ||
      (data.breakDeadline !== null && (!Number.isFinite(data.breakDeadline) || data.breakDeadline < 0))) return null
    return {
      sectionIndex: data.sectionIndex, questionIndex: data.questionIndex,
      sectionDeadline: data.sectionDeadline, breakDeadline: data.breakDeadline,
      onBreak: data.onBreak === true,
      optionalDecisionSection: Number.isInteger(data.optionalDecisionSection) ? data.optionalDecisionSection : null,
      flaggedQuestionIds: Array.isArray(data.flaggedQuestionIds) ? data.flaggedQuestionIds.filter((x: unknown) => typeof x === 'string').slice(0, 500) : [],
    }
  } catch { return null }
}
export function writeStudentAttemptProgress(id: string, data: StudentAttemptProgress): boolean {
  if (!validId(id)) return false
  try {
    sessionStorage.setItem(PREFIX + id, JSON.stringify({version: 1, savedAt: Date.now(), ...data}))
    return true
  } catch { return false }
}
export function clearStudentAttemptProgress(id: string): void {
  if (!validId(id)) return
  try { sessionStorage.removeItem(PREFIX + id) } catch {}
}
