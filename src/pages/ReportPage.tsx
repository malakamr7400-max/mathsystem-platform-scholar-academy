import { studentScoreDisplay, savedReportScoreMetrics } from '../lib/scoringSchemes'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { TaxonomyTree } from '../components/Reports/TaxonomyTree'
import QuestionReviewCard from '../components/Reports/QuestionReviewCard'
import DomainCard from '../components/Reports/DomainCard'
import TimeAnalysisSection from '../components/Reports/TimeAnalysisSection'
import ThreeStateDonutChart from '../components/Reports/ThreeStateDonutChart'
import { exportDiagnosticReportPDF } from '../lib/diagnosticPdfExport'
import {
  STRONG_DOMAIN_THRESHOLD,
  MODERATE_DOMAIN_THRESHOLD,
  TIME_SLOW_THRESHOLD_PCT,
  computeDomainPerformance,
  computeTimeAnalysis,
  computeThreeStateSummary,
} from '../lib/diagnosticAnalytics'
import type { CourseItem, QuestionReviewItem, ReportData, TaxonomyType } from '../components/Reports/Types'
import { surveyService, type ActionPlan, type StudentSurveyResponse } from '../lib/surveyService'
import { Sparkles, CheckCircle2, Lock, ArrowLeft } from 'lucide-react'
import { attemptService } from '../lib/attemptService'
import { loadOrganizationConfig } from '../lib/organizationConfigService'
import { PublishedStudioReport } from '../components/Reports/PublishedStudioReport'
import type { PublishedStudioTemplate, PublishedStudioPointer } from '../lib/publishedStudioTypes'
import {
  reportTemplateService,
  type ReportSectionId,
  type ReportTemplateConfig,
} from '../lib/reportTemplateService'
import { useAuth } from '../contexts/AuthContext'
import { ReportActionBar, ReportLoadingState, ReportQuickNavigation, ReportStatusNotice, ReportUnavailableState } from '../components/student-report/StudentReportWorkspaceUI'

// Configurable thresholds for domain mastery classification
export const CONFIG_STRONG_THRESHOLD = STRONG_DOMAIN_THRESHOLD // 75%
export const CONFIG_MODERATE_THRESHOLD = MODERATE_DOMAIN_THRESHOLD // 50%
export const CONFIG_TIME_SLOW_THRESHOLD = TIME_SLOW_THRESHOLD_PCT // 25%

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

