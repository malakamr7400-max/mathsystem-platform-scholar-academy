import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  GraduationCap,
  KeyRound,
  Layers3,
  LockKeyhole,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext'
import {
  assessmentService,
  defaultAssessmentSettings,
  defaultSectionSettings,
  type Assessment,
  type AssessmentSection,
} from '../lib/assessmentService'

import { scoringLabels, type ScoringScheme } from '../lib/scoringSchemes'

type TimerMode = 'per_section' | 'per_assessment' | 'untimed'

const DEFAULT_INSTRUCTIONS =
  'Read each question carefully. Answer to the best of your ability and review your work before submitting.'

const initialForm = {
  scoringScheme: 'standard' as ScoringScheme,
  title: '',
  subtitle: '',
  subject: 'Mathematics',
  grade: 'Grade 10',
  description: '',
  instructions: DEFAULT_INSTRUCTIONS,
  timerMode: 'per_section' as TimerMode,
  overallMinutes: 60,
  sectionMinutes: 45,
  sectionTitle: 'Section 1: General Assessment',
  calculatorAllowed: true,
  attempts: 1,
  passcodeEnabled: false,
  passcode: '',
}

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50'

const labelClass = 'mb-1.5 block text-xs font-bold text-slate-700'

export const CreateAssessmentPage: React.FC = () => {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [isPersisting, setIsPersisting] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [persistStatus, setPersistStatus] = useState('')
  const [editorDestination, setEditorDestination] = useState<string | null>(null)

  // Retain the same assessment ID on retry. A server write might have succeeded
  // even when a subsequent read-back verification failed; never generate a new
  // assessment in that situation.
  const candidateIdRef = useRef<string | null>(null)
  const savedAssessmentRef = useRef<Assessment | null>(null)
  const savePromiseRef = useRef<Promise<Assessment> | null>(null)

  const update = <K extends keyof typeof initialForm>(key: K, value: (typeof initialForm)[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setOperationError(null)
  }

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form]
  )

  const validation = useMemo(() => {
    const issues: string[] = []
    if (!form.title.trim()) issues.push('Add an assessment title')
    if (!form.subject.trim()) issues.push('Add a subject')
    if (!form.grade.trim()) issues.push('Add a grade or level')
    if (!form.sectionTitle.trim()) issues.push('Name the first section')
    if (form.timerMode === 'per_section' && (!Number.isInteger(form.sectionMinutes) || form.sectionMinutes < 1 || form.sectionMinutes > 300)) {
      issues.push('Set the first section timer between 1 and 300 minutes')
    }
    if (form.timerMode === 'per_assessment' && (!Number.isInteger(form.overallMinutes) || form.overallMinutes < 1 || form.overallMinutes > 600)) {
      issues.push('Set the assessment timer between 1 and 600 minutes')
    }
    if (form.passcodeEnabled && !form.passcode.trim()) issues.push('Enter an access code')
    return issues
  }, [form])

  const buildDraft = (): Assessment => {
    if (validation.length > 0) throw new Error(validation.join('. ') + '.')

    const initialSection: AssessmentSection = {
      id: `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
      title: form.sectionTitle.trim(),
      description: '',
      displayOrder: 0,
      settings: {
        ...defaultSectionSettings,
        timingEnabled: form.timerMode === 'per_section',
        timeLimitMinutes: form.sectionMinutes,
        calculatorAllowed: form.calculatorAllowed,
      },
      questions: [],
    }

    const created = assessmentService.createAssessment({
      ...(candidateIdRef.current ? { id: candidateIdRef.current } : {}),
      title: form.title.trim(),
      subtitle: form.subtitle.trim(),
      subject: form.subject.trim(),
      grade: form.grade.trim(),
      description: form.description.trim(),
      instructions: form.instructions.trim(),
      status: 'draft',
      settings: {
        ...defaultAssessmentSettings,
        scoring: { scheme: form.scoringScheme, mode: 'default', sections: [] },
        timerMode: form.timerMode,
        timerEnabled: form.timerMode !== 'untimed',
        timerMinutes: form.overallMinutes,
        attempts: form.attempts,
        passcodeEnabled: form.passcodeEnabled,
        // Never store the legacy default '1234' for a newly created assessment.
        passcode: form.passcodeEnabled ? form.passcode.trim() : '',
      },
      sections: [initialSection],
    })
    candidateIdRef.current = created.id
    return created
  }

  const persistDraft = async (): Promise<Assessment> => {
    if (savedAssessmentRef.current) return savedAssessmentRef.current
    if (savePromiseRef.current) return savePromiseRef.current

    const promise = (async () => {
      setIsPersisting(true)
      setOperationError(null)
      setPersistStatus('Saving assessment...')
      let draft: Assessment | null = null
      try {
        draft = buildDraft()
        await assessmentService.syncAssessmentToDatabase(draft)
        savedAssessmentRef.current = draft
        setPersistStatus('Assessment saved.')
        return draft
      } catch (error) {
        if (draft) {
          // The database might already have committed the row. We only remove
          // the local cache entry, and retry with the SAME ID next time.
          assessmentService.saveStoredAssessments(
            assessmentService.getStoredAssessments().filter((item) => item.id !== draft!.id)
          )
        }
        throw error
      } finally {
        setIsPersisting(false)
        setPersistStatus('')
      }
    })()

    savePromiseRef.current = promise
    try {
      return await promise
    } finally {
      savePromiseRef.current = null
    }
  }

  const saveBeforeNavigation = async () => {
    if (!isDirty) return
    await persistDraft()
  }

  // Once Supabase confirms the draft is saved, it is no longer an unsaved
  // creation form. Let the navigation guard observe that clean state before
  // routing to the editor; otherwise React Router can block the redirect with
  // the stale dirty registration from the preceding render.
  const markClean = useUnsavedChanges(isDirty && editorDestination === null, saveBeforeNavigation)

  useEffect(() => {
    if (!editorDestination) return
    const navigationTimer = window.setTimeout(() => {
      navigate(`/admin/assessments/${editorDestination}`, { replace: true })
    }, 0)
    return () => window.clearTimeout(navigationTimer)
  }, [editorDestination, navigate])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPersisting || savePromiseRef.current) return
    if (validation.length > 0) {
      setOperationError(validation.join('. ') + '.')
      return
    }
    try {
      const saved = await persistDraft()
      markClean()
      // Commit the clean state first; the effect navigates after React has
      // updated the shared unsaved-changes guard.
      setEditorDestination(saved.id)
    } catch (error) {
      console.error('Assessment draft could not be saved:', error)
      const record = error as { message?: string; details?: string; hint?: string; code?: string }
      setOperationError(
        [record?.message, record?.details, record?.hint, record?.code ? `Code: ${record.code}` : null]
          .filter(Boolean)
          .join(' — ') || 'The draft could not be saved. Please try again.'
      )
    }
  }

  const timingLabel = form.timerMode === 'untimed'
    ? 'Untimed'
    : form.timerMode === 'per_assessment'
      ? `${form.overallMinutes || '—'} min overall`
      : `${form.sectionMinutes || '—'} min / section`

  return (
    <AdminLayout
      title="Create Assessment"
      subtitle="Set up the assessment, choose questions, and preview it before sharing."
      actions={
        <button
          type="button"
          onClick={() => navigate('/admin/assessments')}
          disabled={isPersisting}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" /> Assessment library
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="mx-auto max-w-6xl space-y-5 pb-10">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <label htmlFor="new-assessment-scoring" className="mb-2 block text-sm font-bold text-slate-900">Scoring scheme</label>
          <select id="new-assessment-scoring" aria-describedby="scoring-help" className={fieldClass} value={form.scoringScheme}
            onChange={event => update('scoringScheme', event.target.value as ScoringScheme)}>
            {Object.entries(scoringLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <p id="scoring-help" className="mt-2 text-xs leading-5 text-slate-600">Choose <strong>Standard</strong> for a regular classroom assessment. Use SAT, ACT, or EST only when preparing for that exam. Scaled scores are practice estimates unless you configure the appropriate conversion table later. Your choice does not change any previous student results.</p>
        </div>
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-slate-950 px-6 py-6 text-white sm:px-8 sm:py-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold tracking-wide text-blue-100">
                  <Sparkles className="h-3.5 w-3.5" /> NEW ASSESSMENT
                </span>
                <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl" style={{ color: '#ffffff' }}>
                  Create an assessment
                </h2>
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-300">
                  Give your assessment a name, choose its settings, and save a private draft. You can add questions and preview it before students see it.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-xs font-semibold text-slate-100">
                <ShieldCheck className="h-4 w-4 text-emerald-300" /> Not published
              </div>
            </div>
          </div>
          <div className="grid gap-3 border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600 sm:grid-cols-3 sm:px-8">
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> 1. Define the assessment</span>
            <span className="inline-flex items-center gap-2"><Layers3 className="h-4 w-4 text-blue-600" /> 2. Add questions in editor</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-slate-500" /> 3. Preview and publish</span>
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
          <div className="min-w-0 space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><GraduationCap className="h-5 w-5" /></div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Assessment details</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Give your assessment a clear name and audience.</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="assessment-title" className={labelClass}>Assessment title <span className="text-rose-600">*</span></label>
                  <input id="assessment-title" className={fieldClass} required maxLength={160} disabled={isPersisting}
                    placeholder="e.g. Algebra I Diagnostic — Fall 2026" value={form.title} onChange={(event) => update('title', event.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="assessment-subtitle" className={labelClass}>Subtitle <span className="font-normal text-slate-400">(optional)</span></label>
                  <input id="assessment-subtitle" className={fieldClass} disabled={isPersisting} maxLength={240}
                    placeholder="e.g. Equations, functions, and graphs" value={form.subtitle} onChange={(event) => update('subtitle', event.target.value)} />
                </div>
                <div>
                  <label htmlFor="assessment-subject" className={labelClass}>Subject <span className="text-rose-600">*</span></label>
                  <input id="assessment-subject" className={fieldClass} required disabled={isPersisting} value={form.subject}
                    onChange={(event) => update('subject', event.target.value)} />
                </div>
                <div>
                  <label htmlFor="assessment-grade" className={labelClass}>Grade / level <span className="text-rose-600">*</span></label>
                  <input id="assessment-grade" className={fieldClass} required disabled={isPersisting} value={form.grade}
                    onChange={(event) => update('grade', event.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="assessment-description" className={labelClass}>Description</label>
                  <textarea id="assessment-description" rows={3} className={fieldClass} disabled={isPersisting}
                    placeholder="What skills will this assessment measure?" value={form.description}
                    onChange={(event) => update('description', event.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="assessment-instructions" className={labelClass}>Student instructions</label>
                  <textarea id="assessment-instructions" rows={3} className={fieldClass} disabled={isPersisting}
                    value={form.instructions} onChange={(event) => update('instructions', event.target.value)} />
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600"><Layers3 className="h-5 w-5" /></div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Initial section</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Your draft starts with one empty section. Add questions after saving.</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label htmlFor="section-title" className={labelClass}>Section name <span className="text-rose-600">*</span></label>
                  <input id="section-title" className={fieldClass} required disabled={isPersisting} value={form.sectionTitle}
                    onChange={(event) => update('sectionTitle', event.target.value)} />
                </div>
                <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800">Calculator allowed</span>
                    <span className="mt-0.5 block text-xs text-slate-500">Show the on-screen calculator in this section.</span>
                  </span>
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-blue-600" checked={form.calculatorAllowed}
                    disabled={isPersisting} onChange={(event) => update('calculatorAllowed', event.target.checked)} />
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><Clock3 className="h-5 w-5" /></div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Timing & delivery</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Set a starting policy. Detailed rules remain editable later.</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="timer-mode" className={labelClass}>Timer mode</label>
                  <select id="timer-mode" className={fieldClass} disabled={isPersisting} value={form.timerMode}
                    onChange={(event) => update('timerMode', event.target.value as TimerMode)}>
                    <option value="per_section">Per-section timer</option>
                    <option value="per_assessment">Overall assessment timer</option>
                    <option value="untimed">No timer</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="allowed-attempts" className={labelClass}>Allowed attempts</label>
                  <select id="allowed-attempts" className={fieldClass} disabled={isPersisting} value={form.attempts}
                    onChange={(event) => update('attempts', Number(event.target.value))}>
                    <option value={1}>1 attempt</option>
                    <option value={2}>2 attempts</option>
                    <option value={3}>3 attempts</option>
                    <option value={0}>Unlimited attempts</option>
                  </select>
                </div>
                {form.timerMode === 'per_section' && (
                  <div className="sm:col-span-2">
                    <label htmlFor="section-minutes" className={labelClass}>First section time limit (minutes)</label>
                    <input id="section-minutes" type="number" min={1} max={300} required className={fieldClass} disabled={isPersisting}
                      value={form.sectionMinutes} onChange={(event) => update('sectionMinutes', Number(event.target.value))} />
                  </div>
                )}
                {form.timerMode === 'per_assessment' && (
                  <div className="sm:col-span-2">
                    <label htmlFor="overall-minutes" className={labelClass}>Overall time limit (minutes)</label>
                    <input id="overall-minutes" type="number" min={1} max={600} required className={fieldClass} disabled={isPersisting}
                      value={form.overallMinutes} onChange={(event) => update('overallMinutes', Number(event.target.value))} />
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><LockKeyhole className="h-5 w-5" /></div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Student access</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Optional access code. No default code is assigned.</p>
                </div>
              </div>
              <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-800">Require an access code</span>
                  <span className="mt-0.5 block text-xs text-slate-500">Students must enter this code to begin.</span>
                </span>
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-blue-600" disabled={isPersisting}
                  checked={form.passcodeEnabled} onChange={(event) => update('passcodeEnabled', event.target.checked)} />
              </label>
              {form.passcodeEnabled && (
                <div className="mt-4">
                  <label htmlFor="assessment-passcode" className={labelClass}>Access code <span className="text-rose-600">*</span></label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input id="assessment-passcode" className={`${fieldClass} pl-10`} type="text" required autoComplete="off"
                      disabled={isPersisting} placeholder="Choose a private access code" value={form.passcode}
                      onChange={(event) => update('passcode', event.target.value)} />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">Share this code only with the intended students.</p>
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900">Draft overview</h3>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Draft</span>
              </div>
              <p className="mt-3 break-words text-base font-bold text-slate-900">{form.title.trim() || 'Untitled assessment'}</p>
              <p className="mt-1 text-xs text-slate-500">{form.grade.trim() || 'No level'} · {form.subject.trim() || 'No subject'}</p>
              <div className="mt-4 space-y-3 border-y border-slate-100 py-4 text-xs">
                <div className="flex items-center justify-between gap-2 text-slate-600"><span className="inline-flex items-center gap-2"><Layers3 className="h-4 w-4" /> Sections</span><strong className="text-slate-900">1</strong></div>
                <div className="flex items-center justify-between gap-2 text-slate-600"><span className="inline-flex items-center gap-2"><BookOpen className="h-4 w-4" /> Questions</span><strong className="text-slate-900">0 — add next</strong></div>
                <div className="flex items-center justify-between gap-2 text-slate-600"><span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" /> Timing</span><strong className="text-right text-slate-900">{timingLabel}</strong></div>
                <div className="flex items-center justify-between gap-2 text-slate-600"><span className="inline-flex items-center gap-2"><FileText className="h-4 w-4" /> Attempts</span><strong className="text-slate-900">{form.attempts === 0 ? 'Unlimited' : form.attempts}</strong></div>
                <div className="flex items-center justify-between gap-2 text-slate-600"><span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4" /> Access</span><strong className="text-slate-900">{form.passcodeEnabled ? 'Code required' : 'Open'}</strong></div>
              </div>
              {validation.length === 0 ? (
                <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Ready to save as a draft.</p>
              ) : (
                <div className="mt-4 text-xs leading-5 text-slate-600">
                  <p className="font-bold text-slate-800">Before saving:</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">{validation.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                </div>
              )}
              <button type="submit" disabled={isPersisting || validation.length > 0}
                style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
                {isPersisting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save className="h-4 w-4" />}
                {isPersisting ? 'Saving draft...' : 'Create draft & open editor'}
                {!isPersisting && <ArrowRight className="h-4 w-4" />}
              </button>
              <p className="mt-3 text-center text-[11px] leading-4 text-slate-500">This only saves a private draft. You'll add questions and choose when to publish in the next screen.</p>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
              <div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" /> Existing student data is untouched</div>
              <p className="mt-1 text-blue-700">This creates a new draft. It does not edit existing assessments, student attempts, or scoring.</p>
            </div>
          </aside>
        </div>

        {operationError && (
          <div role="alert" aria-live="assertive" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">Could not save assessment draft</p>
              <p className="mt-1 break-words">{operationError}</p>
              <p className="mt-1 text-rose-700">Your changes are still here. Please try again.</p>
            </div>
            <button type="button" onClick={() => setOperationError(null)} className="font-bold underline">Dismiss</button>
          </div>
        )}
        {isPersisting && (
          <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-800">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
            {persistStatus || 'Saving your draft...'}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <span className="text-xs text-slate-500">{isDirty ? 'Unsaved draft changes' : 'New assessment'}</span>
          <button type="button" onClick={() => navigate('/admin/assessments')} disabled={isPersisting}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Back to library</button>
        </div>
      </form>
    </AdminLayout>
  )
}

export default CreateAssessmentPage
