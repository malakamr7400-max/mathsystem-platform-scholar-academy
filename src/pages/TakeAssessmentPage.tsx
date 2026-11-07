import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import StudentPostAssessmentSurveyModal from '../components/StudentPostAssessmentSurveyModal'
import { assessmentSurveyService } from '../lib/assessmentSurveyService'
import MathRenderer from '../components/MathRenderer'
import StudentAssessmentProgress from '../components/student/StudentAssessmentProgress'
import { calculateArithmetic } from '../lib/safeArithmetic'
import { countCompletedAnswers, finalSectionAction } from '../lib/studentFlowChecks'
import { readStudentAnswerDraft, writeStudentAnswerDraft, clearStudentAnswerDraft } from '../lib/studentAnswerDraft'
import { readStudentAttemptProgress, writeStudentAttemptProgress, clearStudentAttemptProgress, type StudentAttemptProgress } from '../lib/studentAttemptProgress'
import { getStudentRecovery, saveStudentRecovery } from '../lib/studentRecoveryService'
import { clearResumeBookmark, saveResumeBookmark } from '../lib/studentResumeBookmark'
import {
  ArrowRight,
  ArrowLeft,
  Image as ImageIcon,
  Maximize2,
  X,
  Clock,
  Calculator as CalcIcon,
  Coffee,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  BookOpen,
  Lightbulb,
  RotateCcw,
  Check,
  GraduationCap,
  Flag,
} from 'lucide-react'
import {
  assessmentService,
  type Assessment,
  type AssessmentSection,
  type SectionQuestionItem,
} from '../lib/assessmentService'
import { type QuestionBankItem } from '../lib/questionBankService'
import { assessmentVersionService } from '../lib/assessmentVersionService'
import { attemptService, describeAttemptError } from '../lib/attemptService'
import { useAuth } from '../contexts/AuthContext'

