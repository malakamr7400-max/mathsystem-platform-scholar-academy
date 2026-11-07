import React from 'react'
import { ArrowRight, Check, CheckCircle2, Circle, Eye, FileQuestion, Layers3, ListChecks, Save, Settings2, Sparkles } from 'lucide-react'

export type QuestionEditorStepId = 'organization' | 'format' | 'prompt' | 'answers' | 'guidance'

export interface QuestionEditorStep {
  id: QuestionEditorStepId
  title: string
  description: string
  complete: boolean
  required: boolean
}

interface QuestionEditorOverviewProps {
  editing: boolean
  questionType: string
  collection: string
  isSaving: boolean
  dirty: boolean
  hydrated: boolean
  steps: QuestionEditorStep[]
}

export const QuestionEditorOverview: React.FC<QuestionEditorOverviewProps> = ({
  editing, questionType, collection, isSaving, dirty, hydrated, steps,
}) => {
  const required = steps.filter(step => step.required)
  const complete = required.filter(step => step.complete).length
  const allReady = complete === required.length
  const format = questionType === 'grid_in' ? 'Numeric response' : questionType === 'multi_select' ? 'Multiple answers' : 'Single answer'

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" aria-label="Question editor overview">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-blue-950 px-5 py-6 text-white sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100">
              <Sparkles className="h-3.5 w-3.5" /> QUESTION EDITOR
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              {editing ? 'Refine your question' : 'Create a question'}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-200">
              Write your question, choose the correct answer, and review the student view.
            </p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-left">
            <p className="text-xs font-semibold text-blue-100">Required fields ready</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-white">{complete}<span className="text-base text-blue-200"> / {required.length}</span></p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-7">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5"><FileQuestion className="h-3.5 w-3.5" />{format}</span>
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-blue-800"><Layers3 className="h-3.5 w-3.5" /><span className="max-w-56 truncate">{collection || 'No collection selected'}</span></span>
        </div>
        <div role="status" aria-live="polite" className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${isSaving ? 'bg-blue-50 text-blue-800' : dirty ? 'bg-amber-50 text-amber-800' : !hydrated ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-800'}`}>
          {isSaving ? <Save className="h-3.5 w-3.5" /> : dirty ? <Circle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {isSaving ? 'Saving…' : dirty ? 'Unsaved changes' : !hydrated ? 'Loading question…' : editing ? 'No unsaved changes' : 'Ready to edit'}
        </div>
      </div>
      <div className="h-1.5 bg-slate-100"><div className={`h-full transition-all ${allReady ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${required.length ? complete / required.length * 100 : 0}%` }} /></div>
    </section>
  )
}

interface QuestionEditorNavigationProps {
  steps: QuestionEditorStep[]
  onJump: (id: QuestionEditorStepId) => void
}

const icons = { organization: Layers3, format: Settings2, prompt: FileQuestion, answers: ListChecks, guidance: Sparkles }

export const QuestionEditorNavigation: React.FC<QuestionEditorNavigationProps> = ({ steps, onJump }) => (
  <nav aria-label="Question editing sections" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
    {steps.map((step, index) => {
      const Icon = icons[step.id]
      return (
        <button
          key={step.id}
          type="button"
          onClick={() => onJump(step.id)}
          aria-label={`Go to ${step.title}: ${step.complete ? 'ready' : step.required ? 'needs attention' : 'optional'}`}
          className="group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 group-hover:bg-white"><Icon className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-slate-900">{index + 1}. {step.title}</span>
            <span className="mt-0.5 block truncate text-[11px] text-slate-500">{step.description}</span>
          </span>
          {step.complete ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : step.required ? <Circle className="h-3.5 w-3.5 shrink-0 text-amber-500" /> : <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
        </button>
      )
    })}
  </nav>
)

export type QuestionEditorViewMode = 'editor' | 'split' | 'preview'

interface QuestionEditorViewSwitchProps {
  mode: QuestionEditorViewMode
  onChange: (mode: QuestionEditorViewMode) => void
}

export const QuestionEditorViewSwitch: React.FC<QuestionEditorViewSwitchProps> = ({ mode, onChange }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <div>
      <p className="text-sm font-bold text-slate-900">Editing workspace</p>
      <p className="mt-0.5 text-xs text-slate-500">Choose how you want to work.</p>
    </div>
    <div role="group" aria-label="Editor view" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {([
        ['editor', 'Edit only'],
        ['split', 'Edit + preview'],
        ['preview', 'Student preview'],
      ] as const).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={mode === value}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          {value === 'preview' && <Eye className="h-3.5 w-3.5" />}
          {label}
        </button>
      ))}
    </div>
  </div>
)
