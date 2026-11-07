import { supabase } from './supabaseClient'
import { type Assessment } from './assessmentService'
import { type ReportData } from '../components/Reports/Types'

export function describeAttemptError(error: unknown, fallback = 'An assessment attempt operation failed.'): string {
  if (error && typeof error === 'object') {
    const info = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    const message = typeof info.message === 'string' ? info.message : ''
    const code = typeof info.code === 'string' ? info.code : ''
    const hint = typeof info.hint === 'string' ? info.hint : ''
    const parts = [message || fallback, code ? `Code: ${code}` : '', hint ? `Hint: ${hint}` : '']
    return parts.filter(Boolean).join(' — ')
  }
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

export interface StoredAttemptRecord {
  id: string
  assessment_id: string
  assessment_name: string
  student_name: string
  student_email?: string
  status: 'completed' | 'in_progress' | 'abandoned'
  started_at: string
  completed_at?: string
  total_time_seconds: number
  percentage: number
  correct_count: number
  total_questions: number
  level_name: string
  registration_responses: Record<string, any>
  answers: Record<string, any>
  report_data?: ReportData
}

let _attemptsCache: StoredAttemptRecord[] = []
let _hasLoadedAttempts = false

// Clear any old browser storage
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('math_diag_all_attempts_v2')
  } catch {}
}

