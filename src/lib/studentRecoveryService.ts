import { supabase } from './supabaseClient'
import type { StudentAttemptProgress } from './studentAttemptProgress'

export type StudentRecoverySnapshot = {
  status: string
  answers: Record<string, number | string>
  position: Partial<StudentAttemptProgress>
  revision: number
  serverNow: string
  overallDeadline: string | null
  sectionDeadline: string | null
  sectionIndex: number
  expired: boolean
}

export type StudentRecoverySave = {
  revision: number
  savedAt: string
  sectionDeadline: string | null
  sectionIndex: number
}

/** RPCs require a valid resume token; no public direct table access is granted. */
export async function getStudentRecovery(attemptId: string, resumeToken: string): Promise<StudentRecoverySnapshot> {
  if (!attemptId || !resumeToken) throw new Error('Missing secure assessment resume link.')
  const { data, error } = await supabase.rpc('get_student_attempt_recovery_v1', {
    p_attempt_id: attemptId, p_resume_token: resumeToken,
  })
  if (error) throw error
  if (!data || !Number.isInteger(Number(data.revision)) || !data.serverNow) {
    throw new Error('Incomplete assessment recovery response.')
  }
  return data as StudentRecoverySnapshot
}

export async function saveStudentRecovery(
  attemptId: string, resumeToken: string, answers: Record<string, number | string>,
  position: StudentAttemptProgress, expectedRevision: number,
): Promise<StudentRecoverySave> {
  const { data, error } = await supabase.rpc('save_student_attempt_recovery_v1', {
    p_attempt_id: attemptId, p_resume_token: resumeToken,
    p_answers: answers, p_position: position, p_expected_revision: expectedRevision,
  })
  if (error) throw error
  if (!data || !Number.isInteger(Number(data.revision))) throw new Error('The server did not confirm the autosave.')
  return data as StudentRecoverySave
}