export const TakeAssessmentPage: React.FC<{ preview?: boolean }> = ({ preview = false }) => {
  const { attemptId, assessmentId } = useParams<{ attemptId: string; assessmentId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { session, profile, loading: authLoading } = useAuth()
  const role = profile?.role?.trim().toLowerCase()
  const staffSession = Boolean(session && (role === 'admin' || role === 'teacher'))
  // Fragment stays client-side (not sent in HTTP requests or Referer headers).
  const resumeToken = new URLSearchParams(window.location.hash.slice(1)).get('resume') || ''

  // Mode: Learning / Practice Mode (interactive explanations & instant feedback) vs Exam Mode
  // Keep the mode chosen at registration fixed for this session.
  // A mid-attempt toggle must not disable an active exam countdown.
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const requestedLearningMode = searchParams.get('mode') !== 'exam'
  // Ignore a manually edited ?mode=learning URL for a teacher-timed assessment.
  // A saved section countdown is mandatory even when an older assessment has
  // its overall timerMode stored as 'untimed'. Never trust ?mode=learning.
  const hasSavedSectionTimers = Boolean(assessment?.sections.some(
    (section) => section.settings.timingEnabled && section.settings.timeLimitMinutes > 0,
  ))
  const effectiveTimerMode = assessment?.settings.timerMode === 'per_assessment'
    ? 'per_assessment'
    : assessment?.settings.timerMode === 'per_section' || hasSavedSectionTimers
      ? 'per_section'
      : 'untimed'
  const isLearningMode = Boolean(assessment && effectiveTimerMode === 'untimed' && requestedLearningMode)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0)
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number | string>>({})
  const answersRef = useRef<Record<string, number | string>>({})
  const allowedQuestionIdsRef = useRef<string[]>([])
  const [draftRestored, setDraftRestored] = useState(false)
  const [draftStorageFailed, setDraftStorageFailed] = useState(false)
  const [isSurveyOpen, setIsSurveyOpen] = useState(false)
  const [resolvedQuestions, setResolvedQuestions] = useState<Map<string, QuestionBankItem>>(new Map())
  const [isSubmittingAttempt, setIsSubmittingAttempt] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [savedScorePct, setSavedScorePct] = useState<number | null>(null)
  const [trialCompleted, setTrialCompleted] = useState(false)
  const expiredSectionRef = useRef<number | null>(null)
  const submitInFlight = useRef(false)
  const submittedRef = useRef(false)
  const expiryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedAtRef = useRef<string | null>(null)
  const sectionDeadlineRef = useRef<number | null>(null)
  const breakDeadlineRef = useRef<number | null>(null)
  const progressReadyRef = useRef(false)
  const recoveryRevisionRef = useRef<number | null>(null)
  const savingRef = useRef(false)
  const dirtyRef = useRef(false)
  const recoveryReadyRef = useRef(false)
  const lastSavedPositionRef = useRef<StudentAttemptProgress | null>(null)
  const [autosaveStatus, setAutosaveStatus] = useState<'loading'|'saved'|'saving'|'unsaved'|'error'>('loading')
  const serverOffsetRef = useRef(0)
  const serverNow = () => Date.now() + serverOffsetRef.current
  const [previewZoomImage, setPreviewZoomImage] = useState<{ url: string; caption?: string } | null>(null)

  // Break / Intermission State
  const [isOnBreak, setIsOnBreak] = useState(false)
  const [optionalDecisionSection, setOptionalDecisionSection] = useState<number | null>(null)
  const [breakSecondsLeft, setBreakSecondsLeft] = useState(0)

  // Section Timer State
  const [sectionSecondsLeft, setSectionSecondsLeft] = useState(1800)
  const [overallSecondsLeft, setOverallSecondsLeft] = useState<number | null>(null)
  const [isTimeExpired, setIsTimeExpired] = useState(false)

  // On-screen calculator modal toggle
  const [showCalculator, setShowCalculator] = useState(false)
  const [calcInput, setCalcInput] = useState('')
  const [calcError, setCalcError] = useState<string | null>(null)
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false)
  const [answerNotice, setAnswerNotice] = useState<string | null>(null)
  const [flaggedQuestions, setFlaggedQuestions] = useState<string[]>([])

  // Require a real, persisted attempt. An assessment ID is a registration link, not an attempt ID.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadError(null)
      progressReadyRef.current = false
      recoveryReadyRef.current = false
      if (authLoading) return
      if (!preview && staffSession) {
        setLoadError('Signed-in staff cannot submit student attempts. Open Trial Preview from the assessment editor instead.')
        return
      }
      if (preview ? !assessmentId : !attemptId) {
        setLoadError(preview ? 'A saved assessment ID is required for trial preview.' : 'An attempt ID is required. Please open the assessment registration link.')
        return
      }
      try {
        let pinned
        if (preview) {
          // Read-only staff RPC. No attempt ID, registration, resume token,
          // score record or report is created by this preview.
          pinned = await assessmentVersionService.loadForStaffPreview(assessmentId!)
          startedAtRef.current = new Date().toISOString()
        } else {
          const attempt = await attemptService.loadAttemptById(attemptId!)
          if (!attempt) {
            const directAssessment = await assessmentService.fetchAssessmentById(attemptId!)
            if (directAssessment) {
              navigate(`/assessment/${directAssessment.id}?mode=${searchParams.get('mode') === 'exam' ? 'exam' : 'learning'}`, { replace: true })
              return
            }
            throw new Error('We could not find your assessment session. Please reopen your assessment link.')
          }
          if (attempt.status === 'completed') {
            clearStudentAnswerDraft(attempt.id)
            clearStudentAttemptProgress(attempt.id)
            clearResumeBookmark(attempt.assessment_id, attempt.id)
            navigate(`/report/${attempt.id}#token=${encodeURIComponent(resumeToken)}`, { replace: true })
            return
          }
          if (attempt.status !== 'in_progress') {
            throw new Error('This attempt is not active. Start a new attempt from the assessment registration link.')
          }
          pinned = await assessmentVersionService.loadForAttempt(attempt.id, resumeToken)
          if (pinned.assessment.id !== attempt.assessment_id) throw new Error('Attempt version does not match its assessment.')
          startedAtRef.current = attempt.started_at
          if (resumeToken) saveResumeBookmark(attempt.assessment_id, attempt.id, resumeToken, searchParams.get('mode') === 'exam' ? 'exam' : 'learning')
        }
        const target = pinned.assessment
        if (!target.sections.length || target.sections.some((section) => !section.questions.length)) {
          throw new Error('This assessment has an empty section and cannot be taken yet.')
        }
        // Questions, choices, correct keys, and explanations are pinned in the
        // immutable database version; live Question Bank edits cannot change them.
        const byId = pinned.questions
        const requiredIds = [...new Set(target.sections.flatMap((section) => section.questions.map((q) => q.questionId)))]
        const missing = requiredIds.filter((id) => !byId.has(id))
        if (missing.length) {
          throw new Error(`Assessment cannot start: ${missing.length} referenced question(s) are missing or inaccessible: ${missing.join(', ')}`)
        }
        const unsupported = requiredIds.filter((id) => byId.get(id)?.questionType === 'multi_select')
        if (unsupported.length) {
          throw new Error(`This assessment contains ${unsupported.length} multi-select question(s) that this player cannot answer yet.`)
        }
        for (const id of requiredIds) {
          const question = byId.get(id)!
          if (!question.prompt.trim() || question.prompt.trim() === 'Question Prompt') {
            throw new Error(`Question ${id} has no usable prompt in the pinned version.`)
          }
          if (question.questionType !== 'grid_in' && !question.choices.length) {
            throw new Error(`Question ${id} has no available answer options.`)
          }
        }
        if (cancelled) return
        // Only restore a draft AFTER the live attempt and its pinned version are verified.
        // Never load or persist student drafts during staff trial preview.
        const allowedIds = target.sections.flatMap((section) => section.questions.map((q) => q.id))
        allowedQuestionIdsRef.current = allowedIds
        // Server snapshot is authoritative when available; local tab storage is only a fallback.
        // Do not silently continue if the recovery RPC fails: it could lose saved answers.
        const recovery = !preview && attemptId ? await getStudentRecovery(attemptId, resumeToken) : null
        if (cancelled) return
        if (recovery) {
          serverOffsetRef.current = Date.parse(recovery.serverNow) - Date.now()
          recoveryRevisionRef.current = recovery.revision
          if (recovery.status !== 'in_progress') {
            clearResumeBookmark(target.id, attemptId!)
            navigate(`/report/${attemptId}#token=${encodeURIComponent(resumeToken)}`, { replace: true })
            return
          }
        }
        const localAnswers = !preview && attemptId ? readStudentAnswerDraft(attemptId, allowedIds) : {}
        const cloudAnswers: Record<string, number | string> = {}
        for (const [id, value] of Object.entries(recovery?.answers || {})) {
          if (allowedIds.includes(id) && (typeof value === 'number' || typeof value === 'string')) cloudAnswers[id] = value
        }
        // Prefer the server snapshot. Avoid merging stale local answers over confirmed server data.
        const restored = recovery ? cloudAnswers : localAnswers
        answersRef.current = restored
        setAnswers(restored)
        setDraftRestored(Object.keys(restored).length > 0)
        setResolvedQuestions(byId)
        setAssessment(target)
        const localProgress = !preview && attemptId ? readStudentAttemptProgress(attemptId, target.sections.length) : null
        const serverProgress = recovery?.position && Number.isInteger(recovery.position.sectionIndex) ? recovery.position as StudentAttemptProgress : null
        const savedProgress = serverProgress || localProgress
        const savedIndex = recovery ? recovery.sectionIndex : (savedProgress?.sectionIndex ?? 0)
        const activeSection = target.sections[savedIndex]
        const activeQuestion = Math.min(savedProgress?.questionIndex ?? 0, activeSection.questions.length - 1)
        setCurrentSectionIdx(savedIndex)
        setCurrentQuestionIdx(activeQuestion)
        setFlaggedQuestions((savedProgress?.flaggedQuestionIds || []).filter((id) => allowedIds.includes(id)))
        setOptionalDecisionSection(savedProgress ? savedProgress.optionalDecisionSection : activeSection.settings.optional === true ? savedIndex : null)
        setIsOnBreak(savedProgress?.onBreak === true)
        breakDeadlineRef.current = savedProgress?.breakDeadline ?? null
        setBreakSecondsLeft(Math.max(0, Math.ceil(((breakDeadlineRef.current ?? Date.now()) - Date.now()) / 1000)))
        const timedSections = target.settings.timerMode === 'per_section' || target.sections.some((section) => section.settings.timingEnabled && section.settings.timeLimitMinutes > 0)
        if (timedSections && activeSection.settings.timingEnabled) {
          // For the first section, the persisted attempt's start time is the timer origin.
          // Never start a fresh countdown when the tab reloads.
          const start = savedIndex === 0 && !preview ? Date.parse(startedAtRef.current || '') : Date.now()
          const origin = Number.isFinite(start) ? start : Date.now()
          sectionDeadlineRef.current = recovery
            ? (recovery.sectionDeadline ? Date.parse(recovery.sectionDeadline) : null)
            : (savedProgress?.sectionDeadline ??
              (activeSection.settings.optional && savedProgress?.optionalDecisionSection === savedIndex
                ? null : origin + activeSection.settings.timeLimitMinutes * 60_000))
          setSectionSecondsLeft(sectionDeadlineRef.current === null
            ? activeSection.settings.timeLimitMinutes * 60
            : Math.max(0, Math.ceil((sectionDeadlineRef.current - serverNow()) / 1000)))
        } else {
          sectionDeadlineRef.current = null
        }
        progressReadyRef.current = true
        recoveryReadyRef.current = Boolean(recovery)
        setAutosaveStatus(recovery ? 'saved' : 'loading')
        if (recovery?.expired && !preview) {
          // Never give a new timer after browser closure. The existing expiry handler
          // submits saved answers through the deadline-enforcing server RPC.
          setOverallSecondsLeft(target.settings.timerMode === 'per_assessment' ? 0 : null)
          if (target.settings.timerMode !== 'per_assessment') setSectionSecondsLeft(0)
        }
        if (target.settings.timerMode === 'per_assessment') {
          if (!startedAtRef.current) throw new Error('Assessment start time is unavailable; cannot safely resume its timer.')
          const elapsed = Math.max(0, Math.floor((serverNow() - Date.parse(startedAtRef.current)) / 1000))
          setOverallSecondsLeft(Math.max(0, target.settings.timerMinutes * 60 - elapsed))
        } else setOverallSecondsLeft(null)
      } catch (error) {
        if (!cancelled) setLoadError(describeAttemptError(error, 'Failed to load the assessment.'))
      }
    }
    void load()
    return () => { cancelled = true }
  }, [attemptId, assessmentId, preview, navigate, authLoading, staffSession])

  const captureRecoveryPosition = (): StudentAttemptProgress => ({
    sectionIndex: currentSectionIdx, questionIndex: currentQuestionIdx,
    sectionDeadline: sectionDeadlineRef.current, breakDeadline: breakDeadlineRef.current,
    onBreak: isOnBreak, optionalDecisionSection, flaggedQuestionIds: flaggedQuestions,
  })

  // One serial writer per browser tab. Autosaves are version checked to prevent
  // a stale tab from silently overwriting newer progress on another device.
  const flushRecovery = async (): Promise<boolean> => {
    if (preview || !attemptId || !resumeToken || !recoveryReadyRef.current || submittedRef.current) return true
    if (savingRef.current) return false
    if (!dirtyRef.current) return true
    if (recoveryRevisionRef.current === null) return false
    savingRef.current = true
    setAutosaveStatus('saving')
    const position = captureRecoveryPosition()
    const payload = { ...answersRef.current }
    dirtyRef.current = false
    try {
      const result = await saveStudentRecovery(attemptId, resumeToken, payload, position, recoveryRevisionRef.current)
      recoveryRevisionRef.current = result.revision
      lastSavedPositionRef.current = position
      if (result.sectionDeadline) sectionDeadlineRef.current = Date.parse(result.sectionDeadline)
      setAutosaveStatus(dirtyRef.current ? 'unsaved' : 'saved')
      return true
    } catch (error) {
      dirtyRef.current = true
      setAutosaveStatus('error')
      setSubmissionError(describeAttemptError(error, 'Could not autosave. Check your connection.'))
      return false
    } finally { savingRef.current = false }
  }

  useEffect(() => {
    if (preview || !assessment || !recoveryReadyRef.current || submittedRef.current) return
    dirtyRef.current = true
    setAutosaveStatus('unsaved')
    const timer = setTimeout(() => { void flushRecovery() }, 800)
    return () => clearTimeout(timer)
  }, [answers, currentSectionIdx, currentQuestionIdx, flaggedQuestions, isOnBreak, optionalDecisionSection, assessment])

  useEffect(() => {
    if (preview || !assessment) return
    const ticker = setInterval(() => { if (dirtyRef.current) void flushRecovery() }, 5000)
    const onVisible = () => { if (document.visibilityState === 'hidden' && dirtyRef.current) void flushRecovery() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(ticker); document.removeEventListener('visibilitychange', onVisible) }
  }, [attemptId, resumeToken, preview, assessment, answers, currentSectionIdx, currentQuestionIdx, isOnBreak, flaggedQuestions])

  // Restore section/question, break and timer deadlines after a reload. This deliberately
  // stores no resume token or scoring material and is scoped to this browser tab.
  useEffect(() => {
    if (preview || !attemptId || !assessment || !progressReadyRef.current || submittedRef.current) return
    writeStudentAttemptProgress(attemptId, {
      sectionIndex: currentSectionIdx,
      questionIndex: currentQuestionIdx,
      sectionDeadline: sectionDeadlineRef.current,
      breakDeadline: breakDeadlineRef.current,
      onBreak: isOnBreak,
      optionalDecisionSection,
      flaggedQuestionIds: flaggedQuestions,
    })
  }, [attemptId, assessment, preview, currentSectionIdx, currentQuestionIdx, isOnBreak, optionalDecisionSection, flaggedQuestions])

  // Unsubmitted answers are saved only in this browser tab, never in Supabase.
  useEffect(() => {
    if (submittedRef.current || Object.keys(answers).length === 0 || (!preview && !draftStorageFailed)) return
    const warnOnUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnOnUnload)
    return () => window.removeEventListener('beforeunload', warnOnUnload)
  }, [answers, isSurveyOpen, trialCompleted])

  useEffect(() => () => {
    if (expiryTimeoutRef.current !== null) clearTimeout(expiryTimeoutRef.current)
  }, [])

  // Active Section Timer (runs in Exam Mode, relaxed/untimed pace in Learning Mode)
  useEffect(() => {
    if (!assessment || effectiveTimerMode === 'per_assessment' || isOnBreak || optionalDecisionSection !== null || isLearningMode || isSurveyOpen || isSubmittingAttempt || sectionDeadlineRef.current === null) return
    const activeSec = assessment.sections[currentSectionIdx]
    if (!activeSec || !activeSec.settings.timingEnabled) return

    const update = () => {
      const deadline = sectionDeadlineRef.current
      if (deadline !== null) setSectionSecondsLeft(Math.max(0, Math.ceil((deadline - serverNow()) / 1000)))
    }
    update()
    const timer = setInterval(update, 1000)
    const onVisible = () => update()
    document.addEventListener('visibilitychange', onVisible)

    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [assessment, currentSectionIdx, isOnBreak, optionalDecisionSection, isLearningMode, isSurveyOpen, isSubmittingAttempt])

  // Trigger section expiry outside a React state updater, exactly once per section.
  useEffect(() => {
    if (!assessment || effectiveTimerMode === 'per_assessment' || isOnBreak || optionalDecisionSection !== null || isLearningMode || isSurveyOpen || isSubmittingAttempt || sectionSecondsLeft !== 0) return
    if (!assessment.sections[currentSectionIdx]?.settings.timingEnabled) return
    handleTimeExpired()
  }, [assessment, currentSectionIdx, sectionSecondsLeft, isOnBreak, optionalDecisionSection, isLearningMode, isSurveyOpen, isSubmittingAttempt])

  // The overall timer is based on the saved attempt start time: changing sections
  // or reloading does not grant a fresh time allowance.
  useEffect(() => {
    if (!assessment || effectiveTimerMode !== 'per_assessment' || isLearningMode || isSurveyOpen || isSubmittingAttempt) return
    const update = () => {
      const elapsed = Math.max(0, Math.floor((serverNow() - Date.parse(startedAtRef.current!)) / 1000))
      setOverallSecondsLeft(Math.max(0, assessment.settings.timerMinutes * 60 - elapsed))
    }
    update()
    const ticker = setInterval(update, 1000)
    return () => clearInterval(ticker)
  }, [assessment, isLearningMode, isSurveyOpen, isSubmittingAttempt])

  useEffect(() => {
    if (!assessment || effectiveTimerMode !== 'per_assessment' || isLearningMode || isSurveyOpen || isSubmittingAttempt || overallSecondsLeft !== 0) return
    // The full assessment expires rather than automatically advancing a section.
    void finishAssessment(true)
  }, [assessment, overallSecondsLeft, isLearningMode, isSurveyOpen, isSubmittingAttempt])

  // Break Timer
  useEffect(() => {
    if (!isOnBreak || breakSecondsLeft <= 0) return

    const update = () => {
      if (breakDeadlineRef.current !== null) setBreakSecondsLeft(Math.max(0, Math.ceil((breakDeadlineRef.current - serverNow()) / 1000)))
    }
    update()
    const timer = setInterval(update, 1000)

    return () => clearInterval(timer)
  }, [isOnBreak, breakSecondsLeft])

  const handleTimeExpired = () => {
    if (submitInFlight.current || submittedRef.current || isSurveyOpen || expiredSectionRef.current === currentSectionIdx) return
    expiredSectionRef.current = currentSectionIdx
    setShowSubmitConfirmation(false)
    setIsTimeExpired(true)
    // A timed section advances automatically; no student action is required.
    expiryTimeoutRef.current = setTimeout(() => {
      expiryTimeoutRef.current = null
      setIsTimeExpired(false)
      handleSectionComplete(true)
    }, 1500)
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm text-slate-700">{loadError}</p>
        </div>
      </div>
    )
  }

  if (preview && trialCompleted && assessment) {
    const total = assessment.sections.reduce((sum, section) => sum + section.questions.length, 0)
    const answered = Object.values(answers).filter((answer) => answer !== '' && answer !== null && answer !== undefined).length
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-3xl border border-emerald-200 p-8 space-y-5 text-center shadow-sm">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900">Preview complete</h1>
          <p className="text-sm text-slate-600">You answered {answered} of {total} questions.</p>
          <p className="text-sm font-semibold text-emerald-700">This preview does not affect student results.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button type="button" className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white" onClick={() => {
              submittedRef.current = false
              setTrialCompleted(false)
              answersRef.current = {}
              setAnswers({})
              setCurrentSectionIdx(0)
              setCurrentQuestionIdx(0)
              setIsOnBreak(false)
              setOptionalDecisionSection(assessment.sections[0].settings.optional === true ? 0 : null)
              setIsTimeExpired(false)
              expiredSectionRef.current = null
              setSectionSecondsLeft(assessment.sections[0].settings.timingEnabled ? assessment.sections[0].settings.timeLimitMinutes * 60 : 1800)
              if (effectiveTimerMode === 'per_assessment') startedAtRef.current = new Date().toISOString()
            }}>Try Again</button>
            <Link className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700" to={`/admin/assessments/${assessment.id}`}>Return to assessment</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!assessment || assessment.sections.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-xs font-medium text-slate-500">Preparing your assessment…</div>
      </div>
    )
  }

  const currentSection = assessment.sections[currentSectionIdx] || assessment.sections[0]
  const sectionQuestions = currentSection.questions || []
  const currentQuestionItem = sectionQuestions[currentQuestionIdx] || sectionQuestions[0]

  const resolvedQuestion = resolvedQuestions.get(currentQuestionItem?.questionId)
  if (!currentQuestionItem || !resolvedQuestion) {
    return <div role="alert" className="min-h-screen flex items-center justify-center p-6 text-red-700">
      A required question is unavailable. Answers have not been submitted. Please contact your instructor.
    </div>
  }

  const currentAnswer = answers[currentQuestionItem?.id]

  const handleSelectAnswer = (answer: number | string) => {
    setSubmissionError(null)
    setAnswerNotice(null)
    const nextAnswers = { ...answersRef.current, [currentQuestionItem.id]: answer }
    answersRef.current = nextAnswers
    setAnswers(nextAnswers)
    dirtyRef.current = true
    setAutosaveStatus('unsaved')
    // Save immediately when an answer changes; periodic retries cover poor connections.
    if (!preview) void flushRecovery()
    if (!preview && attemptId) {
      // Synchronous write: an immediate F5 after selecting an answer must not lose it.
      setDraftStorageFailed(!writeStudentAnswerDraft(attemptId, nextAnswers, allowedQuestionIdsRef.current))
    }
  }

  const handleNext = () => {
    if (submitInFlight.current || submittedRef.current || isSurveyOpen || isTimeExpired) return
    if (currentQuestionIdx < sectionQuestions.length - 1) {
      setCurrentQuestionIdx(currentQuestionIdx + 1)
    } else if (currentSectionIdx === assessment.sections.length - 1) {
      handleSectionComplete()
    } else {
      handleSectionComplete()
    }
  }

  const handlePrev = () => {
    if (!isTimeExpired && currentQuestionIdx > 0) {
      setCurrentQuestionIdx(currentQuestionIdx - 1)
    }
  }

  const handleSectionComplete = (timedExpiry = false) => {
    if (submitInFlight.current || submittedRef.current || isSurveyOpen) return
    const missing = currentSection.questions.filter((item) => {
      const value = answersRef.current[item.id]
      return value === undefined || value === null || String(value).trim() === ''
    })
    if (!timedExpiry && missing.length > 0) {
      setAnswerNotice(`Answer all ${missing.length} remaining question(s) before submitting this section. You can flag questions to revisit.`)
      setCurrentQuestionIdx(currentSection.questions.findIndex((item) => item.id === missing[0].id))
      return
    }
    const action = finalSectionAction(currentSectionIdx === assessment.sections.length - 1, timedExpiry)
    if (action === 'advance') {
      // Move to next section
      if (currentSection.settings.hasBreakAfter) {
        // Start intermission break
        setIsOnBreak(true)
        breakDeadlineRef.current = Date.now() + (currentSection.settings.breakDurationMinutes || 5) * 60_000
        setBreakSecondsLeft((currentSection.settings.breakDurationMinutes || 5) * 60)
      } else {
        advanceToNextSection()
      }
    } else if (action === 'submit') {
      // A timed exam must not wait for confirmation after the clock expires.
      void finishAssessment(timedExpiry)
    } else {
      setShowSubmitConfirmation(true)
    }
  }

  const advanceToNextSection = () => {
    setIsOnBreak(false)
    breakDeadlineRef.current = null
    const nextIdx = currentSectionIdx + 1
    setCurrentSectionIdx(nextIdx)
    setCurrentQuestionIdx(0)
    const nextSec = assessment.sections[nextIdx]
    setOptionalDecisionSection(nextSec?.settings.optional === true ? nextIdx : null)
    if (nextSec && effectiveTimerMode === 'per_section' && nextSec.settings.timingEnabled) {
      sectionDeadlineRef.current = nextSec.settings.optional ? null : Date.now() + nextSec.settings.timeLimitMinutes * 60_000
      setSectionSecondsLeft(nextSec.settings.timeLimitMinutes * 60)
    }
  }

  const finishAssessment = async (timedExpiry = false, declinedOptionalFrom: number | null = null) => {
    if (submitInFlight.current || submittedRef.current || isSurveyOpen) return
    if (!timedExpiry && assessment.sections.some((section, index) => (declinedOptionalFrom === null || index < declinedOptionalFrom) && section.questions.some((item) => {
      const value = answersRef.current[item.id]
      return value === undefined || value === null || String(value).trim() === ''
    }))) {
      setShowSubmitConfirmation(false)
      setAnswerNotice('Please answer all questions before submitting. Unanswered questions are only permitted when the timer expires.')
      return
    }
    if (preview) {
      submittedRef.current = true
      setTrialCompleted(true)
      return
    }
    if (staffSession) {
      setSubmissionError('Staff accounts cannot submit student attempts. Open Trial Preview instead.')
      return
    }
    if (!attemptId) {
      setSubmissionError('Your assessment session could not be found. Please reopen your assessment link.')
      return
    }
    submitInFlight.current = true
    setIsSubmittingAttempt(true)
    setSubmissionError(null)
    try {
      // Student metadata and start time come from the confirmed attempt, not defaults.
      const existing = await attemptService.loadAttemptById(attemptId)
      if (!existing || existing.status !== 'in_progress' || existing.assessment_id !== assessment.id) {
        throw new Error('An active attempt for this assessment could not be verified.')
      }
      const startedAt = startedAtRef.current || existing.started_at
      const started = Date.parse(startedAt)
      const elapsedSeconds = Number.isFinite(started)
        ? Math.max(0, Math.floor((Date.now() - started) / 1000))
        : 0
      // Never claim an unsynchronized answer set was safely backed up.
      // The final grading RPC still transmits the latest answers directly.
      if (dirtyRef.current) await flushRecovery()
      const saved = await attemptService.saveCompletedAttempt({
        attemptId,
        resumeToken,
        assessment,
        studentData: existing.registration_responses || {},
        answers,
        startedAt,
        totalTimeSeconds: elapsedSeconds,
      })
      submittedRef.current = true
      clearStudentAnswerDraft(attemptId)
      clearStudentAttemptProgress(attemptId)
      if (assessment) clearResumeBookmark(assessment.id, attemptId)
      setSavedScorePct(saved.percentage)
      setOptionalDecisionSection(null)
      // step92-3: assessment-scoped survey opt-in
      // A questionnaire is offered only when explicitly configured and activated.
      // Survey lookup failure never prevents a completed student from viewing the report.
      let hasEnabledSurvey = false
      try {
        const configuredSurvey = await assessmentSurveyService.fetchSurveyByAssessment(assessment.id)
        hasEnabledSurvey = configuredSurvey?.survey.isActive === true && configuredSurvey.questions.length > 0
      } catch (surveyError) {
        console.warn('Survey configuration unavailable; opening report instead.', surveyError)
      }
      if (hasEnabledSurvey) {
        setIsSurveyOpen(true)
      } else {
        navigate(`/report/${attemptId}#token=${encodeURIComponent(resumeToken)}`)
      }
    } catch (error) {
      const message = describeAttemptError(error, 'Could not save your attempt. Please retry.')
      if (message.startsWith('Score saved,')) {
        // The grading RPC confirmed completion; do not claim the attempt was
        // unsaved just because a second report read failed.
        submittedRef.current = true
        clearStudentAnswerDraft(attemptId)
        clearStudentAttemptProgress(attemptId)
        if (assessment) clearResumeBookmark(assessment.id, attemptId)
        navigate(`/report/${attemptId}#token=${encodeURIComponent(resumeToken)}`)
      } else {
        setSubmissionError(message)
      }
    } finally {
      submitInFlight.current = false
      setIsSubmittingAttempt(false)
    }
  }

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Calculator button handling
  const handleCalcPress = (val: string) => {
    setCalcError(null)
    if (val === 'C') { setCalcInput(''); return }
    if (val === '=') {
      try { setCalcInput(calculateArithmetic(calcInput)) }
      catch (error) { setCalcError(error instanceof Error ? error.message : 'Invalid calculation.') }
      return
    }
    setCalcInput((prev) => prev.length < 120 ? prev + val : prev)
  }

  const hasAnswer = (id: string) => answers[id] !== undefined && answers[id] !== null && String(answers[id]).trim() !== ''
  const allItems = assessment.sections.flatMap((section) => section.questions)
  const completionCounts = countCompletedAnswers(allItems.map((item) => item.id), answers)
  const totalAnswered = completionCounts.answered
  const sectionAnswers = sectionQuestions.map((item) => hasAnswer(item.id))
  const sectionUnanswered = sectionAnswers.filter((answered) => !answered).length
  const remainingTimerSeconds = Math.max(0, effectiveTimerMode === 'per_assessment' ? overallSecondsLeft ?? 0 : sectionSecondsLeft)
  const configuredTimerSeconds = effectiveTimerMode === 'per_assessment'
    ? Math.max(0, (assessment.settings.timerMinutes ?? 0) * 60)
    : Math.max(0, (currentSection.settings.timeLimitMinutes ?? 0) * 60)
  const timerUrgency = remainingTimerSeconds <= 60 || (configuredTimerSeconds > 0 && remainingTimerSeconds <= configuredTimerSeconds * 0.05)
    ? 'danger'
    : remainingTimerSeconds <= 300 || (configuredTimerSeconds > 0 && remainingTimerSeconds <= configuredTimerSeconds * 0.2)
      ? 'warning'
      : 'normal'

  // A teacher may mark trailing sections optional. Never offer early completion
  // when any later section is required: that would silently skip mandatory work.
  if (optionalDecisionSection === currentSectionIdx && currentSection.settings.optional === true && !isOnBreak) {
    const hasLaterRequired = assessment.sections.slice(currentSectionIdx + 1).some((section) => section.settings.optional !== true)
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
        <div role="dialog" aria-modal="true" aria-labelledby="optional-section-title"
          className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl space-y-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">Optional section</span>
          <h1 id="optional-section-title" className="text-2xl font-bold text-slate-900">
            Would you like to continue with {currentSection.title}?
          </h1>
          <p className="text-sm leading-relaxed text-slate-600">
            This section contains {currentSection.questions.length} questions.
            {hasLaterRequired
              ? ' You must finish the later required section before ending the assessment.'
              : ' You can complete this section or finish your assessment now.'}
          </p>
          {currentSection.description && <p className="text-sm text-slate-600">{currentSection.description}</p>}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => {
              if (effectiveTimerMode === 'per_section' && currentSection.settings.timingEnabled && sectionDeadlineRef.current === null) {
                sectionDeadlineRef.current = Date.now() + currentSection.settings.timeLimitMinutes * 60_000
                setSectionSecondsLeft(currentSection.settings.timeLimitMinutes * 60)
              }
              setOptionalDecisionSection(null)
            }}
              className="ms-student-primary rounded-xl px-5 py-3 text-sm font-semibold">
              Continue with section
            </button>
            {!hasLaterRequired && <button type="button" disabled={isSubmittingAttempt}
              onClick={() => { void finishAssessment(false, currentSectionIdx) }}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Finish assessment now
            </button>}
          </div>
          {submissionError && <p role="alert" className="text-sm text-rose-700">{submissionError}</p>}
        </div>
      </div>
    )
  }

  // Intermission Break Screen
  if (isOnBreak) {
    const nextSection = assessment.sections[currentSectionIdx + 1]

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-purple-50 border border-purple-100 flex items-center justify-center mx-auto text-purple-600">
            <Coffee className="h-8 w-8" />
          </div>

          <div>
            <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">
              Section break
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 mt-1">
              Section {currentSectionIdx + 1} complete
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {currentSection.settings.breakInstructions || 'Take a short break before continuing.'}
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-purple-50/50 border border-purple-100 flex flex-col items-center justify-center">
            <span className="text-xs text-purple-600 font-semibold uppercase tracking-wider">Break Timer</span>
            <span className="text-4xl font-black font-mono text-purple-900 mt-1">
              {formatTimer(breakSecondsLeft)}
            </span>
          </div>

          {nextSection && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs space-y-1">
              <span className="font-bold text-slate-700">Up Next: Section {currentSectionIdx + 2}</span>
              <p className="text-slate-500">{nextSection.title}</p>
              <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-600 font-medium">
                <span>{nextSection.questions.length} questions</span>
                <span>•</span>
                <span>{nextSection.settings.timingEnabled ? `${nextSection.settings.timeLimitMinutes} mins` : 'Untimed'}</span>
                <span>•</span>
                <span>{nextSection.settings.calculatorAllowed ? 'Calculator Allowed' : 'No Calculator'}</span>
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={advanceToNextSection}
              style={{ backgroundColor: '#7c3aed', color: '#ffffff' }}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              <span>Resume & Begin Section {currentSectionIdx + 2}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="ms-student-shell ms-student-player min-h-screen flex flex-col items-center gap-5 px-4 py-6 sm:px-8 sm:py-9">
      <header className="ms-student-player-header flex w-full max-w-4xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="ms-student-mark" aria-hidden="true"><GraduationCap className="h-5 w-5" /></span><div><p className="text-sm font-bold">MathSystem</p><p className="text-xs text-slate-500">{assessment.title}</p></div></div>
      </header>
      {preview && (
        <div className="max-w-2xl w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900 flex items-center justify-between gap-3 flex-wrap">
          <span>Teacher preview</span>
          <Link className="underline" to={`/admin/assessments/${assessment.id}`}>Return to assessment</Link>
        </div>
      )}
      {!preview && (
        <div role="status" aria-live="polite" className={`max-w-4xl w-full rounded-xl border px-4 py-2 text-xs font-medium ${autosaveStatus === 'error' || draftStorageFailed ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-slate-200 bg-white text-slate-600'}`}>
          {autosaveStatus === 'saved' ? 'Progress saved securely. You can reopen this assessment with the same link while time remains.'
            : autosaveStatus === 'saving' ? 'Saving your answers…'
            : autosaveStatus === 'unsaved' ? 'Recent changes are waiting to save. Keep the page open until saved.'
            : autosaveStatus === 'error' ? 'Autosave failed. Check your connection; do not close this page until saving resumes.'
            : 'Restoring your saved assessment progress…'}
          {draftStorageFailed && ' Local backup is unavailable.'}
        </div>
      )}
      <div className="w-full max-w-4xl">
        <StudentAssessmentProgress
          title={currentSection.title}
          sectionIndex={currentSectionIdx}
          sectionCount={assessment.sections.length}
          questionIndex={currentQuestionIdx}
          questionCount={sectionQuestions.length}
          sectionAnswers={sectionAnswers}
          totalAnswered={totalAnswered}
          totalQuestions={allItems.length}
          sectionUnanswered={sectionUnanswered}
          sectionFlagged={sectionQuestions.filter((item) => flaggedQuestions.includes(item.id)).length}
          timer={((effectiveTimerMode === 'per_assessment' || (currentSection.settings.timingEnabled && effectiveTimerMode === 'per_section')) && !isLearningMode) ? (
            <div role="timer" aria-label="Time remaining" className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 font-semibold tabular-nums shadow-sm ${timerUrgency === 'danger' ? 'border-rose-300 bg-rose-100 text-rose-800' : timerUrgency === 'warning' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-teal-200 bg-teal-50 text-teal-900'}`}>
              <Clock aria-hidden="true" className="h-4 w-4" />
              <span className="text-xs">Time left</span>
              <span className="text-lg font-bold font-mono tracking-wide">{formatTimer(remainingTimerSeconds)}</span>
            </div>
          ) : null}
        >
      <nav aria-label="Questions in this section" className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {sectionQuestions.map((item, index) => {
            const answered = hasAnswer(item.id)
            const flagged = flaggedQuestions.includes(item.id)
            const active = index === currentQuestionIdx
            return (
              <button key={item.id} type="button" disabled={isSubmittingAttempt || isTimeExpired}
                onClick={() => { setCurrentQuestionIdx(index); setAnswerNotice(null) }}
                aria-current={active ? 'step' : undefined}
                aria-label={`Question ${index + 1}: ${answered ? 'answered' : 'unanswered'}${flagged ? ', flagged' : ''}`}
                className={`relative min-h-11 min-w-11 cursor-pointer transition-colors hover:border-teal-400 hover:shadow-sm rounded-xl border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-50 ${active ? 'border-blue-700 bg-blue-700 text-white' : answered ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-700'}`}>
                {index + 1}{flagged && <Flag aria-hidden="true" className="absolute -right-1 -top-1 h-3.5 w-3.5 fill-amber-400 text-amber-600" />}
              </button>
            )
          })}
        </div>
      </nav>
        </StudentAssessmentProgress>
      </div>
      <article aria-label="Current assessment question" className="ms-student-question-card max-w-4xl w-full bg-white rounded-3xl p-6 sm:p-9 border space-y-7">
        {/* Top Header: Section Info, Question Count, Countdown Timer & Calculator */}
        <div className="flex items-center justify-between pb-5 border-b border-slate-100 flex-wrap gap-3">
          <span className="text-xs font-semibold tracking-wide text-teal-800">Question {currentQuestionIdx + 1}</span>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Question tools are grouped where students can find them. */}
            {currentSection.settings.calculatorAllowed ? (
              <button
                type="button"
                onClick={() => setShowCalculator((prev) => !prev)}
                aria-label={showCalculator ? 'Close calculator' : 'Open calculator'}
                aria-expanded={showCalculator}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${showCalculator ? 'border-teal-500 bg-teal-100 text-teal-900' : 'border-teal-200 bg-teal-50 text-teal-900 hover:border-teal-400 hover:bg-teal-100'}`}
                title={showCalculator ? 'Close calculator' : 'Open calculator'}
              >
                <CalcIcon className="h-4 w-4" aria-hidden="true" />
                <span>Calculator</span>
              </button>
            ) : null}

            <button
              type="button"
              disabled={isSubmittingAttempt || isTimeExpired}
              onClick={() => setFlaggedQuestions((prev) => prev.includes(currentQuestionItem.id) ? prev.filter((id) => id !== currentQuestionItem.id) : [...prev, currentQuestionItem.id])}
              aria-pressed={flaggedQuestions.includes(currentQuestionItem.id)}
              aria-label={flaggedQuestions.includes(currentQuestionItem.id) ? 'Remove flag from this question' : 'Flag this question for review'}
              title={flaggedQuestions.includes(currentQuestionItem.id) ? 'Remove flag from this question' : 'Flag this question for review'}
              className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed disabled:opacity-50 ${flaggedQuestions.includes(currentQuestionItem.id) ? 'border-amber-400 bg-amber-100 text-amber-950' : 'border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50'}`}
            >
              <Flag className={`h-4 w-4 ${flaggedQuestions.includes(currentQuestionItem.id) ? 'fill-amber-400' : ''}`} aria-hidden="true" />
              <span>{flaggedQuestions.includes(currentQuestionItem.id) ? 'Flagged' : 'Flag for review'}</span>
            </button>

          </div>
        </div>

        {/* Question Prompt */}
        <div className="space-y-4">
          <p className="ms-student-eyebrow">QUESTION {currentQuestionIdx + 1}</p>
          <div className="ms-student-question-text text-lg sm:text-xl font-semibold text-slate-900 leading-relaxed">
            <MathRenderer text={resolvedQuestion.prompt} />
          </div>
        </div>

        {/* Question Diagram */}
        {resolvedQuestion.imageUrl && (
          <div className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3 sm:p-4 text-center space-y-2 shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium pb-1.5 border-b border-slate-200/70">
              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                <ImageIcon className="h-3.5 w-3.5 text-blue-600" />
                Diagram
              </span>

            </div>
            <div className="relative group bg-white rounded-xl border border-slate-200/80 p-2 sm:p-3 overflow-hidden flex items-center justify-center">
              <img
                src={resolvedQuestion.imageUrl}
                alt={resolvedQuestion.imageCaption || 'Problem diagram'}
                className="w-full max-h-[350px] object-contain mx-auto rounded-lg"
              />
              <button
                type="button"
                onClick={() =>
                  setPreviewZoomImage({
                    url: resolvedQuestion.imageUrl!,
                    caption: resolvedQuestion.imageCaption,
                  })
                }
                className="absolute bottom-3 right-3 p-1.5 rounded-lg bg-white/90 hover:bg-white text-slate-700 border border-slate-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[11px] font-medium"
              >
                <Maximize2 className="h-3.5 w-3.5 text-blue-600" />
                <span>Enlarge</span>
              </button>
            </div>
            {resolvedQuestion.imageCaption && (
              <p className="text-xs text-slate-600 font-medium italic pt-1">
                Figure: <MathRenderer text={resolvedQuestion.imageCaption} />
              </p>
            )}
          </div>
        )}

        {/* Multiple Choice Options with Learning Feedback */}
        {resolvedQuestion.choices && resolvedQuestion.choices.length > 0 && (
          <div className="space-y-2.5">
            {resolvedQuestion.choices.map((opt, i) => {
              const isSelected = currentAnswer === i
              const btnClasses = isSelected
                ? 'border-teal-700 bg-emerald-50/60 text-slate-900 ring-2 ring-emerald-700/15'
                : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              const badgeClasses = isSelected
                ? 'bg-teal-700 text-white'
                : 'bg-slate-100 text-slate-600'

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectAnswer(i)}
                  aria-pressed={isSelected}
                  aria-label={`Option ${String.fromCharCode(65 + i)}${isSelected ? ", selected" : ""}`}
                  disabled={isSubmittingAttempt || isTimeExpired}
                  className={`ms-student-choice w-full min-h-16 text-left p-4 sm:p-5 rounded-2xl border text-sm sm:text-base font-medium transition cursor-pointer flex items-center gap-4 focus-visible:outline-none disabled:opacity-60 ${btnClasses}`}
                >
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${badgeClasses}`}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1">
                    <MathRenderer text={opt.text} />
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {resolvedQuestion.questionType === 'grid_in' && (
          <div className="space-y-2">
            <label htmlFor="numeric-answer" className="text-xs font-semibold text-slate-700">
              Your numeric answer
            </label>
            <input
              id="numeric-answer"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={typeof currentAnswer === 'string' ? currentAnswer : ''}
              onChange={(event) => handleSelectAnswer(event.target.value)}
              disabled={isSubmittingAttempt || isTimeExpired}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
              placeholder="Enter a number or fraction (e.g. 5/2)"
            />
          </div>
        )}

        {isTimeExpired && (
          <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Time is up for this section. Moving forward automatically…</p>
        )}

        {answerNotice && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">{answerNotice}</p>
        )}

        {isSubmittingAttempt && (
          <div role="status" aria-live="polite" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-900">
            Submitting your assessment…
          </div>
        )}

        {submissionError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <strong>We couldn't submit your assessment.</strong> {submissionError} Your answers are still here. Please try again.
          </div>
        )}

        {/* Navigation Footer */}
        <div className="ms-student-actions pt-5 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            disabled={currentQuestionIdx === 0 || isSubmittingAttempt || isTimeExpired}
            onClick={handlePrev}
            className="ms-student-secondary inline-flex min-h-11 items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-semibold disabled:opacity-40 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Previous</span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={isSubmittingAttempt || showSubmitConfirmation || isTimeExpired}
            className="ms-student-primary inline-flex min-h-11 items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <span>
              {isSubmittingAttempt ? 'Submitting…' : currentQuestionIdx < sectionQuestions.length - 1
                ? 'Next question'
                : currentSectionIdx < assessment.sections.length - 1
                ? 'Continue to next section'
                : preview ? 'Finish preview' : 'Submit Assessment'}
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </article>

      {/* Floating On-Screen Calculator (if calculator allowed) */}
      {showCalculator && currentSection.settings.calculatorAllowed && (
        <div className="fixed bottom-4 right-4 z-40 w-[min(20rem,calc(100vw-2rem))] max-h-[min(32rem,calc(100dvh-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl space-y-3 sm:bottom-6 sm:right-6 sm:p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <CalcIcon className="h-4 w-4 text-teal-700" />
              <span>Standard Calculator</span>
            </span>
            <button
              type="button"
              onClick={() => setShowCalculator(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              aria-label="Close calculator"
            >
              ✕
            </button>
          </div>

          <div className="bg-slate-50 rounded-xl px-3 py-3 text-right font-mono font-semibold text-lg tabular-nums text-slate-900 border border-slate-200 min-h-[56px] flex items-center justify-end overflow-x-auto">
            {calcInput || '0'}
          </div>
          {calcError && <p role="alert" className="text-xs text-red-700">{calcError}</p>}

          <div className="grid grid-cols-4 gap-2 text-base font-semibold">
            {['7', '8', '9', '/'].map((btn) => (
              <button
                key={btn}
                onClick={() => handleCalcPress(btn)}
                className="min-h-11 rounded-xl bg-slate-100 text-slate-800 transition-colors hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                {btn}
              </button>
            ))}
            {['4', '5', '6', '*'].map((btn) => (
              <button
                key={btn}
                onClick={() => handleCalcPress(btn)}
                className="min-h-11 rounded-xl bg-slate-100 text-slate-800 transition-colors hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                {btn}
              </button>
            ))}
            {['1', '2', '3', '-'].map((btn) => (
              <button
                key={btn}
                onClick={() => handleCalcPress(btn)}
                className="min-h-11 rounded-xl bg-slate-100 text-slate-800 transition-colors hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                {btn}
              </button>
            ))}
            {['0', '.', 'C', '+'].map((btn) => (
              <button
                key={btn}
                onClick={() => handleCalcPress(btn)}
                className="min-h-11 rounded-xl bg-slate-100 text-slate-800 transition-colors hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                {btn}
              </button>
            ))}
            <button
              onClick={() => handleCalcPress('=')}
              className="col-span-4 min-h-11 rounded-xl bg-teal-700 text-base font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              =
            </button>
          </div>
        </div>
      )}

      {/* Final review is local only; the server still grades on submission. */}
      {showSubmitConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="final-review-title" className="w-full max-w-md space-y-5 rounded-3xl bg-white p-6 sm:p-8 shadow-2xl">
            <div className="space-y-2">
              <p className="ms-student-eyebrow">BEFORE YOU SUBMIT</p>
              <h2 id="final-review-title" className="text-xl font-bold text-slate-900">{preview ? 'Finish staff trial?' : 'Submit your assessment?'}</h2>
              <p className="text-sm leading-relaxed text-slate-600">{preview ? 'This preview will end without saving student results.' : 'You won’t be able to change your answers after submitting.'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-2xl font-bold text-emerald-800 tabular-nums">{totalAnswered}</p>
                <p className="text-xs text-emerald-800">Answered</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-2xl font-bold text-amber-800 tabular-nums">{completionCounts.unanswered}</p>
                <p className="text-xs text-amber-800">Unanswered</p>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowSubmitConfirmation(false)} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Review answers</button>
              <button type="button" onClick={() => { setShowSubmitConfirmation(false); void finishAssessment() }} className="ms-student-primary rounded-xl px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">{preview ? 'Finish trial' : 'Submit now'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Assessment Survey Modal */}
      {!preview && <StudentPostAssessmentSurveyModal
        attemptId={attemptId!}
        resumeToken={resumeToken}
        scorePct={savedScorePct ?? 0}
        assessmentTitle={assessment.title}
        isOpen={isSurveyOpen}
        onComplete={() => navigate(`/report/${attemptId}#token=${encodeURIComponent(resumeToken)}`)}
        onSkip={() => navigate(`/report/${attemptId}#token=${encodeURIComponent(resumeToken)}`)}
      />}

      {/* Lightbox Zoom Modal */}
      {previewZoomImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewZoomImage(null)}
        >
          <div
            className="max-w-4xl w-full bg-white rounded-3xl p-5 border border-slate-200 shadow-2xl relative space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800">Diagram View</span>
              <button
                type="button"
                onClick={() => setPreviewZoomImage(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 font-bold"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src={previewZoomImage.url}
              alt={previewZoomImage.caption || 'Zoomed diagram'}
              className="w-full max-h-[70vh] object-contain rounded-xl"
            />
            {previewZoomImage.caption && (
              <p className="text-xs text-slate-600 italic text-center font-medium">
                {previewZoomImage.caption}
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

export default TakeAssessmentPage