export const attemptService = {
  getAllAttempts(): StoredAttemptRecord[] {
    if (!_hasLoadedAttempts && typeof window !== 'undefined') {
      this.fetchAttemptsFromDatabase().catch(() => {})
    }
    return _attemptsCache
  },

  getAttemptsForAssessment(assessmentId: string): StoredAttemptRecord[] {
    return this.getAllAttempts().filter((a) => a.assessment_id === assessmentId)
  },

  getAttemptById(attemptId: string): StoredAttemptRecord | null {
    const list = this.getAllAttempts()
    const found = list.find((a) => a.id === attemptId)
    return found || null
  },

  async loadAttemptById(attemptId: string): Promise<StoredAttemptRecord | null> {
    // Always read the actual attempt status: the cache can be stale in another tab.
    const { data, error } = await supabase.from('attempts').select('*').eq('id', attemptId).maybeSingle()
    if (error) throw error
    if (!data) return null

    const reportInfo = data.report_data?.student_info || {}
    const item: StoredAttemptRecord = {
      id: String(data.id),
      assessment_id: String(data.assessment_id),
      assessment_name: reportInfo.assessment_name || 'Diagnostic Assessment',
      student_name: data.student_name || 'Student',
      student_email: data.student_email || '',
      status: data.status,
      started_at: data.started_at,
      completed_at: data.completed_at || undefined,
      total_time_seconds: Number(reportInfo.total_time_seconds ?? 0),
      percentage: Number(data.percentage ?? 0),
      correct_count: Number(data.correct_count ?? 0),
      total_questions: Number(data.total_questions ?? 0),
      level_name: data.level_name || 'In Progress',
      registration_responses: reportInfo.registration_responses || {},
      answers: data.answers || {},
      report_data: data.report_data,
    }
    _attemptsCache = [item, ..._attemptsCache.filter((attempt) => attempt.id !== item.id)]
    return item
  },

  async saveActiveAttempt(record: {
    id: string
    assessment_id: string
    assessment_name?: string
    student_name: string
    student_email?: string
    registration_responses?: Record<string, any>
    answers?: Record<string, any>
    started_at?: string
  }): Promise<{ resumeToken: string; versionNumber: number }> {
    // A single PostgreSQL transaction inserts into public.attempts and
    // public.registration_responses. Neither table is considered saved on error.
    const { data: saved, error } = await supabase.rpc('start_student_attempt_v1', {
      p_attempt_id: record.id,
      p_assessment_id: record.assessment_id,
      p_student_name: record.student_name,
      p_student_email: record.student_email || null,
      p_registration_responses: record.registration_responses || {},
    })
    if (error) throw new Error(describeAttemptError(error, 'Could not create the attempt.'))
    if (saved?.id !== record.id || saved?.assessment_id !== record.assessment_id ||
        saved?.status !== 'in_progress' || typeof saved?.started_at !== 'string' ||
        typeof saved?.resume_token !== 'string' || typeof saved?.assessment_version_id !== 'string') {
      throw new Error('Supabase did not confirm the active attempt and registration were saved.')
    }
    const fullRec: StoredAttemptRecord = {
      id: record.id,
      assessment_id: record.assessment_id,
      assessment_name: record.assessment_name || 'Diagnostic Assessment',
      student_name: record.student_name,
      student_email: record.student_email || '',
      status: 'in_progress',
      started_at: saved.started_at,
      total_time_seconds: 0,
      percentage: 0,
      correct_count: 0,
      total_questions: 0,
      level_name: 'In Progress',
      registration_responses: record.registration_responses || {},
      answers: {},
    }
    _attemptsCache = [fullRec, ..._attemptsCache.filter((attempt) => attempt.id !== record.id)]
    return { resumeToken: saved.resume_token, versionNumber: Number(saved.assessment_version_number) }
  },

  async saveCompletedAttempt(params: {
    attemptId: string
    resumeToken: string
    assessment: Assessment
    studentData: Record<string, any>
    answers: Record<string, any>
    startedAt?: string
    totalTimeSeconds?: number
  }): Promise<StoredAttemptRecord> {
    const { attemptId, resumeToken, assessment, answers } = params
    if (!attemptId || !resumeToken || !assessment.id) {
      throw new Error('A valid attempt, resume token and assessment are required.')
    }
    // No browser-computed score, grading key, report, or time is submitted.
    // The RPC locks the attempt, verifies its token, reads the pinned private
    // question snapshots and commits exactly one server-calculated result.
    const { data, error } = await supabase.rpc('submit_student_attempt_v1', {
      p_attempt_id: attemptId,
      p_resume_token: resumeToken,
      p_answers: answers,
    })
    if (error) throw new Error(describeAttemptError(error, 'Server scoring failed.'))
    if (data?.id !== attemptId || data?.status !== 'completed' ||
        !Number.isFinite(Number(data.percentage)) ||
        !Number.isInteger(Number(data.correct_count)) ||
        !Number.isInteger(Number(data.total_questions))) {
      throw new Error('Supabase did not confirm a completed, server-scored attempt.')
    }
    // Retrieve the confirmed result via the token-protected RPC, not a
    // mutable client-built report. This is also safe after a network retry.
    const { data: report, error: reportError } = await supabase.rpc('get_student_report_v1', {
      p_attempt_id: attemptId,
      p_resume_token: resumeToken,
    })
    if (reportError) throw new Error(describeAttemptError(reportError, 'Score saved, but the report could not be loaded.'))
    if (!report || report.student_info?.attempt_id !== attemptId ||
        Number(report.overall?.percentage) !== Number(data.percentage)) {
      throw new Error('Score saved, but the confirmed report did not match. Reload the report rather than resubmitting.')
    }
    const record: StoredAttemptRecord = {
      id: attemptId,
      assessment_id: assessment.id,
      assessment_name: String(report.student_info.assessment_name || assessment.title),
      student_name: String(params.studentData.full_name || params.studentData.name || params.studentData.student_name || 'Student'),
      student_email: String(params.studentData.email || params.studentData.student_email || ''),
      status: 'completed',
      started_at: String(report.student_info.started_at),
      completed_at: String(data.completed_at),
      total_time_seconds: Number(report.student_info.total_time_seconds || 0),
      percentage: Number(data.percentage),
      correct_count: Number(data.correct_count),
      total_questions: Number(data.total_questions),
      level_name: 'Scored',
      registration_responses: report.student_info.registration_responses || {},
      answers,
      report_data: report as ReportData,
    }
    _attemptsCache = [record, ..._attemptsCache.filter((item) => item.id !== attemptId)]
    return record
  },

  /**
  * Fetch attempts from Supabase and update the in-memory cache
   */
  async fetchAttemptsFromDatabase(assessmentId?: string): Promise<StoredAttemptRecord[]> {
    _hasLoadedAttempts = true

    try {
      let query = supabase.from('attempts').select('*').order('started_at', { ascending: false })
      if (assessmentId) {
        query = query.eq('assessment_id', assessmentId)
      }

      const { data, error } = await query
      if (error) throw error

      const mapped: StoredAttemptRecord[] = (data ?? []).map((row: any) => {
          const studentName =
            row.student_name ||
            row.registration_responses?.full_name ||
            row.registration_responses?.name ||
            'Student Participant'

          return {
            id: String(row.id),
            assessment_id: String(row.assessment_id),
            assessment_name:
              row.report_data?.student_info?.assessment_name ||
              'Diagnostic Assessment',
            student_name: studentName,
            student_email: row.student_email || row.registration_responses?.email || '',
            status: row.status as 'completed' | 'in_progress' | 'abandoned',
            started_at: row.started_at,
            completed_at: row.completed_at || undefined,
            total_time_seconds: Number(row.report_data?.student_info?.total_time_seconds ?? 0),
            percentage: Number(row.percentage) || 0,
            correct_count: Number(row.correct_count) || 0,
            total_questions: Number(row.total_questions) || 0,
            level_name: row.level_name || 'Assessed',
            registration_responses: row.report_data?.student_info?.registration_responses || {},
            answers: row.answers || {},
            report_data: row.report_data,
          }
        })

      _attemptsCache = mapped
      return mapped
    } catch (e) {
      console.warn('Error reading attempts from Supabase:', e)
      throw e
    }
  },

  async deleteAttempt(attemptId: string): Promise<void> {
    const { data, error } = await supabase.from('attempts').delete().eq('id', attemptId).select('id').maybeSingle()
    if (error) throw new Error(describeAttemptError(error, 'Could not delete attempt.'))
    if (!data) throw new Error('Supabase did not confirm attempt deletion.')
    _attemptsCache = _attemptsCache.filter((a) => a.id !== attemptId)
  }
}
