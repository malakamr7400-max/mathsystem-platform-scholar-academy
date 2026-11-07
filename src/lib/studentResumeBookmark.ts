/** Browser bookmark for recovering an existing student attempt via its original assessment URL.
 * The token grants access to the attempt: store only on the student's trusted device.
 * This is not a replacement for the server recovery RPC or its authorization checks.
 */
const PREFIX = 'mathsystem:student-resume:v1:'
type Mode = 'exam' | 'learning'
export type ResumeBookmark = { attemptId: string; resumeToken: string; mode: Mode }

export function readResumeBookmark(assessmentId: string): ResumeBookmark | null {
  try {
    const value = localStorage.getItem(PREFIX + assessmentId)
    if (!value) return null
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null
    const item = parsed as Record<string, unknown>
    if (typeof item.attemptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(item.attemptId) ||
        typeof item.resumeToken !== 'string' || !item.resumeToken ||
        (item.mode !== 'exam' && item.mode !== 'learning')) return null
    return item as ResumeBookmark
  } catch { return null }
}

export function saveResumeBookmark(assessmentId: string, attemptId: string, resumeToken: string, mode: Mode): boolean {
  try {
    localStorage.setItem(PREFIX + assessmentId, JSON.stringify({ attemptId, resumeToken, mode }))
    return true
  } catch { return false }
}

export function clearResumeBookmark(assessmentId: string, attemptId: string): void {
  try {
    const existing = readResumeBookmark(assessmentId)
    if (existing?.attemptId === attemptId) localStorage.removeItem(PREFIX + assessmentId)
  } catch { /* private-mode and locked-storage browsers */ }
}
