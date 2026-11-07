import React, { useState, useEffect, useRef } from 'react'

import { useParams, useNavigate, useSearchParams } from 'react-router-dom'

import { assessmentService, type Assessment } from '../lib/assessmentService'

import { attemptService, describeAttemptError } from '../lib/attemptService'
import { getStudentRecovery } from '../lib/studentRecoveryService'
import { readResumeBookmark, saveResumeBookmark, clearResumeBookmark } from '../lib/studentResumeBookmark'
import { isUnusableResumeBookmarkError } from '../lib/studentResumeError'

import { questionBankService } from '../lib/questionBankService'

import { supabase } from '../lib/supabaseClient'

import { useAuth } from '../contexts/AuthContext'

import StudentRegistrationChecklist from '../components/student/StudentRegistrationChecklist'

import { checkStudentRegistration, getStudentIdentity } from '../lib/studentFlowChecks'

import {

  Clock,

  Layers,

  FileText,

  Calculator,

  Lock,

  ArrowRight,

  AlertCircle,

  Coffee,

  CheckCircle2,

  GraduationCap,

  Sparkles,

} from 'lucide-react'



export const StudentAssessmentPage: React.FC = () => {

  const { assessmentId } = useParams<{ assessmentId: string }>()

  const navigate = useNavigate()

  const [searchParams] = useSearchParams()

  const { session, profile, loading: authLoading } = useAuth()

  const staffRole = profile?.role?.trim().toLowerCase()

  const isStaff = Boolean(session && (staffRole === 'admin' || staffRole === 'teacher'))



  // A staff session never creates a student registration, even when a teacher

  // pastes the public shared link into their own signed-in browser.

  useEffect(() => {

    if (!authLoading && isStaff && assessmentId) {

      navigate(`/admin/assessments/${assessmentId}/preview?mode=${searchParams.get('mode') === 'exam' ? 'exam' : 'learning'}`, { replace: true })

    }

  }, [authLoading, isStaff, assessmentId, navigate, searchParams])



  const [assessment, setAssessment] = useState<Assessment | null>(null)

  const [selectedMode, setSelectedMode] = useState<'learning' | 'exam'>(

    () => searchParams.get('mode') === 'exam' ? 'exam' : 'learning'

  )

  const [formData, setFormData] = useState<Record<string, string>>({})

  const [registrationSettingsError, setRegistrationSettingsError] = useState(false)
  const [registrationSettingsReady, setRegistrationSettingsReady] = useState(false)
  const [intakeFields, setIntakeFields] = useState<

    Array<{

      id: string

      label: string

      field_key: string

      type: string

      required: boolean

      options?: string[] | null

    }>

  >([])

  const [passcode, setPasscode] = useState('')

  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)

  const startInFlight = useRef(false)

  const [invalidFieldId, setInvalidFieldId] = useState<string | null>(null)

  const [resumeChecking, setResumeChecking] = useState(false)
  const [resumeProblem, setResumeProblem] = useState<string | null>(null)

  // A public /assessment/:id link is NOT the secure attempt link. On the
  // original device, look up its previously saved token and verify with
  // the server before returning to /take/:attemptId.
  useEffect(() => {
    if (!assessmentId || authLoading || isStaff) return
    const saved = readResumeBookmark(assessmentId)
    if (!saved) return
    let cancelled = false
    setResumeChecking(true)
    setResumeProblem(null)
    void (async () => {
      try {
        const recovery = await getStudentRecovery(saved.attemptId, saved.resumeToken)
        if (cancelled) return
        if (recovery.status === 'completed') {
          clearResumeBookmark(assessmentId, saved.attemptId)
          return
        }
        if (recovery.status !== 'in_progress') {
          clearResumeBookmark(assessmentId, saved.attemptId)
          return
        }
        // Even if expired, enter the same attempt so server-side expiry
        // submission can run; never create a second attempt or reset time.
        navigate(`/take/${saved.attemptId}?mode=${saved.mode}#resume=${encodeURIComponent(saved.resumeToken)}`, { replace: true })
      } catch (error: unknown) {
        if (cancelled) return
        if (isUnusableResumeBookmarkError(error)) {
          // Server explicitly rejected this saved attempt/token pair.
          // The browser reference cannot resume it. Allow fresh registration,
          // but NEVER clear a bookmark for a network or unknown server error.
          clearResumeBookmark(assessmentId, saved.attemptId)
          setResumeProblem(null)
        } else {
          setResumeProblem('We could not check your previous assessment right now. Check your connection and select Retry recovery. Your saved recovery link has been kept.')
        }
      } finally {
        if (!cancelled) setResumeChecking(false)
      }
    })()
    return () => { cancelled = true }
  }, [assessmentId, authLoading, isStaff, navigate])




  useEffect(() => {
    let cancelled = false
    setRegistrationSettingsReady(false)
    setRegistrationSettingsError(false)
    setIntakeFields([])
    setFormData({})

    async function loadData() {

      if (authLoading || isStaff) return

      if (!assessmentId) { setErrorMessage('The assessment link is missing its ID. Request a new link from your instructor.'); return }

      let data: Assessment | null = null

      try {

        data = await assessmentService.fetchAssessmentById(assessmentId)

      } catch (error) {

        setErrorMessage(error instanceof Error ? error.message : 'Unable to load this assessment. Please try again.')

        return

      }



      if (cancelled) return
      if (data) {

        setAssessment(data)



        // Use this assessment's field choices, matched to its organization's field definitions.

        // Never load fields from another organization's workspace.

        type IntakeField = { id: string; label: string; field_key: string; type: string; required: boolean; options?: string[] | null }
        type WorkspaceField = { field_key: string; label: string; field_type: string; is_required: boolean; is_active: boolean; options?: string[] | null }

        let resolvedFields: IntakeField[] = []


        const configured = data.settings.studentFields || []

        try {

          const { data: assessmentRow, error: assessmentError } = await supabase

            .from('assessments').select('organization_id').eq('id', data.id).single()

          if (assessmentError) throw assessmentError

          const { data: fields, error } = await supabase

            .from('registration_fields').select('field_key,label,field_type,is_required,is_active,options')

            .eq('organization_id', assessmentRow.organization_id).order('display_order')

          if (error) throw error
          if (cancelled) return

          if (fields?.length) {

            resolvedFields = (fields as WorkspaceField[]).filter((field: WorkspaceField) => {

              if (!field.is_active) return false

              const override = configured.find(item => item.id === field.field_key)

              return override ? override.enabled : field.is_active

            }).map((field: WorkspaceField) => {

              const override = configured.find(item => item.id === field.field_key)

              return {

                id: field.field_key,

                label: field.label,

                field_key: field.field_key,

                type: field.field_type,

                required: override?.required ?? Boolean(field.is_required),

                options: field.options,

              }

            })

          }

        } catch (error) {
          if (cancelled) return
          console.error('Unable to load registration settings:', error)
          setRegistrationSettingsError(true)
          setErrorMessage('Registration is temporarily unavailable. Please try again later.')
          return
        }
        setRegistrationSettingsError(false)



        setIntakeFields(resolvedFields)

        const initialForm: Record<string, string> = {}

        resolvedFields.forEach((f) => {

          initialForm[f.field_key] = ''

        })

        setFormData(initialForm)
        setRegistrationSettingsReady(true)

      } else {

        setErrorMessage(`Assessment "${assessmentId}" not found.`)

      }

    }



    void loadData()
    return () => { cancelled = true }

  }, [assessmentId, authLoading, isStaff])



  const handleInputChange = (fieldId: string, value: string) => {

    setFormData((prev) => ({ ...prev, [fieldId]: value }))

    setInvalidFieldId(null)

    setErrorMessage(null)

  }



  // Check the current database immediately before creating an attempt. This

  // prevents broken assessment references from creating empty registrations.

  const verifyQuestionsBeforeRegistration = async (current: Assessment): Promise<void> => {

    if (current.sections.length === 0 || current.sections.some((section) => section.questions.length === 0)) {

      throw new Error('This assessment has no questions in one or more sections. Ask the administrator to add valid questions.')

    }

    const requiredIds = [...new Set(current.sections.flatMap((section) =>

      section.questions.map((question) => question.questionId)

    ))]

    const liveQuestions = await questionBankService.fetchQuestionsFromDatabase()

    const availableIds = new Set(liveQuestions.map((question) => question.id))

    const missing = requiredIds.filter((id) => !availableIds.has(id))

    if (missing.length > 0) {

      throw new Error(

        `This assessment cannot start because ${missing.length} question(s) are unavailable. ` +

        'Please ask your teacher to check the questions.'

      )

    }

  }



  const handleStart = async (e: React.FormEvent) => {

    e.preventDefault()

    if (resumeChecking || resumeProblem) return
    if (!assessment || !registrationSettingsReady || registrationSettingsError || submitting || startInFlight.current) return

    if (authLoading || isStaff) {

      setErrorMessage('To review this assessment as a teacher, open its preview from your dashboard.')

      return

    }



    const registrationCheck = checkStudentRegistration(intakeFields, formData)

    if (!registrationCheck.valid) {

      setInvalidFieldId(registrationCheck.firstInvalidField)

      setErrorMessage(registrationCheck.message)

      if (registrationCheck.firstInvalidField) {

        document.getElementById(`registration-${registrationCheck.firstInvalidField}`)?.focus()

      }

      return

    }



    // Access code is checked locally as in the existing student flow.

    if (assessment.settings.passcodeEnabled && passcode.trim() !== assessment.settings.passcode.trim()) {

      setErrorMessage('Invalid assessment access passcode. Please check with your instructor.')

      document.getElementById('student-assessment-passcode')?.focus()

      return

    }



    startInFlight.current = true

    setSubmitting(true)

    setErrorMessage(null)

    const attemptId = crypto.randomUUID()

    const identity = getStudentIdentity(formData, intakeFields)

    const studentName = identity.name

    const studentEmail = identity.email



    // Start only after Supabase confirms the active attempt exists.

    try {

      const latest = await assessmentService.fetchAssessmentById(assessment.id)

      if (!latest) throw new Error('This assessment is no longer available.')

      await verifyQuestionsBeforeRegistration(latest)

      const started = await attemptService.saveActiveAttempt({

        id: attemptId,

        assessment_id: assessment.id,

        assessment_name: latest.title,

        student_name: studentName,

        student_email: studentEmail,

        registration_responses: formData,

        started_at: new Date().toISOString(),

      })

      // The bookmark is device-local and contains the capability token.
      // Never save it on staff preview and never log the token.
      saveResumeBookmark(assessment.id, attemptId, started.resumeToken, teacherRequiresTiming ? 'exam' : selectedMode)
      navigate(`/take/${attemptId}?mode=${teacherRequiresTiming ? 'exam' : selectedMode}#resume=${started.resumeToken}`)

    } catch (error) {

      console.error('Supabase could not start the assessment attempt:', error)

      setErrorMessage(describeAttemptError(error, 'Unable to start the attempt. Please retry.'))

      setSubmitting(false)

    } finally {

      startInFlight.current = false

    }

  }



  if (errorMessage && !assessment) {

    return (

      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">

        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 text-center space-y-4 shadow-sm">

          <AlertCircle className="h-12 w-12 text-rose-500 mx-auto" />

          <h2 className="text-base font-bold text-slate-900">Diagnostic Not Available</h2>

          <p className="text-xs text-slate-500">{errorMessage}</p>

          <p className="text-sm text-slate-600">Ask your instructor for a working assessment link, or retry if the connection failed.</p>

          <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">Try again</button>

        </div>

      </div>

    )

  }



  if (!assessment) {

    return (

      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">

        <div className="text-xs font-medium text-slate-500">Loading assessment...</div>

      </div>

    )

  }



  // A teacher-defined timed assessment cannot be switched into untimed Learning Mode.
  const teacherRequiresTiming = assessment.settings.timerMode !== 'untimed' || assessment.sections.some(
    (section) => section.settings.timingEnabled && section.settings.timeLimitMinutes > 0,
  )
  const effectiveMode: 'learning' | 'exam' = teacherRequiresTiming ? 'exam' : selectedMode

  const totalQuestions = assessment.sections.reduce((sum, sec) => sum + sec.questions.length, 0)

  const totalDuration =

    assessment.settings.timerMode === 'per_assessment'

      ? assessment.settings.timerMinutes

      : assessment.sections.reduce(

          (sum, sec) => sum + (sec.settings.timingEnabled ? sec.settings.timeLimitMinutes : 0),

          0

        )



  return (

    <div className="ms-student-shell min-h-screen flex flex-col justify-between px-4 py-6 sm:px-8 sm:py-10">

      <main id="student-main" className="max-w-4xl w-full mx-auto space-y-6">

        <header className="ms-student-topbar flex flex-wrap items-center justify-between gap-3 px-1">

          <div className="flex items-center gap-3">

            <span className="ms-student-mark" aria-hidden="true"><GraduationCap className="h-5 w-5" /></span>

            <div><p className="text-sm font-bold tracking-tight">MathSystem</p><p className="text-xs">Your assessment space</p></div>

          </div>

          <span className="ms-student-topbar-note"><Lock className="h-3.5 w-3.5" aria-hidden="true" /> Your teacher's assessment</span>

        </header>

        {/* Assessment overview */}

        <section aria-labelledby="assessment-title" className="ms-student-card ms-student-overview rounded-3xl p-6 sm:p-9 space-y-6">

          <p className="ms-student-eyebrow">YOUR ASSESSMENT</p>

          <div className="flex items-center justify-between flex-wrap gap-2">

            <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">

              {assessment.grade} • {assessment.subject}

            </span>

            <span className="text-xs font-medium text-slate-500 flex items-center gap-1">

              <Clock className="h-3.5 w-3.5 text-amber-500" />

              {totalDuration > 0 ? `${totalDuration} mins total` : 'Untimed'}

            </span>

          </div>



          <div>

            <h1 id="assessment-title" className="ms-student-title text-2xl sm:text-4xl font-bold leading-tight">

              {assessment.title}

            </h1>

            {assessment.subtitle && (

              <p className="mt-2 text-sm leading-6 text-slate-600">{assessment.subtitle}</p>

            )}

          </div>

          <div className="ms-student-facts grid grid-cols-2 gap-3 sm:grid-cols-3">

            <div><span className="text-xs">Questions</span><strong>{totalQuestions}</strong></div>

            <div><span className="text-xs">Sections</span><strong>{assessment.sections.length}</strong></div>

            <div><span className="text-xs">Timed limit</span><strong>{totalDuration > 0 ? `${totalDuration} min` : 'None'}</strong></div>

          </div>



          {assessment.description && (

            <p className="text-sm text-slate-600 leading-7 bg-slate-50 p-4 rounded-2xl border border-slate-100">

              {assessment.description}

            </p>

          )}



          <div className="ms-guide p-4 sm:p-5" aria-label="Assessment steps">

            <p className="text-base font-bold">Three simple steps</p>

            <ol className="mt-3 grid gap-3 sm:grid-cols-3">

              <li className="flex items-start gap-2.5"><span className="ms-guide-number">1</span><span className="text-sm leading-relaxed">Review your teacher's instructions.</span></li>

              <li className="flex items-start gap-2.5"><span className="ms-guide-number">2</span><span className="text-sm leading-relaxed">Enter your details and choose how to work.</span></li>

              <li className="flex items-start gap-2.5"><span className="ms-guide-number">3</span><span className="text-sm leading-relaxed">Answer the questions and submit.</span></li>

            </ol>

          </div>



          {/* Test Structure Preview */}

          <div className="space-y-3 pt-2">

            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">

              <Layers className="h-3.5 w-3.5 text-blue-600" />

              <span>What you'll work on</span>

            </h2>



            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {assessment.sections.map((sec, idx) => (

                <div

                  key={sec.id}

                  className="ms-student-section p-4 rounded-2xl border bg-white space-y-3"

                >

                  <div className="flex items-center justify-between">

                    <span className="text-sm font-semibold text-slate-900">

                      {idx + 1}. {sec.title}

                    </span>

                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">

                      {sec.questions.length} questions

                    </span>

                  </div>



                  <div className="flex items-center gap-2 text-xs text-slate-600">

                    <span className="flex items-center gap-1">

                      <Clock className="h-3 w-3 text-slate-400" />

                      {sec.settings.timingEnabled ? `${sec.settings.timeLimitMinutes} mins` : 'Untimed'}

                    </span>

                    <span>•</span>

                    <span className="flex items-center gap-1">

                      <Calculator className="h-3 w-3 text-slate-400" />

                      {sec.settings.calculatorAllowed ? 'Calculator Allowed' : 'No Calculator'}

                    </span>

                  </div>



                  {sec.settings.hasBreakAfter && (

                    <div className="text-[10px] text-purple-700 bg-purple-50 px-2 py-1 rounded-lg flex items-center gap-1">

                      <Coffee className="h-3 w-3" />

                      <span>{sec.settings.breakDurationMinutes}-minute intermission after section</span>

                    </div>

                  )}

                </div>

              ))}

            </div>

          </div>



          {/* General Directions */}

          {assessment.instructions && (

            <div className="ms-student-instructions p-5 rounded-2xl text-sm space-y-2">

              <span className="font-bold flex items-center gap-1.5">

                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />

                Instructions from your teacher

              </span>

              <p className="text-sm leading-7 text-slate-700 whitespace-pre-wrap">{assessment.instructions}</p>

            </div>

          )}

        </section>



        {/* Student Intake Form & Passcode */}

        <form

          onSubmit={handleStart}

          className="ms-student-card ms-student-registration rounded-3xl p-6 sm:p-9 space-y-6"

        >

          <div className="border-b border-slate-100 pb-3">

            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">

              <GraduationCap className="h-4 w-4 text-blue-600" />

              <span>Before you begin</span>

            </h2>

            <p className="text-sm text-slate-600 mt-2 leading-6">

              Enter your details and start your assessment.

            </p>

          </div>



          {resumeChecking && (
            <div role="status" className="p-3.5 rounded-2xl border border-blue-200 bg-blue-50 text-blue-800 text-sm">
              Checking for your unfinished assessment…
            </div>
          )}
          {resumeProblem && (
            <div role="alert" className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 text-sm space-y-2">
              <p>{resumeProblem}</p>
              <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Retry recovery</button>
              <p className="text-xs">If this is a shared computer, ask your teacher before starting a different student attempt.</p>
            </div>
          )}
          {errorMessage && (

            <div role="alert" className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">

              <AlertCircle className="h-4 w-4 shrink-0" />

              <span>{errorMessage}</span>

            </div>

          )}



          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {intakeFields.map((f) => (

              <div

                key={f.id}

                className={

                  f.field_key === 'full_name' || f.field_key === 'name' ? 'sm:col-span-2' : ''

                }

              >

                <label htmlFor={`registration-${f.id}`} className="block text-sm font-semibold text-slate-700 mb-1.5">

                  {f.label} {f.required && <span className="text-rose-500">*</span>}

                </label>

                {(f.type === 'dropdown' || f.type === 'select') && f.options && f.options.length > 0 ? (

                  <select

                    id={`registration-${f.id}`}

                    required={f.required}

                    aria-invalid={invalidFieldId === f.id}

                    value={formData[f.field_key] || ''}

                    onChange={(e) => handleInputChange(f.field_key, e.target.value)}

                    className="ms-student-field w-full rounded-xl border px-4 py-3 text-sm bg-white focus:outline-none"

                  >

                    <option value="">Select {f.label}</option>

                    {f.options.map((opt) => (

                      <option key={opt} value={opt}>

                        {opt}

                      </option>

                    ))}

                  </select>

                ) : (

                  <input

                    id={`registration-${f.id}`}

                    type={f.type === 'phone' ? 'tel' : f.type === 'email' ? 'email' : f.type === 'number' ? 'number' : 'text'}

                    required={f.required}

                    aria-invalid={invalidFieldId === f.id}

                    value={formData[f.field_key] || ''}

                    onChange={(e) => handleInputChange(f.field_key, e.target.value)}

                    placeholder={`Enter your ${f.label.toLowerCase()}`}

                    className="ms-student-field w-full rounded-xl border px-4 py-3 text-sm focus:outline-none"

                  />

                )}

              </div>

            ))}



            {/* Passcode Field */}

            {assessment.settings.passcodeEnabled && (

              <div className="sm:col-span-2 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">

                <label className="block text-xs font-semibold text-slate-700 flex items-center gap-1.5">

                  <Lock className="h-3.5 w-3.5 text-slate-500" />

                  <span>Access code from your teacher <span className="text-rose-500">*</span></span>

                </label>

                <input

                  id="student-assessment-passcode"

                  type="password"

                  autoComplete="off"

                  required

                  value={passcode}

                  onChange={(e) => { setPasscode(e.target.value); setErrorMessage(null) }}

                  placeholder="Enter the code your teacher shared"

                  className="ms-student-field w-full sm:w-72 rounded-xl border px-4 py-3 text-sm font-semibold tracking-widest focus:outline-none"

                />

              </div>

            )}

          </div>



          {/* Teacher-timed assessments do not offer an untimed Learning Mode. */}
          {teacherRequiresTiming ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Clock className="h-4 w-4" /> Timed assessment</div>
              <p className="mt-1 text-sm text-slate-600">Your teacher has set the timing for this assessment. The countdown starts when you begin.</p>
            </div>
          ) : (
          <div className="pt-2 border-t border-slate-100 space-y-2.5">

            <label className="block text-sm font-bold text-slate-800">

              Choose how you would like to work

            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              <button

                type="button"

                onClick={() => setSelectedMode('learning')}

                aria-pressed={selectedMode === 'learning'}

                className={`ms-student-mode p-5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${

                  selectedMode === 'learning'

                    ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20'

                    : 'border-slate-200 hover:bg-slate-50'

                }`}

              >

                <div className="flex items-center justify-between mb-1.5">

                  <span className="text-sm font-bold text-emerald-900 flex items-center gap-1.5">

                    <Sparkles className="h-4 w-4 text-emerald-600" />

                    Learning mode

                  </span>

                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">

                    Recommended

                  </span>

                </div>

                <p className="text-sm text-slate-600 leading-6">

                  Practice at your own pace. You can review feedback and explanations after you submit your answers.

                </p>

              </button>



              <button

                type="button"

                onClick={() => setSelectedMode('exam')}

                aria-pressed={selectedMode === 'exam'}

                className={`ms-student-mode p-5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${

                  selectedMode === 'exam'

                    ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20'

                    : 'border-slate-200 hover:bg-slate-50'

                }`}

              >

                <div className="flex items-center justify-between mb-1.5">

                  <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">

                    <Clock className="h-4 w-4 text-blue-600" />

                    Use saved section timers

                  </span>

                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">

                    Formal

                  </span>

                </div>

                <p className="text-sm text-slate-600 leading-6">

                  Follow the section timers saved by your teacher, where available. Results appear after submission.

                </p>

              </button>

            </div>

          </div>
          )}



          <StudentRegistrationChecklist

            completedRequired={intakeFields.filter((field) => field.required && Boolean(formData[field.field_key]?.trim())).length}

            totalRequired={intakeFields.filter((field) => field.required).length}

            passcodeRequired={assessment.settings.passcodeEnabled}

            passcodeEntered={Boolean(passcode.trim())}

            mode={effectiveMode}

          />



          <div className="pt-3 border-t border-slate-100 flex justify-end">

            <button

              type="submit"

              disabled={submitting || resumeChecking || Boolean(resumeProblem) || !registrationSettingsReady || registrationSettingsError}

              className="ms-student-primary inline-flex min-h-12 items-center justify-center gap-3 px-7 py-3 rounded-xl text-sm font-semibold transition cursor-pointer disabled:opacity-50"

            >

              <span>

                {submitting ? 'Starting…' : !registrationSettingsReady && !registrationSettingsError ? 'Loading registration settings…' : effectiveMode === 'learning' ? 'Start practice' : 'Start assessment'}

              </span>

              <ArrowRight className="h-4 w-4" />

            </button>

          </div>

        </form>

      </main>



    </div>

  )

}



export default StudentAssessmentPage
