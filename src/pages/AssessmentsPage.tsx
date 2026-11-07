import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  FileQuestion,
  FileText,
  Filter,
  Layers3,
  MoreHorizontal,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import ShareAssessmentModal from '../components/ShareAssessmentModal'
import { assessmentService, type Assessment, type AssessmentDeletionImpact } from '../lib/assessmentService'
import { questionBankService } from '../lib/questionBankService'
import { validateAssessmentBlueprint, materializeBlueprint, type ValidatedBlueprint } from '../lib/fullAssessmentImport'

type StatusFilter = 'all' | Assessment['status']
type SortOrder = 'updated' | 'name' | 'questions'

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const problem = error as Record<string, unknown>
    const fields: string[] = []
    for (const key of ['message', 'details', 'hint', 'code']) {
      const value = problem[key]
      if (typeof value === 'string' && value.trim()) {
        fields.push(key === 'message' ? value : `${key}: ${value}`)
      }
    }
    if (fields.length) return fields.join(' | ')
    try { return JSON.stringify(error) ?? 'Unexpected error. Please try again.' }
    catch { return 'Unexpected error. Please try again.' }
  }
  return 'Unexpected error. Please try again.'
}

function dateLabel(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function countQuestions(assessment: Assessment): number {
  return assessment.sections.reduce((total, section) => total + (section.questions?.length ?? 0), 0)
}

function timeLabel(assessment: Assessment): string {
  if (!assessment.settings.timerEnabled || assessment.settings.timerMode === 'untimed') return 'Untimed'
  if (assessment.settings.timerMode === 'per_assessment') {
    return assessment.settings.timerMinutes > 0 ? `${assessment.settings.timerMinutes} min` : 'Untimed'
  }
  const minutes = assessment.sections.reduce(
    (total, section) => total + (section.settings.timingEnabled ? section.settings.timeLimitMinutes : 0),
    0,
  )
  return minutes > 0 ? `${minutes} min` : 'Untimed'
}

function StatusPill({ status }: { status: Assessment['status'] }) {
  const styles = {
    published: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    draft: 'bg-amber-50 text-amber-700 ring-amber-200',
    archived: 'bg-slate-100 text-slate-600 ring-slate-200',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset ${styles[status]}`}>
      {status}
    </span>
  )
}

export default function AssessmentsPage() {
  const navigate = useNavigate()
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortOrder>('updated')
  const [shareTarget, setShareTarget] = useState<Assessment | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [blueprintPreview, setBlueprintPreview] = useState<ValidatedBlueprint | null>(null)
  const [pendingBlueprintJson, setPendingBlueprintJson] = useState('')
  const [importProgress, setImportProgress] = useState('')
  const [importing, setImporting] = useState(false)
  // step90-5: library removal dialog (avoids browser-blocked window.prompt)
  const [removeTarget, setRemoveTarget] = useState<Assessment | null>(null)
  const [removeConfirm, setRemoveConfirm] = useState('')
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Assessment | null>(null)
  const [deleteImpact, setDeleteImpact] = useState<AssessmentDeletionImpact | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleteStudentData, setDeleteStudentData] = useState(false)

  const reload = useCallback(async () => {
    // Supabase is authoritative: do not show a stale local list as current data.
    const list = await assessmentService.fetchAssessmentsFromDatabase()
    setAssessments(list)
  }, [])

  useEffect(() => {
    let active = true
    assessmentService.fetchAssessmentsFromDatabase()
      .then((list) => { if (active) setAssessments(list) })
      .catch((cause: unknown) => { if (active) setError(`Could not load assessments: ${errorMessage(cause)}`) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const refresh = async () => {
    if (refreshing || loading || busyId) return
    setRefreshing(true)
    setError(null)
    try { await reload() } catch (cause) { setError(`Could not refresh assessments: ${errorMessage(cause)}`) }
    finally { setRefreshing(false) }
  }

  // step90-6: synchronize removed assessment state with the menu and filters.
  const visibleAssessments = useMemo(() => assessments.map((item) =>
    item.removedFromLibrary && item.status !== 'archived'
      ? { ...item, status: 'archived' as const } : item), [assessments])

  const counts = useMemo(() => ({
    all: visibleAssessments.length,
    published: visibleAssessments.filter((a) => a.status === 'published').length,
    draft: visibleAssessments.filter((a) => a.status === 'draft').length,
    archived: visibleAssessments.filter((a) => a.status === 'archived').length,
  }), [visibleAssessments])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return visibleAssessments
      .filter((assessment) => {
        const text = `${assessment.title} ${assessment.subtitle ?? ''} ${assessment.subject} ${assessment.grade}`.toLocaleLowerCase()
        return (!query || text.includes(query)) && (status === 'all' || assessment.status === status)
      })
      .sort((a, b) => {
        if (sort === 'name') return a.title.localeCompare(b.title)
        if (sort === 'questions') return countQuestions(b) - countQuestions(a)
        return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)
      })
  }, [visibleAssessments, search, status, sort])

  const duplicate = async (assessment: Assessment) => {
    setBusyId(assessment.id)
    setError(null)
    try {
      const copy = await assessmentService.duplicateAssessmentAndPersist(assessment.id)
      await reload()
      navigate(`/admin/assessments/${copy.id}`)
    } catch (cause) { setError(`Couldn't duplicate “${assessment.title}”: ${errorMessage(cause)}`) }
    finally { setBusyId(null) }
  }

  const remove = async () => {
    if (!removeTarget || busyId || removeConfirm !== 'REMOVE') return
    const assessment = removeTarget
    setBusyId(assessment.id)
    setRemoveError(null)
    setError(null)
    try {
      await assessmentService.deleteAssessment(assessment.id)
      setAssessments((old) => old.map((item) => item.id === assessment.id
        ? { ...item, status: 'archived', removedFromLibrary: true } : item))
      setNotice(`“${assessment.title}” was removed from the active library. Questions and student records remain intact.`)
      setRemoveTarget(null)
      setRemoveConfirm('')
    } catch (cause) {
      const details = cause && typeof cause === 'object' ? cause as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown } : null
      const description = [details?.message, details?.details, details?.hint, details?.code ? `Code: ${details.code}` : null]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(' · ')
      setRemoveError(description || errorMessage(cause))
    } finally { setBusyId(null) }
  }

  const restore = async (assessment: Assessment) => {
    if (busyId) return
    setBusyId(assessment.id)
    setError(null)
    try {
      await assessmentService.restoreAssessment(assessment.id)
      setAssessments((old) => old.map((item) => item.id === assessment.id
        ? { ...item, status: 'draft', removedFromLibrary: false } : item))
      setNotice(`“${assessment.title}” was restored as a draft. Review it before publishing.`)
    } catch (cause) { setError(`Couldn't restore “${assessment.title}”: ${errorMessage(cause)}`) }
    finally { setBusyId(null) }
  }

  const inspectPermanentDeletion = async (assessment: Assessment) => {
    if (busyId) return
    setDeleteTarget(assessment)
    setDeleteImpact(null)
    setDeleteConfirmName('')
    setDeleteStudentData(false)
    setDeleteLoading(true)
    setError(null)
    try {
      setDeleteImpact(await assessmentService.getDeletionImpact(assessment.id))
    } catch (cause) {
      setError(`Could not inspect deletion dependencies: ${errorMessage(cause)}`)
      setDeleteTarget(null)
    } finally { setDeleteLoading(false) }
  }

  const permanentlyDelete = async () => {
    if (!deleteTarget || !deleteImpact || busyId) return
    if (!deleteImpact.can_delete || deleteConfirmName !== deleteImpact.assessment_name) return
    if (deleteImpact.attempts > 0 && !deleteStudentData) return
    const target = deleteTarget
    setBusyId(target.id)
    setError(null)
    try {
      const result = await assessmentService.permanentlyDeleteAssessment(target.id, target.title, deleteStudentData)
      setAssessments((old) => old.filter((item) => item.id !== target.id))
      setDeleteTarget(null)
      setDeleteImpact(null)
      setNotice(`“${target.title}” permanently deleted (${result.deleted_attempts} attempts, ${result.deleted_versions} saved versions).`)
    } catch (cause) {
      setError(`Could not permanently delete “${target.title}”: ${errorMessage(cause)}`)
      // Keep dialog open so the admin can review the error and retry if appropriate.
    } finally { setBusyId(null) }
  }

  const exportAssessment = async (assessment: Assessment) => {
    setBusyId(assessment.id)
    setError(null)
    try {
      // Fetch the current saved assessment rather than exporting stale local state.
      const current = await assessmentService.fetchAssessmentById(assessment.id)
      if (!current) throw new Error('Could not open this assessment. Please try again.')
      const json = JSON.stringify(current, null, 2)
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${current.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'assessment'}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) { setError(`Couldn't export “${assessment.title}”: ${errorMessage(cause)}`) }
    finally { setBusyId(null) }
  }

  const importBlueprintDraft = async () => {
    if (!pendingBlueprintJson || importing) return
    setImporting(true)
    setImportError(null)
    try {
      // Revalidate the exact JSON being saved; preview does not mutate Supabase.
      const bp = validateAssessmentBlueprint(pendingBlueprintJson)
      const draftPayload = materializeBlueprint(bp)
      const createdQuestionIds: string[] = []
      try {
        for (const section of bp.sections) {
          for (const item of section.questions) {
            setImportProgress(`Saving questions: ${createdQuestionIds.length + 1} of ${bp.questionCount}`)
            await questionBankService.addQuestion(item.bank)
            createdQuestionIds.push(item.bank.id)
          }
        }
        setImportProgress('Creating assessment draft…')
        const draft = assessmentService.createAssessment(draftPayload)
        try {
          await assessmentService.syncAssessmentToDatabase(draft)
          const verified = await assessmentService.fetchAssessmentById(draft.id)
          if (!verified) throw new Error('The assessment draft was not readable after saving.')
        } catch (cause) {
          assessmentService.saveStoredAssessments(assessmentService.getStoredAssessments().filter(a => a.id !== draft.id))
          throw cause
        }
        setBlueprintPreview(null)
        setPendingBlueprintJson('')
        setImportText('')
        setImportOpen(false)
        await reload()
        navigate(`/admin/assessments/${draft.id}`)
      } catch (cause) {
        // Never automatically delete question-bank rows after a partial failure:
        // deleting could remove records already referenced elsewhere.
        throw new Error(`${errorMessage(cause)}. ${createdQuestionIds.length} question(s) were saved before the interruption. Review the Question Bank before retrying to avoid duplicates.`)
      }
    } catch (cause) { setImportError(errorMessage(cause)) }
    finally { setImporting(false); setImportProgress('') }
  }

  const importAssessment = async (raw: string) => {
    if (!raw.trim() || importing) return
    setImporting(true)
    setImportError(null)
    try {
      const parsed = JSON.parse(raw)
      const hasInlineQuestions = parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
        (parsed.format === 'mathsystem-assessment-blueprint-v1' ||
          (Array.isArray(parsed.sections) && parsed.sections.some((s: any) =>
            Array.isArray(s.questions) && s.questions.some((q: any) =>
              q && typeof q === 'object' && (typeof q.prompt === 'string' || typeof q.question === 'string')))))
      if (hasInlineQuestions) {
        const preview = validateAssessmentBlueprint(raw)
        setBlueprintPreview(preview)
        setPendingBlueprintJson(raw)
        setImportText(raw)
        setImporting(false)
        return
      }
      setBlueprintPreview(null)
      setPendingBlueprintJson('')
      // Existing exported assessments retain their original import path.
      const imported = assessmentService.importAssessmentJSON(raw)
      try {
        await assessmentService.syncAssessmentToDatabase(imported)
        const saved = await assessmentService.fetchAssessmentById(imported.id)
        if (!saved) throw new Error('The imported assessment was not readable after saving.')
      } catch (cause) {
        // Only remove transient local cache state; never delete an uncertain DB write.
        assessmentService.saveStoredAssessments(
          assessmentService.getStoredAssessments().filter((item) => item.id !== imported.id),
        )
        throw cause
      }
      await reload()
      setImportOpen(false)
      setImportText('')
      navigate(`/admin/assessments/${imported.id}`)
    } catch (cause) { setImportError(errorMessage(cause)) }
    finally { setImporting(false) }
  }

  const uploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setImportError('Choose a JSON file smaller than 5 MB.')
      return
    }
    try { await importAssessment(await file.text()) }
    catch (cause) { setImportError(errorMessage(cause)) }
  }

  const submitImport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void importAssessment(importText)
  }

  return (
    <AdminLayout
      title="Assessments"
      subtitle="Manage, preview, and share your assessments."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setImportOpen(true); setImportError(null) }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            <Upload className="h-4 w-4" /> Import
          </button>
          <Link to="/admin/assessments/new"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            <Plus className="h-4 w-4" /> New assessment
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {notice && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice"><X className="h-4 w-4" /></button>
          </div>
        )}
        {error && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {([
            ['all', 'All assessments'],
            ['published', 'Published'],
            ['draft', 'Drafts'],
            ['archived', 'Archived'],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setStatus(key)}
              aria-pressed={status === key}
              className={`ms-filter-card rounded-2xl border px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:px-4 sm:py-4 ${status === key ? 'ms-filter-card-active' : ''}`}>
              <span className="block text-xs font-semibold text-slate-600">{label}</span>
              <span className="mt-2 block text-2xl font-bold tabular-nums text-slate-950">{loading ? '—' : counts[key]}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <span className="sr-only">Search assessments</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title, subject or grade…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Filter className="h-4 w-4 text-slate-400" /> Sort by
            <select value={sort} onChange={(event) => setSort(event.target.value as SortOrder)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-800 outline-none focus:border-blue-400">
              <option value="updated">Recently updated</option>
              <option value="name">Name A–Z</option>
              <option value="questions">Most questions</option>
            </select>
          </label>
          <button type="button" onClick={() => void refresh()} disabled={loading || refreshing || busyId !== null}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {removeTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 px-4 py-6" role="presentation">
            <div role="dialog" aria-modal="true" aria-labelledby="remove-library-heading" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
              <h2 id="remove-library-heading" className="text-lg font-bold text-slate-950">Remove from library?</h2>
              <p className="mt-2 break-words text-sm font-semibold text-slate-800">{removeTarget.title}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">This moves the assessment to Archived and removes it from the active library. Its saved versions, Question Bank questions, and student results are preserved. You can restore it later.</p>
              {removeError && <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{removeError}</div>}
              <label htmlFor="remove-library-confirm" className="mt-4 block text-xs font-semibold text-slate-800">Type REMOVE to confirm</label>
              <input id="remove-library-confirm" value={removeConfirm} onChange={(event) => setRemoveConfirm(event.target.value)} autoComplete="off" autoFocus className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="REMOVE" />
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" disabled={busyId !== null} onClick={() => { setRemoveTarget(null); setRemoveError(null); setRemoveConfirm('') }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50">Cancel</button>
                <button type="button" disabled={busyId !== null || removeConfirm !== 'REMOVE'} onClick={() => void remove()} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-40">{busyId === removeTarget.id ? 'Removing…' : 'Remove from library'}</button>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 px-4 py-6" role="presentation">
            <div role="dialog" aria-modal="true" aria-labelledby="delete-assessment-heading" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
              <h2 id="delete-assessment-heading" className="text-lg font-bold text-slate-950">Permanently delete assessment?</h2>
              <p className="mt-2 break-words text-sm text-slate-700">{deleteTarget.title}</p>
              {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
              {deleteLoading ? <p className="mt-4 text-sm text-slate-600">Checking saved records and dependencies…</p> : deleteImpact && (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-800">
                    <span>Saved assessment versions: <strong>{deleteImpact.versions}</strong></span>
                    <span>Student submissions: <strong>{deleteImpact.attempts}</strong></span>
                    <span>Completed: <strong>{deleteImpact.completed_attempts}</strong></span>
                    <span>In progress: <strong>{deleteImpact.in_progress_attempts}</strong></span>
                  </div>
                  {deleteImpact.blockers.length > 0 && <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><strong>Cannot delete: other linked records require review.</strong><ul className="mt-2 list-disc pl-5">{deleteImpact.blockers.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
                  {deleteImpact.in_progress_attempts > 0 && <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">This assessment has in-progress student attempts. Deleting it will immediately invalidate their access and permanently erase their saved answers. Do not delete during a live examination.</p>}
                  {/* step90-7: explain unavailable deletion rather than silently hide confirmation */}
                  {!deleteImpact.can_delete && (
                    <div role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                      <strong>Permanent deletion is currently blocked by the database.</strong>
                      <p className="mt-1">The assessment has not been deleted. Review the dependency messages above. If no dependencies are listed, the server did not authorize this operation; ask the administrator to inspect the deletion-preview function before retrying.</p>
                    </div>
                  )}
                  {deleteImpact.can_delete && <>
                    <p className="mt-3 text-sm font-medium text-rose-800">This permanently removes the assessment, its saved versions, and {deleteImpact.attempts} student submission(s) and their associated reports. Question Bank questions and taxonomy are not targeted. This cannot be undone.</p>
                    {deleteImpact.attempts > 0 && <label className="mt-3 flex items-start gap-2 text-sm text-slate-800"><input type="checkbox" checked={deleteStudentData} onChange={(e) => setDeleteStudentData(e.target.checked)} className="mt-1" />I understand that student submissions and reports will be permanently erased.</label>}
                    <label className="mt-3 block text-xs font-semibold text-slate-700">Type the exact assessment name to confirm
                      <input value={deleteConfirmName} onChange={(e) => setDeleteConfirmName(e.target.value)} autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" placeholder={deleteImpact.assessment_name}/>
                    </label>
                  </>}
                </>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium" onClick={() => {setDeleteTarget(null);setDeleteImpact(null)}}>Cancel</button>
                <button type="button" className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={deleteLoading || busyId !== null || !deleteImpact?.can_delete || deleteConfirmName !== deleteImpact.assessment_name || (deleteImpact.attempts > 0 && !deleteStudentData)} onClick={() => void permanentlyDelete()}>Permanently delete</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div role="status" className="grid gap-4 lg:grid-cols-2" aria-label="Loading assessments">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-60 animate-pulse rounded-2xl border border-slate-200 bg-white p-5">
                <div className="h-4 w-20 rounded bg-slate-100" />
                <div className="mt-5 h-6 w-2/3 rounded bg-slate-100" />
                <div className="mt-5 h-4 w-1/2 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : error && assessments.length === 0 ? (
          <div className="rounded-2xl border border-rose-200 bg-white p-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
            <h3 className="mt-3 text-sm font-bold text-slate-900">Assessments couldn't be loaded</h3>
            <p className="mt-1 text-xs text-slate-500">Check your connection or access permissions, then refresh.</p>
            <button type="button" onClick={() => void refresh()} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white">Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center sm:p-14">
            <FileText className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-3 text-base font-bold text-slate-900">{assessments.length ? 'No matching assessments' : 'Create your first assessment'}</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {assessments.length ? 'Try a different search or clear your status filter.' : 'Start with a draft, add sections and questions, then share it with students.'}
            </p>
            {assessments.length ? (
              <button type="button" onClick={() => { setSearch(''); setStatus('all') }} className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700">Clear filters</button>
            ) : (
              <Link to="/admin/assessments/new" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white"><Plus className="h-4 w-4" /> Create assessment</Link>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'assessment' : 'assessments'}</p>
            <div className="grid items-stretch gap-3 xl:grid-cols-2 sm:gap-4">
              {filtered.map((assessment) => (
                <article key={assessment.id} className="ms-assessment-card flex min-w-0 flex-col rounded-2xl border bg-white p-4 transition sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <StatusPill status={assessment.status} />
                      {assessment.removedFromLibrary && <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-800 ring-1 ring-orange-200">Removed from library</span>}
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{assessment.grade}</span>
                    </div>
                    <details className="relative shrink-0" aria-label={`More actions for ${assessment.title}`}>
                      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        <MoreHorizontal className="h-4 w-4" /><ChevronDown className="h-3 w-3" /><span className="sr-only">More actions</span>
                      </summary>
                      <div className="absolute right-0 top-full z-10 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                        <button type="button" disabled={busyId !== null} onClick={() => void duplicate(assessment)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Copy className="h-4 w-4" /> Duplicate</button>
                        <button type="button" disabled={busyId !== null} onClick={() => void exportAssessment(assessment)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download className="h-4 w-4" /> Export JSON</button>
                        <Link to={`/admin/assessments/${assessment.id}/report-settings`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"><SlidersHorizontal className="h-4 w-4" /> Report settings</Link>
                        <div className="my-1 border-t border-slate-100" />
                        {assessment.status === 'archived' ? (
                          <>
                            <button type="button" disabled={busyId !== null} onClick={() => void restore(assessment)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Restore as draft</button>
                            <button type="button" disabled={busyId !== null} onClick={() => void inspectPermanentDeletion(assessment)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Permanently delete…</button>
                          </>
                        ) : (
                          <button type="button" disabled={busyId !== null} onClick={() => { setRemoveTarget(assessment); setRemoveConfirm(''); setRemoveError(null) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Remove from library</button>
                        )}
                      </div>
                    </details>
                  </div>

                  <Link to={`/admin/assessments/${assessment.id}`} className="group mt-3 block min-w-0">
                    <h3 className="break-words text-base font-bold tracking-tight text-slate-950 group-hover:text-blue-700 sm:text-lg">{assessment.title}</h3>
                    <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-slate-500">{assessment.subtitle || assessment.description || `${assessment.subject} diagnostic assessment`}</p>
                  </Link>

                  <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-50 p-2 text-center sm:gap-2 sm:p-3">
                    <div><Layers3 className="mx-auto h-4 w-4 text-blue-600" /><p className="mt-1 text-sm font-bold text-slate-900">{assessment.sections.length}</p><p className="text-[11px] text-slate-500">Sections</p></div>
                    <div><FileQuestion className="mx-auto h-4 w-4 text-violet-600" /><p className="mt-1 text-sm font-bold text-slate-900">{countQuestions(assessment)}</p><p className="text-[11px] text-slate-500">Questions</p></div>
                    <div><Clock3 className="mx-auto h-4 w-4 text-amber-600" /><p className="mt-1 text-sm font-bold text-slate-900">{timeLabel(assessment)}</p><p className="text-[11px] text-slate-500">Duration</p></div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {assessment.sections.slice(0, 3).map((section) => (
                      <span key={section.id} className="max-w-full truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">{section.title}</span>
                    ))}
                    {assessment.sections.length > 3 && <span className="text-[11px] text-slate-400">+{assessment.sections.length - 3} more</span>}
                  </div>
                  <p className="mt-3 text-[11px] text-slate-400">Updated {dateLabel(assessment.updatedAt)}</p>

                  <div className="mt-auto space-y-3 border-t border-slate-100 pt-4">
                    <div className="flex flex-wrap gap-2">
                      <Link to={`/admin/assessments/${assessment.id}/preview`} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100" title="Staff trial only — no student attempt saved"><PlayCircle className="h-4 w-4" /> Trial preview</Link>
                      <Link to={`/admin/assessments/${assessment.id}/preview?mode=learning`} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100" title="Staff practice only — no student attempt saved"><Sparkles className="h-4 w-4" /> Practice & learn</Link>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/admin/assessments/${assessment.id}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700"><FileText className="h-4 w-4" /> Edit assessment <ArrowRight className="h-3.5 w-3.5" /></Link>
                      <button type="button" onClick={() => setShareTarget(assessment)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Share2 className="h-4 w-4" /> Share link</button>
                      <Link to={`/admin/assessments/${assessment.id}/results`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><BarChart3 className="h-4 w-4" /> Results</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {shareTarget && <ShareAssessmentModal assessmentId={shareTarget.id} assessmentName={shareTarget.title} onClose={() => setShareTarget(null)} />}

      {importOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="import-heading" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div><h2 id="import-heading" className="text-lg font-bold text-slate-950">Import an assessment</h2><p className="mt-1 text-xs text-slate-500">Imported assessments appear as new drafts.</p></div>
              <button type="button" disabled={importing} onClick={() => setImportOpen(false)} aria-label="Close import dialog" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button>
            </div>
            {importError && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{importError}</div>}
            {blueprintPreview && <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-slate-800">
              <div className="flex items-center gap-2 font-bold text-emerald-900"><CheckCircle2 className="h-4 w-4" /> Validated draft preview</div>
              <p className="font-semibold">{blueprintPreview.title}</p>
              <p>{blueprintPreview.sections.length} section(s) · {blueprintPreview.questionCount} question(s) · {blueprintPreview.settings.scoring.scheme.toUpperCase()} scoring</p>
              <p>Timer: {blueprintPreview.settings.timerMode.replaceAll('_', ' ')} · Passing benchmark: {blueprintPreview.settings.passingBenchmark ? `${blueprintPreview.settings.passingBenchmark.value} (${blueprintPreview.settings.passingBenchmark.scheme})` : `${blueprintPreview.settings.passingPercentage}% (legacy default)`}</p>
              <div className="max-h-28 overflow-auto text-xs">{blueprintPreview.sections.map((section, i) => <p key={i}>{section.title}: {section.questions.length} questions</p>)}</div>
              {blueprintPreview.warnings.length > 0 && <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{blueprintPreview.warnings.slice(0, 6).map((warning, i) => <p key={i}>• {warning}</p>)}</div>}
              <p className="text-xs text-slate-700">Review first. The next action saves questions to the Question Bank, then creates a new unpublished assessment. Partial database writes may require manual cleanup if interrupted.</p>
              <div className="flex gap-2"><button type="button" onClick={() => { setBlueprintPreview(null); setPendingBlueprintJson('') }} disabled={importing} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold">Edit JSON</button>
              <button type="button" disabled={importing} onClick={() => void importBlueprintDraft()} className="rounded-lg bg-emerald-800 px-3 py-2 font-semibold text-white disabled:opacity-50">{importing ? 'Saving…' : 'Create draft & save questions'}</button></div>
              {importProgress && <p role="status" className="text-xs">{importProgress}</p>}
            </div>}
            <div className="mt-5 space-y-4">
              <label className="block text-xs font-semibold text-slate-700">Upload a JSON file
                <input type="file" accept=".json,application/json" disabled={importing} onChange={(event) => void uploadFile(event)} className="mt-2 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-semibold file:text-blue-700" />
              </label>
              <div className="flex items-center gap-3 text-[11px] text-slate-400"><span className="h-px flex-1 bg-slate-200" />or paste JSON<span className="h-px flex-1 bg-slate-200" /></div>
              <form onSubmit={submitImport} className="space-y-3">
                <label htmlFor="import-json" className="block text-xs font-semibold text-slate-700">Assessment JSON</label>
                <textarea id="import-json" rows={7} value={importText} disabled={importing} onChange={(event) => setImportText(event.target.value)} placeholder="Paste a previously exported assessment…" className="w-full rounded-xl border border-slate-200 p-3 font-mono text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" disabled={importing} onClick={() => setImportOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700">Cancel</button>
                  <button type="submit" disabled={importing || !importText.trim()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    {importing && <RefreshCw className="h-4 w-4 animate-spin" />} {importing ? 'Saving…' : 'Import assessment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