function createSamplePreviewReport(templateConfig?: ReportTemplateConfig): ReportData {
  const currentTemplate = templateConfig || reportTemplateService.getTemplateForAssessment()

  const sampleQuestions: QuestionReviewItem[] = [
    {
      question_id: 'sample-q1',
      content_blocks: [{ type: 'text', content: 'If $2x - 2 = 3x$, what is the value of $x + 2$?' }],
      explanation_blocks: [
        {
          type: 'text',
          content: 'Solve for $x$: $2x - 2 = 3x \\implies 3x - 2x = -2 \\implies x = -2$. Then substitute into $x + 2 = -2 + 2 = 0$. The correct choice is C.',
        },
      ],
      difficulty: 'easy',
      answer_type_code: 'MCQ',
      points_possible: 1,
      points_earned: 1,
      is_correct: true,
      status: 'correct',
      is_answered: true,
      time_spent_seconds: 45,
      student_answer: { choice_id: 'C' },
      category_name: 'Algebra & Functions',
      lesson_name: 'Single-Variable Linear Equations',
      skill_name: 'Linear Equation Solving',
      choices: [
        { id: 'A', content_blocks: [{ type: 'text', content: '-4' }], is_correct: false },
        { id: 'B', content_blocks: [{ type: 'text', content: '-2' }], is_correct: false },
        { id: 'C', content_blocks: [{ type: 'text', content: '0' }], is_correct: true },
        { id: 'D', content_blocks: [{ type: 'text', content: '2' }], is_correct: false },
      ],
    },
    {
      question_id: 'sample-q2',
      content_blocks: [{ type: 'text', content: 'Solve the system of equations: $2x + y = 7$ and $x - y = 2$. What is the value of $x$?' }],
      explanation_blocks: [
        {
          type: 'text',
          content: 'Add the two equations directly: $(2x + y) + (x - y) = 7 + 2 \\implies 3x = 9 \\implies x = 3$. Then $y = 1$. The correct choice is A.',
        },
      ],
      difficulty: 'medium',
      answer_type_code: 'MCQ',
      points_possible: 1,
      points_earned: 1,
      is_correct: true,
      status: 'correct',
      is_answered: true,
      time_spent_seconds: 70,
      student_answer: { choice_id: 'A' },
      category_name: 'Algebra & Functions',
      lesson_name: 'Linear Systems of Two Variables',
      skill_name: 'Elimination Method',
      choices: [
        { id: 'A', content_blocks: [{ type: 'text', content: '3' }], is_correct: true },
        { id: 'B', content_blocks: [{ type: 'text', content: '1' }], is_correct: false },
        { id: 'C', content_blocks: [{ type: 'text', content: '4' }], is_correct: false },
        { id: 'D', content_blocks: [{ type: 'text', content: '5' }], is_correct: false },
      ],
    },
    {
      question_id: 'sample-q3',
      content_blocks: [{ type: 'text', content: 'Find the vertex $(h, k)$ of the quadratic function $f(x) = x^2 - 6x + 5$.' }],
      explanation_blocks: [
        {
          type: 'text',
          content: 'For a parabola in standard form $y = ax^2 + bx + c$, the x-coordinate of vertex is $h = -b/(2a) = -(-6)/(2\\cdot 1) = 3$. Evaluating $f(3) = 3^2 - 6(3) + 5 = 9 - 18 + 5 = -4$. Vertex is $(3, -4)$. The correct choice is B.',
        },
      ],
      difficulty: 'medium',
      answer_type_code: 'MCQ',
      points_possible: 1,
      points_earned: 0,
      is_correct: false,
      status: 'incorrect',
      is_answered: true,
      time_spent_seconds: 140,
      student_answer: { choice_id: 'A' },
      category_name: 'Algebra & Functions',
      lesson_name: 'Quadratic Functions & Parabolas',
      skill_name: 'Vertex Form Calculation',
      choices: [
        { id: 'A', content_blocks: [{ type: 'text', content: '(-3, -4)' }], is_correct: false },
        { id: 'B', content_blocks: [{ type: 'text', content: '(3, -4)' }], is_correct: true },
        { id: 'C', content_blocks: [{ type: 'text', content: '(3, 4)' }], is_correct: false },
        { id: 'D', content_blocks: [{ type: 'text', content: '(0, 5)' }], is_correct: false },
      ],
    },
    {
      question_id: 'sample-q4',
      content_blocks: [{ type: 'text', content: 'In a right triangle $\\triangle ABC$ with right angle at $C$, if $\\sin(A) = \\frac{3}{5}$, what is $\\cos(A)$?' }],
      explanation_blocks: [
        {
          type: 'text',
          content: 'Using the fundamental Pythagorean trigonometric identity: $\\sin^2(A) + \\cos^2(A) = 1$. Thus $\\cos^2(A) = 1 - (3/5)^2 = 1 - 9/25 = 16/25$, so $\\cos(A) = \\frac{4}{5}$. The correct choice is C.',
        },
      ],
      difficulty: 'medium',
      answer_type_code: 'MCQ',
      points_possible: 1,
      points_earned: 1,
      is_correct: true,
      status: 'correct',
      is_answered: true,
      time_spent_seconds: 55,
      student_answer: { choice_id: 'C' },
      category_name: 'Trigonometry & Advanced Topics',
      lesson_name: 'Right Triangle Trigonometry',
      skill_name: 'Trigonometric Identities',
      choices: [
        { id: 'A', content_blocks: [{ type: 'text', content: '\\frac{3}{4}' }], is_correct: false },
        { id: 'B', content_blocks: [{ type: 'text', content: '\\frac{5}{4}' }], is_correct: false },
        { id: 'C', content_blocks: [{ type: 'text', content: '\\frac{4}{5}' }], is_correct: true },
        { id: 'D', content_blocks: [{ type: 'text', content: '\\frac{5}{3}' }], is_correct: false },
      ],
    },
    {
      question_id: 'sample-q5',
      content_blocks: [{ type: 'text', content: 'What is the surface area of a cylinder with radius $r = 3$ and height $h = 7$?' }],
      explanation_blocks: [
        {
          type: 'text',
          content: 'The total surface area is given by $A = 2\\pi r h + 2\\pi r^2 = 2\\pi(3)(7) + 2\\pi(3^2) = 42\\pi + 18\\pi = 60\\pi$. The correct choice is D.',
        },
      ],
      difficulty: 'hard',
      answer_type_code: 'MCQ',
      points_possible: 1,
      points_earned: 1,
      is_correct: true,
      status: 'correct',
      is_answered: true,
      time_spent_seconds: 95,
      student_answer: { choice_id: 'D' },
      category_name: 'Geometry & Measurement',
      lesson_name: 'Prisms, Pyramids, Cylinders & Cones',
      skill_name: 'Surface Area Calculations',
      choices: [
        { id: 'A', content_blocks: [{ type: 'text', content: '42\\pi' }], is_correct: false },
        { id: 'B', content_blocks: [{ type: 'text', content: '54\\pi' }], is_correct: false },
        { id: 'C', content_blocks: [{ type: 'text', content: '63\\pi' }], is_correct: false },
        { id: 'D', content_blocks: [{ type: 'text', content: '60\\pi' }], is_correct: true },
      ],
    },
    {
      question_id: 'sample-q6',
      content_blocks: [{ type: 'text', content: 'A data set has values: $\\{4, 7, 7, 8, 9, 10, 11, 14\\}$. What is the interquartile range (IQR)?' }],
      explanation_blocks: [
        {
          type: 'text',
          content: 'First find the median of lower half: $Q_1 = (7 + 7)/2 = 7$. Median of upper half: $Q_3 = (10 + 11)/2 = 10.5$. Therefore $IQR = Q_3 - Q_1 = 10.5 - 7 = 3.5$. The correct choice is B.',
        },
      ],
      difficulty: 'hard',
      answer_type_code: 'MCQ',
      points_possible: 1,
      points_earned: 0,
      is_correct: false,
      status: 'incorrect',
      is_answered: true,
      time_spent_seconds: 130,
      student_answer: { choice_id: 'C' },
      category_name: 'Statistics & Probability',
      lesson_name: 'Measures of Spread & Box Plots',
      skill_name: 'Interquartile Range Calculation',
      choices: [
        { id: 'A', content_blocks: [{ type: 'text', content: '3' }], is_correct: false },
        { id: 'B', content_blocks: [{ type: 'text', content: '3.5' }], is_correct: true },
        { id: 'C', content_blocks: [{ type: 'text', content: '4' }], is_correct: false },
        { id: 'D', content_blocks: [{ type: 'text', content: '5' }], is_correct: false },
      ],
    },
  ]

  const totalQuestions = sampleQuestions.length
  const correctCount = sampleQuestions.filter((q) => q.is_correct).length
  const pct = Math.round((correctCount / totalQuestions) * 100)

  const tiers = currentTemplate.rubricTiers || []
  const matchingTier =
    tiers.find((t) => pct >= t.minScore && pct <= t.maxScore) ||
    tiers[0] || {
      id: 'proficient',
      name: 'College Ready / Proficient Tier',
      description: 'Solid conceptual competency with minor computational speed errors under timed sections.',
      recommendation: 'Target timed review on multi-step rational functions and geometric coordinate proofs.',
    }

  return {
    student_info: {
      attempt_id: 'demo-preview',
      assessment_name: currentTemplate.title || 'Diagnostic Assessment Demo Preview',
      started_at: new Date(Date.now() - 1500000).toISOString(),
      completed_at: new Date().toISOString(),
      total_time_seconds: 1500,
      registration_responses: {
        full_name: 'Jordan Taylor',
        email: 'jordan.taylor@example.edu',
        grade: 'Grade 11 / College Prep',
        school: 'Academy High School',
      },
    },
    overall: {
      total_questions: totalQuestions,
      correct_count: correctCount,
      incorrect_count: totalQuestions - correctCount,
      unanswered_count: 0,
      points_earned: correctCount,
      points_possible: totalQuestions,
      percentage: pct,
      calculated_at: new Date().toISOString(),
      avg_time_per_question: Math.round(1500 / totalQuestions),
      avg_time_correct: 66,
      avg_time_incorrect: 135,
      rushed_mistakes_count: 0,
      timesink_mistakes_count: 1,
      level: {
        id: matchingTier.id,
        name: matchingTier.name,
        description: matchingTier.description,
        recommendation: matchingTier.recommendation,
      },
    },
    breakdowns: [
      {
        type: 'category',
        id: 'cat-alg',
        label: 'Algebra & Functions',
        total_questions: 3,
        correct_count: 2,
        points_earned: 2,
        points_possible: 3,
        percentage: 67,
        classification: 'average',
      },
      {
        type: 'category',
        id: 'cat-trig',
        label: 'Trigonometry & Advanced Topics',
        total_questions: 1,
        correct_count: 1,
        points_earned: 1,
        points_possible: 1,
        percentage: 100,
        classification: 'strong',
      },
      {
        type: 'category',
        id: 'cat-geo',
        label: 'Geometry & Measurement',
        total_questions: 1,
        correct_count: 1,
        points_earned: 1,
        points_possible: 1,
        percentage: 100,
        classification: 'strong',
      },
      {
        type: 'category',
        id: 'cat-stat',
        label: 'Statistics & Probability',
        total_questions: 1,
        correct_count: 0,
        points_earned: 0,
        points_possible: 1,
        percentage: 0,
        classification: 'weak',
      },
    ],
    questions: sampleQuestions,
    courses: [
      {
        id: 'crs-math-accelerator',
        name: 'Comprehensive Pre-College Math Accelerator',
        description: matchingTier.recommendation || 'Intensive remediation program targeting your identified focus topics.',
        image_url: null,
        registration_url: '#',
        whatsapp_url: '#',
        phone: null,
      },
    ],
    org_settings: {
      org_name: currentTemplate.title || 'Math Diagnostic Platform',
      marketing_tagline: currentTemplate.subtitle || 'Standardized Diagnostic Assessment System',
      contact_phone: null,
      whatsapp_url: null,
      website_url: null,
    },
    diagnostic_notes: [
      {
        type: 'strength',
        title: 'Strong Geometric & Trigonometric Precision',
        body: 'Jordan performed with 100% accuracy on right-triangle trigonometry and solid geometry measurement problems.',
      },
      {
        type: 'improvement',
        title: 'Review Measures of Spread & Box Plots',
        body: 'Additional focus recommended on Interquartile Range calculations and multi-step quadratic vertex determination.',
      },
    ],
  }
}

