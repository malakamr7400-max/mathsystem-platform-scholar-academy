/**
 * Browser-tab-only recovery for unsubmitted answers.
 * This is NOT a database save or a server-authoritative assessment record.
 * Never persist the student's resume token, registration data or correct answers.
 */
export type StudentDraftAnswers = Record<string, number | string>

const PREFIX = 'mathsystem:student-answer-draft:v1:'
const VERSION = 1
const MAX_AGE_MS = 24 * 60 * 60 * 1000
const MAX_ANSWERS = 500
const MAX_TEXT_LENGTH = 2000

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

function draftKey(attemptId: string): string {
  return `${PREFIX}${attemptId}`
}

function validAttemptId(attemptId: string): boolean {
  return typeof attemptId === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(attemptId)
}

function cleanAnswers(input: unknown, allowedIds: ReadonlySet<string>): StudentDraftAnswers {
  const result: StudentDraftAnswers = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result
  let count = 0
  for (const [questionId, answer] of Object.entries(input)) {
    if (!allowedIds.has(questionId)) continue
    if (count >= MAX_ANSWERS) break
    if (typeof answer === 'number' && Number.isFinite(answer)) {
      result[questionId] = answer
      count += 1
    } else if (typeof answer === 'string' && answer.length <= MAX_TEXT_LENGTH) {
      result[questionId] = answer
      count += 1
    }
  }
  return result
}

export function readStudentAnswerDraft(attemptId: string, questionIds: readonly string[]): StudentDraftAnswers {
  const storage = getStorage()
  if (!storage || !validAttemptId(attemptId)) return {}
  try {
    const raw = storage.getItem(draftKey(attemptId))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid draft')
    const draft = parsed as { version?: unknown; savedAt?: unknown; answers?: unknown }
    if (draft.version !== VERSION || typeof draft.savedAt !== 'number' ||
        !Number.isFinite(draft.savedAt) || draft.savedAt > Date.now() + 60_000 ||
        Date.now() - draft.savedAt > MAX_AGE_MS) {
      storage.removeItem(draftKey(attemptId))
      return {}
    }
    return cleanAnswers(draft.answers, new Set(questionIds))
  } catch {
    try { storage.removeItem(draftKey(attemptId)) } catch {}
    return {}
  }
}

export function writeStudentAnswerDraft(
  attemptId: string,
  answers: StudentDraftAnswers,
  questionIds: readonly string[],
): boolean {
  const storage = getStorage()
  if (!storage || !validAttemptId(attemptId)) return false
  try {
    const clean = cleanAnswers(answers, new Set(questionIds))
    storage.setItem(draftKey(attemptId), JSON.stringify({ version: VERSION, savedAt: Date.now(), answers: clean }))
    return true
  } catch {
    return false
  }
}

export function clearStudentAnswerDraft(attemptId: string): void {
  const storage = getStorage()
  if (!storage || !validAttemptId(attemptId)) return
  try { storage.removeItem(draftKey(attemptId)) } catch {}
}
