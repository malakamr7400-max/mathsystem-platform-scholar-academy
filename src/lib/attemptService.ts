import { supabase } from './supabaseClient'
import { questionBankService, type QuestionBankItem } from './questionBankService'
import { assessmentService, type Assessment } from './assessmentService'
import { type ReportData, type QuestionReviewItem, type BreakdownRow } from '../components/Reports/Types'
import { reportTemplateService } from './reportTemplateService'

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
    const cached = this.getAttemptById(attemptId)
    if (cached) return cached

    const { data, error } = await supabase.from('attempts').select('*').eq('id', attemptId).maybeSingle()
    if (error) throw error
    if (!data) return null

    const item: StoredAttemptRecord = {
      id: String(data.id),
      assessment_id: String(data.assessment_id),
      assessment_name: data.report_data?.student_info?.assessment_name || 'Diagnostic Assessment',
      student_name: data.student_name || 'Student',
      student_email: data.student_email || '',
      status: data.status || 'completed',
      started_at: data.started_at || new Date().toISOString(),
      completed_at: data.completed_at || new Date().toISOString(),
      total_time_seconds: data.total_time_seconds || 1200,
      percentage: Number(data.percentage) || 0,
      correct_count: Number(data.correct_count) || 0,
      total_questions: Number(data.total_questions) || 0,
      level_name: data.level_name || 'Assessed',
      registration_responses: data.registration_responses || {},
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
  }): Promise<void> {
    const fullRec: StoredAttemptRecord = {
      id: record.id,
      assessment_id: record.assessment_id,
      assessment_name: record.assessment_name || 'Diagnostic Assessment',
      student_name: record.student_name,
      student_email: record.student_email || '',
      status: 'in_progress',
      started_at: record.started_at || new Date().toISOString(),
      total_time_seconds: 0,
      percentage: 0,
      correct_count: 0,
      total_questions: 0,
      level_name: 'In Progress',
      registration_responses: record.registration_responses || {},
      answers: record.answers || {},
    }

    const { error } = await supabase.from('attempts').upsert({
      id: fullRec.id,
      assessment_id: fullRec.assessment_id,
      student_name: fullRec.student_name,
      student_email: fullRec.student_email || null,
      status: fullRec.status,
      started_at: fullRec.started_at,
      total_time_seconds: fullRec.total_time_seconds,
      percentage: fullRec.percentage,
      correct_count: fullRec.correct_count,
      total_questions: fullRec.total_questions,
      level_name: fullRec.level_name,
      registration_responses: fullRec.registration_responses,
      answers: fullRec.answers,
    })
    if (error) throw error
    _attemptsCache = [fullRec, ..._attemptsCache.filter((attempt) => attempt.id !== fullRec.id)]
  },

  async saveCompletedAttempt(params: {
    attemptId: string
    assessment: Assessment
    studentData: Record<string, any>
    answers: Record<string, any>
    startedAt?: string
    totalTimeSeconds?: number
  }): Promise<StoredAttemptRecord> {
    const { attemptId, assessment, studentData, answers, startedAt, totalTimeSeconds = 1200 } = params

    // 1. Calculate scores and question reviews
    let totalPoints = 0
    let earnedPoints = 0
    let correctCount = 0
    let totalQuestions = 0
    const bankQuestions = questionBankService.getStoredQuestions()

    const reviewQuestions: QuestionReviewItem[] = []
    const domainStatsMap = new Map<string, { total: number; correct: number; totalTime: number }>()

    assessment.sections.forEach((sec) => {
      sec.questions.forEach((qItem, idx) => {
        totalQuestions += 1
        const pts = qItem.pointsOverride || 1
        totalPoints += pts

        const studentAns = answers[qItem.id]
        const qDetail =
          (qItem.questionSnapshot as QuestionBankItem) ||
          bankQuestions.find((q) => q.id === qItem.questionId) || {
            id: qItem.questionId,
            prompt: `Question ${idx + 1}`,
            choices: [],
            domain: 'Algebra & Functions',
            chapter: 'Linear Equations',
            lesson: 'Linear Models',
            difficulty: 'medium',
            explanation: '',
          }

        const domainName = qDetail.domain || 'General Mathematics'
        const domainStat = domainStatsMap.get(domainName) || { total: 0, correct: 0, totalTime: 0 }
        domainStat.total += 1

        let isCorrect = false
        const choices = qDetail.choices || []
        const correctIdx = choices.findIndex((c) => c.isCorrect)

        if (studentAns !== undefined && studentAns !== null && studentAns !== '') {
          if (typeof studentAns === 'number' && studentAns === correctIdx) {
            isCorrect = true
          } else if (String(studentAns).trim().toLowerCase() === String(qDetail.numericAnswer || '').trim().toLowerCase()) {
            isCorrect = true
          }
        }

        const isUnanswered = studentAns === undefined || studentAns === null || studentAns === ''

        if (isCorrect) {
          earnedPoints += pts
          correctCount += 1
          domainStat.correct += 1
        }

        const approxTime = Math.max(20, Math.round(totalTimeSeconds / Math.max(1, totalQuestions)))
        domainStat.totalTime += approxTime
        domainStatsMap.set(domainName, domainStat)

        reviewQuestions.push({
          question_id: qItem.id,
          content_blocks: [{ type: 'text', value: qDetail.prompt || `Question ${idx + 1}` }],
          explanation_blocks: [{ type: 'text', value: qDetail.explanation || 'Solution steps verified.' }],
          difficulty: (qDetail.difficulty as any) || 'medium',
          answer_type_code: qDetail.questionType === 'grid_in' ? 'GRID_IN' : 'MCQ',
          points_possible: pts,
          points_earned: isCorrect ? pts : 0,
          is_correct: isCorrect,
          status: isCorrect ? 'correct' : isUnanswered ? 'unanswered' : 'incorrect',
          time_spent_seconds: approxTime,
          student_answer: { value: studentAns, choice_idx: studentAns },
          category_name: domainName,
          lesson_name: qDetail.lesson || qDetail.chapter || 'Foundations',
          skill_name: qDetail.chapter || domainName,
          choices: choices.map((c) => ({
            id: c.id,
            content_blocks: [{ type: 'text', value: c.text }],
            is_correct: c.isCorrect,
          })),
        })
      })
    })

    const pct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0

    // Resolve rubric tier based on customizable rubric config
    const template = reportTemplateService.getTemplateForAssessment(assessment.id)
    const rubricTier = reportTemplateService.resolveRubricLevel(pct, template)

    // Build breakdowns
    const breakdowns: BreakdownRow[] = []
    domainStatsMap.forEach((stat, domName) => {
      const domPct = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0
      breakdowns.push({
        type: 'category',
        id: `cat_${domName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`,
        label: domName,
        total_questions: stat.total,
        correct_count: stat.correct,
        points_earned: stat.correct,
        points_possible: stat.total,
        percentage: domPct,
        classification: domPct >= template.strongThreshold ? 'strong' : domPct < template.moderateThreshold ? 'weak' : 'average',
        avg_time_seconds: stat.total > 0 ? Math.round(stat.totalTime / stat.total) : 60,
      })
    })

    const studentName =
      studentData.full_name ||
      studentData.fullName ||
      studentData.name ||
      studentData.student_name ||
      studentData.email ||
      'Student'

    const studentEmail =
      studentData.email || studentData.student_email || studentData.parent_email || undefined

    const fullReport: ReportData = {
      student_info: {
        attempt_id: attemptId,
        assessment_name: assessment.title,
        started_at: startedAt || new Date(Date.now() - totalTimeSeconds * 1000).toISOString(),
        completed_at: new Date().toISOString(),
        total_time_seconds: totalTimeSeconds,
        registration_responses: studentData,
      },
      overall: {
        total_questions: totalQuestions,
        correct_count: correctCount,
        incorrect_count: totalQuestions - correctCount,
        unanswered_count: reviewQuestions.filter((q) => q.status === 'unanswered').length,
        points_earned: earnedPoints,
        points_possible: totalPoints,
        percentage: pct,
        calculated_at: new Date().toISOString(),
        avg_time_per_question: Math.round(totalTimeSeconds / Math.max(1, totalQuestions)),
        avg_time_correct: Math.round((totalTimeSeconds / Math.max(1, totalQuestions)) * 0.9),
        avg_time_incorrect: Math.round((totalTimeSeconds / Math.max(1, totalQuestions)) * 1.1),
        rushed_mistakes_count: 0,
        timesink_mistakes_count: 0,
        level: {
          id: rubricTier.id,
          name: rubricTier.name,
          description: rubricTier.description,
          recommendation: rubricTier.recommendation,
        },
      },
      breakdowns,
      questions: reviewQuestions,
      courses: [
        {
          id: 'crs-standard',
          name: `${assessment.subject || 'Mathematics'} Targeted Remediation Intensive`,
          description: rubricTier.recommendation,
          image_url: null,
          registration_url: '#',
          whatsapp_url: '#',
          phone: null,
        },
      ],
      org_settings: {
        org_name: template.title || 'Math Diagnostic Platform',
        marketing_tagline: template.subtitle || null,
        contact_phone: null,
        whatsapp_url: null,
        website_url: null,
      },
    }

    const record: StoredAttemptRecord = {
      id: attemptId,
      assessment_id: assessment.id,
      assessment_name: assessment.title,
      student_name: studentName,
      student_email: studentEmail,
      status: 'completed',
      started_at: startedAt || new Date(Date.now() - totalTimeSeconds * 1000).toISOString(),
      completed_at: new Date().toISOString(),
      total_time_seconds: totalTimeSeconds,
      percentage: pct,
      correct_count: correctCount,
      total_questions: totalQuestions,
      level_name: rubricTier.name,
      registration_responses: studentData,
      answers,
      report_data: fullReport,
    }

    await assessmentService.syncAssessmentToDatabase(assessment)
    const { error } = await supabase.from('attempts').upsert({
      id: attemptId,
      assessment_id: assessment.id,
      student_name: studentName,
      student_email: studentEmail || null,
      status: 'completed',
      started_at: record.started_at,
      completed_at: record.completed_at,
      total_time_seconds: totalTimeSeconds,
      percentage: pct,
      correct_count: correctCount,
      total_questions: totalQuestions,
      level_name: rubricTier.name,
      registration_responses: studentData,
      answers,
      report_data: fullReport,
    })
    if (error) throw error
    _attemptsCache = [record, ..._attemptsCache.filter((attempt) => attempt.id !== record.id)]

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
            status: (row.status || 'completed') as 'completed' | 'in_progress' | 'abandoned',
            started_at: row.started_at || new Date().toISOString(),
            completed_at: row.completed_at || new Date().toISOString(),
            total_time_seconds: row.total_time_seconds || 1200,
            percentage: Number(row.percentage) || 0,
            correct_count: Number(row.correct_count) || 0,
            total_questions: Number(row.total_questions) || 0,
            level_name: row.level_name || 'Assessed',
            registration_responses: row.registration_responses || {},
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
    _attemptsCache = this.getAllAttempts().filter((a) => a.id !== attemptId)
    const { error } = await supabase.from('attempts').delete().eq('id', attemptId)
    if (error) throw error
  }
}