export default function ReportPage() {
  const { attemptId } = useParams()
  const [searchParams] = useSearchParams()
  const { session, profile, loading: authLoading } = useAuth()
  const resumeToken = new URLSearchParams(window.location.hash.slice(1)).get('token') || searchParams.get('token')
  const isPreview = attemptId === 'demo' || searchParams.get('preview') === '1'
  const role = profile?.role?.trim().toLowerCase()
  const isStaff = Boolean(session && (role === 'admin' || role === 'teacher'))

  const [report, setReport] = useState<ReportData | null>(null)
  const [publishedStudio, setPublishedStudio] = useState<PublishedStudioTemplate | null>(null)
  const [studentStudio, setStudentStudio] = useState<PublishedStudioTemplate | null>(null)
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(false)
  const [printDetailedAnalysis, setPrintDetailedAnalysis] = useState(false)
  const [reportAssessmentId, setReportAssessmentId] = useState<string | undefined>()
  const [persistedTemplate, setPersistedTemplate] = useState<ReportTemplateConfig>(() =>
    reportTemplateService.getTemplateForAssessment()
  )
  const [loading, setLoading] = useState(true)
  const [retryKey, setRetryKey] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isAccessDenied, setIsAccessDenied] = useState(false)
  const [filter, setFilter] = useState<{ type: TaxonomyType; label: string } | null>(null)

  // PDF & Email delivery states
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const [emailStatus, setEmailStatus] = useState<{
    state: 'idle' | 'sending' | 'success' | 'error'
    message?: string
  }>({ state: 'idle' })

  const reportCaptureRef = useRef<HTMLDivElement>(null)
  const questionsRef = useRef<HTMLDivElement>(null)
  const exportInProgressRef = useRef(false)

  useEffect(() => {
    if (authLoading) return
    let active = true
    setLoading(true)
    setReport(null)
    setReportAssessmentId(undefined)
    setErrorMessage(null)
    setIsAccessDenied(false)
    setEmailStatus({ state: 'idle' })

    async function load() {
      try {
        if (!attemptId) {
          setErrorMessage('This report link is incomplete.')
          return
        }
        if (isPreview) {
          if (!isStaff) {
            setIsAccessDenied(true)
            setErrorMessage('Only signed-in teachers and administrators can view report previews.')
            return
          }
          setReportAssessmentId('preview-assessment')
          setReport(createSamplePreviewReport(reportTemplateService.getTemplateForAssessment()))
          return
        }

        // The student report RPC verifies the resume token and reads the immutable score.
        // A failed student RPC must never fall back to a public direct-table read.
        if (resumeToken) {
          const { data: confirmed, error: reportError } = await supabase.rpc('get_student_report_v1', {
            p_attempt_id: attemptId,
            p_resume_token: resumeToken,
          })
          if (!active) return
          if (!reportError && confirmed?.overall && confirmed?.student_info) {
            setReport(confirmed as ReportData)
            return
          }
          if (!isStaff) {
            setIsAccessDenied(Boolean(reportError && /unauthori[sz]ed|permission|invalid token|access denied|jwt/i.test(reportError.message)))
            setErrorMessage(reportError?.message || 'The completed report is not available yet. Please retry in a moment, using the original secure report link.')
            return
          }
        } else if (!isStaff) {
          setIsAccessDenied(true)
          setErrorMessage('Open your report using the secure link provided after completing the assessment.')
          return
        }

        // Staff-only legacy read paths. They do not create or rescore attempts.
        try {
          const stored = await attemptService.loadAttemptById(attemptId)
          if (!active) return
          if (stored?.report_data) {
            setReportAssessmentId(stored.assessment_id)
            setReport(stored.report_data)
            return
          }
        } catch (err) {
          console.warn('Attempt service report read failed:', err)
        }
        if (isSupabaseConfigured) {
          try {
            const { data: row, error: rowError } = await supabase
              .from('attempts')
              .select('report_data, assessment_id')
              .eq('id', attemptId)
              .maybeSingle()
            if (!active) return
            if (rowError) console.warn('Staff report lookup failed:', rowError)
            if (row?.assessment_id) setReportAssessmentId(row.assessment_id)
            if (row?.report_data) {
              setReport(row.report_data as ReportData)
              return
            }
            if (resumeToken) {
              const { data: legacy, error: legacyError } = await supabase.rpc('get_attempt_report', {
                p_attempt_id: attemptId,
                p_resume_token: resumeToken,
              })
              if (!active) return
              if (!legacyError && legacy) {
                setReport(legacy as ReportData)
                return
              }
            }
          } catch (err) {
            console.warn('Staff report query failed:', err)
          }
        }
        setErrorMessage('We could not find this report. Check the link and try again.')
      } catch (err) {
        if (!active) return
        console.error('Report retrieval failed:', err)
        setErrorMessage('The report service could not be reached. Your saved assessment is not affected. Check your connection and try again.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [attemptId, resumeToken, isStaff, isPreview, authLoading, retryKey])

  // Keep staff sample data in sync with the report template without re-fetching real attempts.
  useEffect(() => {
    if (isPreview && isStaff && !authLoading) {
      setReport(createSamplePreviewReport(persistedTemplate))
    }
  }, [isPreview, isStaff, authLoading, persistedTemplate])

  useEffect(() => {
    let active = true
    const loadTemplate = resumeToken && attemptId
      ? reportTemplateService.loadTemplateForAttempt(attemptId, resumeToken)
      : reportTemplateService.loadTemplateForAssessment(reportAssessmentId)
    loadTemplate.then((template) => {
      if (active) setPersistedTemplate(template)
    })
    return () => {
      active = false
    }
  }, [reportAssessmentId, attemptId, resumeToken])

  // Student-safe RPC: returns ONLY the snapshot pinned to this completed attempt.
  // Never use a live organization setting or current template for student reports.
  useEffect(() => {
    let active = true
    setStudentStudio(null)
    if (!attemptId || !resumeToken || isPreview || !report) return () => { active = false }
    async function loadPinnedTemplate() {
      const { data, error } = await supabase.rpc('get_student_studio_template_v1', {
        p_attempt_id: attemptId,
        p_resume_token: resumeToken,
      })
      if (!active || error || !data || typeof data !== 'object') return
      const snapshot = data as PublishedStudioTemplate
      if (snapshot.schemaVersion === 1 && Array.isArray(snapshot.layout?.elements)) setStudentStudio(snapshot)
    }
    void loadPinnedTemplate()
    return () => { active = false }
  }, [attemptId, resumeToken, isPreview, report])

  // Staff-only read: student resume tokens must never grant access to organization settings.
  // The student report remains unchanged until a dedicated, authorized template-delivery RPC exists.
  useEffect(() => {
    let active = true
    if (!isStaff || authLoading) { setPublishedStudio(null); return }
    async function loadPublishedStudio() {
      try {
        const pointer = await loadOrganizationConfig<PublishedStudioPointer>('report-studio.published.v1')
        if (!pointer?.versionKey) return
        const snapshot = await loadOrganizationConfig<PublishedStudioTemplate>(pointer.versionKey)
        if (active && snapshot?.schemaVersion === 1 && Array.isArray(snapshot.layout?.elements)) setPublishedStudio(snapshot)
      } catch { if (active) setPublishedStudio(null) }
    }
    void loadPublishedStudio()
    return () => { active = false }
  }, [isStaff, authLoading])

  // Analytics computations
  const templateConfig = useMemo<ReportTemplateConfig>(() => {
    const base = persistedTemplate
    if (searchParams.get('preview') !== '1') return base

    try {
      const rawPreview = sessionStorage.getItem('math_diag_report_preview')
      if (!rawPreview) return base
      const preview = JSON.parse(rawPreview) as Partial<ReportTemplateConfig>
      return {
        ...base,
        ...preview,
        categoryLabels: { ...base.categoryLabels, ...preview.categoryLabels },
        domainRubricCopy: {
          ...base.domainRubricCopy,
          ...preview.domainRubricCopy,
          strong: { ...base.domainRubricCopy.strong, ...preview.domainRubricCopy?.strong },
          moderate: { ...base.domainRubricCopy.moderate, ...preview.domainRubricCopy?.moderate },
          weak: { ...base.domainRubricCopy.weak, ...preview.domainRubricCopy?.weak },
        },
        sectionRules: { ...base.sectionRules, ...preview.sectionRules },
        sectionFields: { ...base.sectionFields, ...preview.sectionFields },
      }
    } catch (err) {
      console.warn('Failed to load report preview settings:', err)
      return base
    }
  }, [persistedTemplate, searchParams])

  const analytics = useMemo(() => {
    if (!report) return null

    const strongThresh = templateConfig.strongThreshold || CONFIG_STRONG_THRESHOLD
    const moderateThresh = templateConfig.moderateThreshold || CONFIG_MODERATE_THRESHOLD
    const slowThresh = templateConfig.slowTimeThresholdPct || CONFIG_TIME_SLOW_THRESHOLD

    const domainPerf = computeDomainPerformance(
      report,
      strongThresh,
      moderateThresh,
      templateConfig.domainRubricCopy
    )

    const timeAnalysis = computeTimeAnalysis(
      report.questions,
      report.overall.avg_time_per_question,
      slowThresh
    )

    const threeState = computeThreeStateSummary(report.questions)

    const studentInfo = report.student_info
    const reg = studentInfo.registration_responses || {}
    const studentName =
      (reg.full_name as string) ||
      (reg.name as string) ||
      (reg.student_name as string) ||
      'Student'

    const studentEmail =
      (reg.email as string) ||
      (reg.student_email as string) ||
      (reg.parent_email as string) ||
      null
    const gradeEntry = Object.entries(reg).find(
      ([key, value]) =>
        /grade|level|year/i.test(key) && value !== null && value !== undefined && String(value).trim()
    )
    const studentGrade = gradeEntry ? String(gradeEntry[1]) : ''

    // Evaluate Rubric Tier dynamically
    const rubricTier = reportTemplateService.resolveRubricLevel(report.overall.percentage, templateConfig)

    return {
      domainPerf,
      timeAnalysis,
      threeState,
      studentName,
      studentEmail,
      studentGrade,
      rubricTier,
      completedLabel: studentInfo.completed_at
        ? new Date(studentInfo.completed_at).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : 'Today',
      durationLabel: formatTime(studentInfo.total_time_seconds),
      avgTime: report.overall.avg_time_per_question,
      conceptualErrors: Math.max(
        0,
        report.overall.incorrect_count -
          report.overall.rushed_mistakes_count -
          report.overall.timesink_mistakes_count
      ),
    }
  }, [report, templateConfig])

  const matchedActionPlan = useMemo<ActionPlan | null>(() => {
    if (!report) return null
    const plans = surveyService.getActionPlans()
    if (!plans || plans.length === 0) return null
    if (attemptId) {
      const response =
        (report as ReportData & { post_assessment_survey?: StudentSurveyResponse }).post_assessment_survey ||
        surveyService.getResponse(attemptId)
      if (response?.matched_plan_id) {
        const found = plans.find((p) => p.id === response.matched_plan_id)
        if (found) return found
      }
      const scorePct =
        report.overall.total_questions > 0
          ? (report.overall.correct_count / report.overall.total_questions) * 100
          : 50
      return surveyService.matchActionPlan(response?.answers || {}, scorePct, plans)
    }
    return plans[0]
  }, [report, attemptId])

  useEffect(() => {
    if (!printDetailedAnalysis) return
    const reset = () => setPrintDetailedAnalysis(false)
    window.addEventListener('afterprint', reset)
    return () => window.removeEventListener('afterprint', reset)
  }, [printDetailedAnalysis])

  // PDF capture uses html2canvas and can be expensive for long diagnostic reports.
  // Do not automatically capture the entire report on initial navigation: this
  // can block the browser's main thread before the student sees their score.
  // Download PDF and Email remain explicit actions in ReportActionBar.
  // Automatic PDF/email delivery is intentionally paused until a safe,
  // server-side delivery mechanism with idempotency is implemented.

  async function handleExportAndEmail(sendEmail = false) {
    if (exportInProgressRef.current || !analytics || !report) return
    setEmailStatus({ state: 'sending', message: sendEmail ? 'Preparing your PDF before sending the email…' : 'Preparing your PDF download…' })
    exportInProgressRef.current = true
    setPdfGenerating(true)
    const sanitizedStudentName = analytics.studentName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Student'
    const sanitizedExamName = report.student_info.assessment_name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Assessment'
    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `Report_${sanitizedStudentName}_${sanitizedExamName}_${dateStr}.pdf`
    try {
      const exportResult = await exportDiagnosticReportPDF({
        report,
        studentName: analytics.studentName,
        filename,
        plan: matchedActionPlan,
        studio: studentStudio, // Always export the attempt-pinned version; never substitute today's template.
        element: reportCaptureRef.current,
        autoDownload: true,
      })
      if (!sendEmail) setEmailStatus({ state: 'success', message: 'Your PDF is ready and the download has started.' })
      if (sendEmail && (isPreview || !analytics.studentEmail)) {
        setEmailStatus({ state: 'error', message: isPreview
          ? 'Email sending is unavailable in report preview. Your PDF download has started.'
          : 'No student email address is available for this assessment. Your PDF download has started.' })
      }
      if (sendEmail && !isPreview && analytics.studentEmail) {
        setEmailStatus({ state: 'sending', message: `Sending report to ${analytics.studentEmail}…` })
        try {
          const { error: fnError } = await supabase.functions.invoke('send-report-email', {
            body: {
              attemptId: report.student_info.attempt_id,
              recipientEmail: analytics.studentEmail,
              pdfBase64: exportResult.base64,
              studentName: analytics.studentName,
              assessmentName: report.student_info.assessment_name,
              scorePercentage: report.overall.percentage,
            },
          })
          if (fnError) throw fnError
          setEmailStatus({ state: 'success', message: `PDF downloaded. Email request submitted for ${analytics.studentEmail}.` })
        } catch (err) {
          console.warn('Report email dispatch failed:', err)
          setEmailStatus({ state: 'error', message: 'PDF downloaded, but email delivery could not be confirmed. You can retry using Email.' })
        }
      }
    } catch (err) {
      console.error('PDF export failed:', err)
      setEmailStatus({ state: 'error', message: 'PDF download failed. Please try again, or choose Print and save as PDF.' })
    } finally {
      exportInProgressRef.current = false
      setPdfGenerating(false)
    }
  }

  const visibleQuestions = useMemo(() => {
    if (!report) return []
    if (!filter) return report.questions
    return report.questions.filter((q: QuestionReviewItem) => {
      switch (filter.type) {
        case 'category':
          return q.category_name === filter.label
        case 'lesson':
          return q.lesson_name === filter.label
        case 'skill':
          return q.skill_name === filter.label
        case 'difficulty':
          return q.difficulty === filter.label.toLowerCase()
        default:
          return true
      }
    })
  }, [report, filter])

  function handleSelectTaxonomy(type: TaxonomyType, label: string) {
    setShowDetailedAnalysis(true)
    setFilter((prev) => (prev && prev.type === type && prev.label === label ? null : { type, label }))
    window.requestAnimationFrame(() => questionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  if (loading) return <ReportLoadingState />

  if (isAccessDenied) {
    return <ReportUnavailableState
      restricted
      title="Secure report access required"
      message={errorMessage || 'This report requires a valid student link or staff authorization.'}
    />
  }

  if (errorMessage || !report || !analytics) {
    return <ReportUnavailableState
      title="Report temporarily unavailable"
      message={errorMessage || 'The saved report could not be loaded.'}
      onRetry={() => setRetryKey((value) => value + 1)}
    />
  }

  const { student_info, overall, breakdowns, questions, courses, org_settings } = report
  const studentScore = studentScoreDisplay(report.scoring)
  const savedScoreMetrics = savedReportScoreMetrics(report.scoring)
  const isExamScheme = Boolean(studentScore?.maximum)
  const { domainPerf, timeAnalysis, threeState, studentName, completedLabel, durationLabel, avgTime } =
    analytics

  const shouldShowSection = (sectionId: ReportSectionId) => {
    if (templateConfig[sectionId] === false) return false

    const rule = templateConfig.sectionRules?.[sectionId]
    if (!rule || !rule.value.trim()) return true

    if (rule.metric === 'grade') {
      const grade = analytics.studentGrade.toLocaleLowerCase()
      const expected = rule.value.trim().toLocaleLowerCase()
      if (!grade) return false
      return rule.operator === 'equals' ? grade === expected : grade.includes(expected)
    }

    // A missing practice score must never be treated as zero or as a percentage.
    if (rule.metric === 'practiceScaledScore' && savedScoreMetrics.practiceScaledScore === null) return false
    const actualValue =
      rule.metric === 'practiceScaledScore'
        ? savedScoreMetrics.practiceScaledScore!
        : rule.metric === 'score'
        ? overall.percentage
        : rule.metric === 'totalTimeMinutes'
        ? student_info.total_time_seconds / 60
        : rule.metric === 'avgTimeSeconds'
        ? overall.avg_time_per_question
        : questions.length
    const expectedValue = Number(rule.value)
    if (!Number.isFinite(expectedValue)) return true
    if (rule.operator === 'lte') return actualValue <= expectedValue
    if (rule.operator === 'equals') return actualValue === expectedValue
    return actualValue >= expectedValue
  }
  const matchingFeedbackRules = (templateConfig.feedbackRules || []).filter(rule => {
    // Only publish meaningful, configured feedback; never expose a draft rule.
    if (!rule.enabled || !rule.criteria?.length) return false
    if (!rule.title?.trim() || /^new rule$/i.test(rule.title.trim())) return false
    if (!rule.message?.trim() && !rule.recommendation?.trim()) return false
    const matches = rule.criteria.map(criterion => {
      const value = criterion.metric === 'percentage' ? overall.percentage
        : criterion.metric === 'practiceScaledScore' ? savedScoreMetrics.practiceScaledScore
        : criterion.metric === 'correctCount' ? overall.correct_count
        : criterion.metric === 'incorrectCount' ? threeState.incorrectCount
        : threeState.unansweredCount
      if (value === null || value === undefined || !Number.isFinite(Number(value)) || !Number.isFinite(criterion.value)) return false
      if (criterion.operator === 'gte') return value >= criterion.value
      if (criterion.operator === 'lte') return value <= criterion.value
      return value === criterion.value
    })
    return rule.match === 'any' ? matches.some(Boolean) : matches.every(Boolean)
  })
  const isSectionFieldVisible = (sectionId: ReportSectionId, fieldId: string) =>
    templateConfig.sectionFields?.[sectionId]?.includes(fieldId) ?? true

  const displayedBreakdowns = breakdowns.filter((breakdown) => {
    if (breakdown.type === 'category') return isSectionFieldVisible('showTaxonomyTree', 'categories')
    if (breakdown.type === 'chapter' || breakdown.type === 'lesson') {
      return isSectionFieldVisible('showTaxonomyTree', 'lessons')
    }
    if (breakdown.type === 'skill') return isSectionFieldVisible('showTaxonomyTree', 'skills')
    return isSectionFieldVisible('showTaxonomyTree', 'otherTypes')
  })

  const categorySections = [
      {
        sectionId: 'showStrongDomains' as const,
        key: 'strong',
        tone: 'emerald',
        label: templateConfig.categoryLabels?.strong || 'Strong Domains',
        description: `Performance at or above the ${templateConfig.strongThreshold || CONFIG_STRONG_THRESHOLD}% benchmark`,
        items: domainPerf.strongDomains,
        emptyMessage: `No domains currently exceed the ${templateConfig.strongThreshold || CONFIG_STRONG_THRESHOLD}% threshold.`,
      },
      {
        sectionId: 'showWeakDomains' as const,
        key: 'weak',
        tone: 'rose',
        label: templateConfig.categoryLabels?.weak || 'Focus Areas',
        description: `Performance below the ${templateConfig.moderateThreshold || CONFIG_MODERATE_THRESHOLD}% benchmark`,
        items: domainPerf.weakDomains,
        emptyMessage: 'No domains require immediate reinforcement at this time.',
      },
    ]

  return (
    <div ref={reportCaptureRef} className="print-page ms-report-shell min-h-screen bg-slate-50 text-slate-900">
      {/* Top Banner when in Preview Mode */}
      {isPreview && (
        <div className="no-print bg-slate-900 text-white px-4 py-2.5 text-xs font-medium flex items-center justify-between shadow-xs sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="bg-blue-600 text-white px-2 py-0.5 rounded-md font-bold uppercase tracking-wider text-xs">
              Preview Mode
            </span>
            <span className="text-slate-200">
              Preview your report design
            </span>
          </div>
          <Link
            to="/admin/report-settings"
            className="inline-flex items-center gap-1.5 bg-white text-slate-900 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-slate-100 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-slate-600" />
            <span>Return to Report Settings</span>
          </Link>
        </div>
      )}

      {isStaff && !isPreview && attemptId && (
        <nav aria-label="Staff report navigation" className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-4 py-2.5 text-xs text-blue-950">
          <span className="font-semibold">Student report</span>
          <div className="flex flex-wrap gap-3">
            {reportAssessmentId && <Link className="font-semibold underline" to={`/admin/assessments/${reportAssessmentId}/results`}>Back to results</Link>}
            <Link className="font-semibold underline" to={`/admin/attempts/${attemptId}`}>Assessment details</Link>
          </div>
        </nav>
      )}
      {studentStudio && report && !isPreview && (
        <PublishedStudioReport template={studentStudio} report={report} />
      )}
      {isStaff && !studentStudio && publishedStudio && report && !isPreview && (
        <div className="no-print"><p className="mx-auto max-w-5xl px-4 pt-5 text-xs text-amber-800">Staff preview only — this is the organization's current template, not a version saved with this attempt. It will not be used for this report's PDF.</p><PublishedStudioReport template={publishedStudio} report={report} /></div>
      )}
      <ReportActionBar
        title={templateConfig.title || org_settings?.org_name || 'Diagnostic Performance Assessment'}
        subtitle={`${templateConfig.subtitle || 'Student Diagnostic Evaluation'} · ${student_info.assessment_name}`}
        date={completedLabel}
        busy={pdfGenerating}
        canEmail={Boolean(analytics.studentEmail)}
        preview={isPreview}
        onDownload={() => { void handleExportAndEmail(false) }}
        onEmail={() => { void handleExportAndEmail(true) }}
        onPrint={() => { setPrintDetailedAnalysis(true); window.requestAnimationFrame(() => window.print()) }}
      />
      {emailStatus.state !== 'idle' && <ReportStatusNotice
        tone={emailStatus.state}
        onDismiss={() => setEmailStatus({ state: 'idle' })}
      >{emailStatus.message}</ReportStatusNotice>}
      {studentStudio && !isPreview && (
        <div className="no-print mx-auto mt-4 flex max-w-5xl flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm text-slate-600">Need individual answers, explanations, or a more detailed breakdown?</p>
          <button type="button" aria-expanded={showDetailedAnalysis} aria-controls="report-detailed-analysis" onClick={() => setShowDetailedAnalysis(value => !value)} className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50">{showDetailedAnalysis ? 'Hide detailed analysis' : 'View detailed analysis'}</button>
        </div>
      )}
      <div id="report-detailed-analysis" className={studentStudio && !isPreview && !showDetailedAnalysis && !printDetailedAnalysis ? 'hidden print:block' : undefined}>
      <ReportQuickNavigation sections={[
        ...(shouldShowSection('showHeroMetrics') ? [{ id: 'report-overview', label: 'Overview' }] : []),
        ...(shouldShowSection('showThreeStateDonut') && !isExamScheme ? [{ id: 'report-breakdown', label: 'Score breakdown' }] : []),
        ...(shouldShowSection('showQuestionSolutions') ? [{ id: 'report-questions', label: 'Question review' }] : []),
        ...(shouldShowSection('showCourseRecommendations') ? [{ id: 'report-next-steps', label: 'Next steps' }] : []),
      ]} />

      {/* Main Printable Content Container */}
      <div className="ms-report-content mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {/* Teacher-authored setup guidance stays in Scoring & Criteria.
            It is not a student result and must not appear on report pages or PDFs. */}

        {matchingFeedbackRules.length > 0 && (
          <section className="space-y-3" aria-label="Personalized feedback">
            <h2 className="text-lg font-bold text-slate-900">Personalized performance feedback</h2>
            {matchingFeedbackRules.map(rule => (
              <div key={rule.id} className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <h3 className="font-bold text-slate-900">{rule.title}</h3>
                {rule.message && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{rule.message}</p>}
                {rule.recommendation && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-blue-800"><strong>Recommended next step: </strong>{rule.recommendation}</p>}
              </div>
            ))}
          </section>
        )}
        {/* Hero Section */}
        {shouldShowSection('showHeroMetrics') && (
          <section id="report-overview" className="ms-report-hero scroll-mt-28 rounded-3xl p-6 sm:p-9 text-white shadow-floating">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {isSectionFieldVisible('showHeroMetrics', 'banner') && <div className="text-xs font-medium uppercase tracking-wider text-white/80">
                {templateConfig.headerBannerText || 'Student Diagnostic Evaluation'}
              </div>}
              {isSectionFieldVisible('showHeroMetrics', 'classification') && (analytics.rubricTier?.name || overall.level?.name) && (
                <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
                  Tier: {analytics.rubricTier?.name || overall.level?.name}
                </span>
              )}
            </div>

            {isSectionFieldVisible('showHeroMetrics', 'studentName') && (
              <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">{studentName}</h1>
            )}
            {(isSectionFieldVisible('showHeroMetrics', 'assessmentName') ||
              isSectionFieldVisible('showHeroMetrics', 'completedDate')) && (
              <p className="mt-1 text-sm sm:text-base text-white/85">
                {isSectionFieldVisible('showHeroMetrics', 'assessmentName') && student_info.assessment_name}
                {isSectionFieldVisible('showHeroMetrics', 'assessmentName') &&
                  isSectionFieldVisible('showHeroMetrics', 'completedDate') && ' · '}
                {isSectionFieldVisible('showHeroMetrics', 'completedDate') && `Completed ${completedLabel}`}
              </p>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {isSectionFieldVisible('showHeroMetrics', 'score') && (
                <HeroMetric label={studentScore?.label || "Overall Score"} value={studentScore?.value || `${overall.percentage}%`} />
              )}
              {isSectionFieldVisible('showHeroMetrics', 'classification') && (
                <HeroMetric
                  label="Classification"
                  value={analytics.rubricTier?.name || overall.level?.name || 'Assessed'}
                />
              )}
              {isSectionFieldVisible('showHeroMetrics', 'duration') && (
                <HeroMetric label="Total Duration" value={durationLabel} />
              )}
              {isSectionFieldVisible('showHeroMetrics', 'questionCount') && (
                <HeroMetric label="Questions Assessed" value={`${questions.length}`} />
              )}
            </div>
          </section>
        )}

        {studentScore && <section id="saved-scoring" className="ms-report-score rounded-2xl border p-5 sm:p-6">
          <div className="ms-report-section-kicker">SCORE DETAILS</div>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{isExamScheme ? 'Practice exam result' : 'Assessment result'}</h2>
          {!(shouldShowSection('showHeroMetrics') && isSectionFieldVisible('showHeroMetrics', 'score')) && (
            <p className="ms-report-score-value mt-3 text-3xl font-bold tabular-nums">{studentScore.value}</p>
          )}
          {studentScore.lines.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{studentScore.lines.map((line,i)=><p key={i} className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-800">{line}</p>)}</div>}
          {studentScore.note && <p className="mt-3 text-xs text-slate-600">{studentScore.note}</p>}
        </section>}

        {/* Three-State Question Classification Donut & Breakdown */}
        {shouldShowSection('showThreeStateDonut') && !isExamScheme && (
          <section id="report-breakdown" className="scroll-mt-28">
            <div className="mb-2">
              <h2 className="text-lg font-semibold text-slate-900">Scoring & Response Status</h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Breakdown of questions answered correctly, incorrectly, or left unanswered
              </p>
            </div>
            <ThreeStateDonutChart
              correctCount={threeState.correctCount}
              incorrectCount={threeState.incorrectCount}
              unansweredCount={threeState.unansweredCount}
              total={threeState.total}
              visibleFields={templateConfig.sectionFields?.showThreeStateDonut}
            />
          </section>
        )}

        {categorySections.map((section) => {
          if (!shouldShowSection(section.sectionId)) return null

          const badgeTone =
            section.tone === 'emerald'
              ? 'bg-emerald-100 text-emerald-800'
              : section.tone === 'amber'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-rose-100 text-rose-800'

          const icon =
            section.tone === 'emerald' ? '✓' : section.tone === 'amber' ? '•' : '!'

          return (
            <section key={section.key} className="ms-report-panel rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        section.tone === 'emerald'
                          ? 'bg-emerald-100 text-emerald-700'
                          : section.tone === 'amber'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {icon}
                    </span>
                    <h2 className="text-lg font-semibold text-slate-900">{section.label}</h2>
                  </div>
                  <p className="mt-0.5 text-xs sm:text-sm text-slate-500">{section.description}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeTone}`}>
                  {section.items.length} {section.items.length === 1 ? 'Area' : 'Areas'}
                </span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {section.items.length === 0 ? (
                  <div className="col-span-2 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                    {section.emptyMessage}
                  </div>
                ) : (
                  section.items.map((domain) => (
                    <DomainCard
                      key={domain.domainId}
                      domain={domain}
                      type={section.tone === 'rose' ? 'weak' : section.tone === 'amber' ? 'moderate' : 'strong'}
                      visibleFields={templateConfig.sectionFields?.[section.sectionId]}
                      hideRawCounts={isExamScheme}
                    />
                  ))
                )}
              </div>
            </section>
          )
        })}

        {/* Time Analysis Section */}
        {shouldShowSection('showTimeAnalysis') && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <TimeAnalysisSection
              timeAnalysis={timeAnalysis}
              visibleFields={templateConfig.sectionFields?.showTimeAnalysis}
            />
          </section>
        )}

        {/* Taxonomy Hierarchy Tree */}
        {shouldShowSection('showTaxonomyTree') && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle
              title="Taxonomy & Curriculum Breakdown"
              subtitle="Explore your curriculum hierarchy — tap any category or skill to filter corresponding questions"
            />
            <div className="mt-4">
              <TaxonomyTree
                breakdowns={displayedBreakdowns}
                visibleFields={templateConfig.sectionFields?.showTaxonomyTree}
                hideRawCounts={isExamScheme}
                onSelect={handleSelectTaxonomy}
                activeFilter={filter}
              />
            </div>
          </section>
        )}

        {/* Diagnostic Behavior & Mistake Types */}
        {shouldShowSection('showErrorPatterns') && !isExamScheme && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle
              title="Error Pattern Diagnosis"
              subtitle="Distinguishing conceptual gaps from pacing and careless errors"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              {isSectionFieldVisible('showErrorPatterns', 'conceptual') && <ErrorChip
                label="Conceptual Gaps"
                count={analytics.conceptualErrors}
                tone="bg-rose-100 text-rose-700"
              />}
              {isSectionFieldVisible('showErrorPatterns', 'rushed') && <ErrorChip
                label="Rushed Mistakes (<25s)"
                count={overall.rushed_mistakes_count}
                tone="bg-amber-100 text-amber-700"
              />}
              {isSectionFieldVisible('showErrorPatterns', 'timesink') && <ErrorChip
                label="Timesink Mistakes (>100s)"
                count={overall.timesink_mistakes_count}
                tone="bg-sky-100 text-sky-700"
              />}
            </div>
            {isSectionFieldVisible('showErrorPatterns', 'summary') && <p className="mt-3 text-sm text-slate-600">
              Of {overall.incorrect_count} incorrect answers, {analytics.conceptualErrors} reflect
              conceptual difficulty, {overall.rushed_mistakes_count} were rushed carelessly, and{' '}
              {overall.timesink_mistakes_count} were lost to overthinking past 100 seconds.
            </p>}
          </section>
        )}

        {/* Question-by-Question Detailed Review */}
        {shouldShowSection('showQuestionSolutions') && (
          <section
            ref={questionsRef}
            id="report-questions"
            className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <SectionTitle
                title="Question Review"
                subtitle={
                  filter
                    ? `Filtered by ${filter.type}: ${filter.label}`
                    : 'Review each question, your recorded response, and the available diagnostic details'
                }
              />
              {filter && (
                <button
                  onClick={() => setFilter(null)}
                  className="no-print rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Clear filter
                </button>
              )}
            </div>

            <div className="mt-4 space-y-3">
              {visibleQuestions.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  No questions match your selection.
                </p>
              ) : (
                visibleQuestions.map((q: QuestionReviewItem) => (
                  <QuestionReviewCard
                    key={q.question_id}
                    question={q}
                    index={questions.indexOf(q)}
                    avgTime={avgTime}
                    highlight={!!filter}
                    visibleFields={templateConfig.sectionFields?.showQuestionSolutions}
                  />
                ))
              )}
            </div>
          </section>
        )}

        {/* Personalized Student Action Roadmap Section */}
        {shouldShowSection('showActionPlan') && matchedActionPlan && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-700 text-xs font-bold">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <h2 className="text-lg font-semibold text-slate-900">Your Learning Plan</h2>
                </div>
                <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
                  Suggested next steps based on your assessment results
                </p>
              </div>
              {isSectionFieldVisible('showActionPlan', 'audience') && <span className="self-start sm:self-auto rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-800">
                {matchedActionPlan.target_audience || 'Recommended plan'}
              </span>}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
              {isSectionFieldVisible('showActionPlan', 'title') && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h3 className="text-base font-bold text-slate-900">{matchedActionPlan.title}</h3>
                  <span className="text-xs font-semibold text-blue-600">{matchedActionPlan.tagline}</span>
                </div>
              )}
              {isSectionFieldVisible('showActionPlan', 'summary') && <p className="text-xs text-slate-600 leading-relaxed">
                {matchedActionPlan.summary}
              </p>}

              {/* Milestones */}
              {isSectionFieldVisible('showActionPlan', 'milestones') && matchedActionPlan.milestones?.length > 0 && (
                <div className="pt-3 border-t border-slate-200/80 space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                    Phased Milestone Progression
                  </span>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {matchedActionPlan.milestones.map((m, mIdx) => (
                      <div
                        key={mIdx}
                        className="rounded-xl border border-slate-200 bg-white p-3 space-y-1 text-xs shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-1 font-semibold text-slate-900">
                          <span className="flex items-center gap-1.5 truncate">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                              {mIdx + 1}
                            </span>
                            <span className="truncate">{m.title}</span>
                          </span>
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-600 shrink-0">
                            {m.timeframe}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 pl-6 leading-relaxed">
                          {m.description}
                        </p>
                        {m.tasks && m.tasks.length > 0 && (
                          <ul className="list-disc list-inside text-xs text-slate-600 pl-6 space-y-0.5 pt-1">
                            {m.tasks.map((task, ti) => (
                              <li key={ti}>{task}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Weekly Routine */}
              {isSectionFieldVisible('showActionPlan', 'routine') && matchedActionPlan.weekly_routine?.length > 0 && (
                <div className="pt-3 border-t border-slate-200/80 space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                    Recommended Study Rhythm
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {matchedActionPlan.weekly_routine.map((block, bi) => (
                      <div
                        key={bi}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                      >
                        <span className="font-semibold text-slate-800">{block.day_group}:</span>{' '}
                        <span className="text-slate-600">{block.focus}</span>{' '}
                        <span className="text-slate-400">({block.suggested_hours})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Advice */}
              {isSectionFieldVisible('showActionPlan', 'advice') && matchedActionPlan.prescriptive_advice?.length > 0 && (
                <div className="pt-3 border-t border-slate-200/80">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-slate-700 flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-emerald-950 block text-xs uppercase tracking-wider">
                        Helpful advice
                      </span>
                      <p className="italic text-slate-700 mt-0.5">
                        "{matchedActionPlan.prescriptive_advice[0]}"
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Actionable Recommendations & Courses */}
        {shouldShowSection('showCourseRecommendations') && (
          <section id="report-next-steps" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle
              title="Prescriptive Study Recommendations"
              subtitle="Tailored next steps based on your diagnostic results"
            />
            {isSectionFieldVisible('showCourseRecommendations', 'recommendation') && <p className="mt-2 text-sm text-slate-700 leading-relaxed">
              {analytics.rubricTier?.recommendation ||
                overall.level?.recommendation ||
                'Continue with the structured curriculum pathway, focusing primarily on the identified weak domains.'}
            </p>}
            {courses.length > 0 && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {courses.map((c: CourseItem) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                    {isSectionFieldVisible('showCourseRecommendations', 'courseName') && (
                      <div className="font-semibold text-slate-900">{c.name}</div>
                    )}
                    {isSectionFieldVisible('showCourseRecommendations', 'description') && <p className="mt-1 text-sm text-slate-600">
                      {c.description || 'Recommended remediation and practice course.'}
                    </p>}
                    {isSectionFieldVisible('showCourseRecommendations', 'enrollmentLink') && c.registration_url && (
                      <a
                        href={c.registration_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-xs font-semibold text-primary-600 hover:underline"
                      >
                        Enroll in Course &rarr;
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Footer Disclaimer */}
        {templateConfig.footerDisclaimer && (
          <div className="pt-4 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-400 italic">
              {templateConfig.footerDisclaimer}
            </p>
          </div>
        )}
      </div>
      </div>{/* Detailed legacy report */}
    </div>
  )
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-3.5 backdrop-blur-xs">
      <div className="text-xs font-medium uppercase tracking-wide text-white/70">{label}</div>
      <div className="mt-1 text-xl font-bold tracking-tight">{value}</div>
    </div>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
    </div>
  )
}

function ErrorChip({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${tone}`}>
      {label}: {count}
    </span>
  )
}
