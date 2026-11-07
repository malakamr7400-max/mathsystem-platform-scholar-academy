import { useState } from 'react'
import ContentBlockRenderer from '../ContentBlockRenderer'
import MathRenderer from '../MathRenderer'
import type { ChoiceOption, QuestionReviewItem } from './Types'
import { classifyQuestionState } from '../../lib/diagnosticAnalytics'
import { ThreeStateBadge } from './ThreeStateDonutChart'

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
      <span className="font-semibold text-slate-500">{label}:</span> {value}
    </span>
  )
}

function ChoiceText({ id, choices }: { id: string; choices: ChoiceOption[] }) {
  const choice = choices.find((item) => item.id === id)
  if (!choice) return <>{id}</>
  return <ContentBlockRenderer blocks={choice.content_blocks} />
}

function formatStudentResponse(
  answer: Record<string, unknown>,
  choices: ChoiceOption[],
  status: string,
) {
  if (
    status === 'unanswered' ||
    !answer ||
    Object.keys(answer).length === 0 ||
    answer.unanswered === true
  ) {
    return (
      <span className="text-xs font-medium italic text-slate-500">
        Unanswered — no response was recorded before submission.
      </span>
    )
  }

  if (answer.choice_idx !== undefined && answer.choice_idx !== null) {
    const index = Number(answer.choice_idx)
    if (Number.isInteger(index) && index >= 0 && index < choices.length) {
      return <ContentBlockRenderer blocks={choices[index].content_blocks} />
    }
  }

  const raw = answer.choice_ids ?? answer.choice_id ?? answer.selected_choice_ids
  if (raw !== undefined) {
    const ids = Array.isArray(raw) ? raw : [raw]
    return (
      <div className="space-y-1">
        {ids.map((id: unknown, index: number) => (
          <div key={`${String(id)}-${index}`}>
            <ChoiceText id={String(id)} choices={choices} />
          </div>
        ))}
      </div>
    )
  }

  if (answer.value !== undefined) return <>{String(answer.value)}</>
  if (answer.text !== undefined) return <>{String(answer.text)}</>
  if (answer.numerical !== undefined) return <>{String(answer.numerical)}</>

  // Do not serialize the full answer object: it can contain grading metadata.
  return <span className="italic text-slate-500">Response recorded.</span>
}

interface Props {
  question: QuestionReviewItem
  index: number
  avgTime?: number
  highlight?: boolean
  visibleFields?: string[]
}

/** Post-submission review of saved, authorized results. Never fetches answer keys independently. */
export default function QuestionReviewCard({
  question,
  index,
  avgTime,
  highlight,
  visibleFields,
}: Props) {
  const [open, setOpen] = useState(false)
  const isIncorrect = classifyQuestionState(question) === 'incorrect'
  const correctChoices = question.choices.filter((choice) => choice.is_correct)
  const solutionAvailable = Array.isArray(question.explanation_blocks) && question.explanation_blocks.length > 0
  const showField = (field: string) => !visibleFields || visibleFields.includes(field)
  const status = classifyQuestionState(question)
  const timeRatio = avgTime && avgTime > 0
    ? Math.min(question.time_spent_seconds / avgTime, 2)
    : 0
  const paceTone = timeRatio > 1.3
    ? 'bg-amber-500'
    : timeRatio < 0.6
      ? 'bg-sky-500'
      : 'bg-slate-400'

  return (
    <article
      id={`q-${question.question_id}`}
      data-pdf-question-card="true"
      data-pdf-review-status={status}
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
        highlight ? 'border-primary-400 ring-2 ring-primary-100' : 'border-slate-200'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        data-pdf-question-header="true"
        className="flex w-full items-start justify-between gap-4 p-5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">Question {index + 1}</span>
            {showField('status') && <ThreeStateBadge status={status} />}
            {showField('difficulty') && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">
                {question.difficulty}
              </span>
            )}
          </span>
          {showField('questionText') && (
            <span className="mt-2 block text-slate-800">
              <ContentBlockRenderer blocks={question.content_blocks} />
            </span>
          )}
        </span>
        <span data-pdf-disclosure-label="true" className="mt-1 shrink-0 text-xs font-semibold text-slate-500">
          {open ? 'Hide details ▲' : 'Show details ▼'}
        </span>
      </button>

      {/* Keep review content mounted but visually collapsed on screen. The PDF
          capture can reveal incorrect answers without changing the student's UI. */}
      <div
        data-pdf-review-details="true"
        className={`${open ? 'block' : 'hidden'} space-y-4 border-t border-slate-100 p-5`}
      >
          {showField('time') && (
            <div>
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>
                  Time spent: <strong className="text-slate-700">{formatTime(question.time_spent_seconds)}</strong>
                </span>
                {avgTime ? <span>Assessment average: {formatTime(avgTime)}</span> : null}
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${paceTone}`}
                  style={{ width: `${Math.min(timeRatio * 50, 100)}%` }}
                />
              </div>
            </div>
          )}

          {showField('taxonomy') && (
            <div className="flex flex-wrap gap-2 text-xs">
              {question.category_name && <Tag label="Category" value={question.category_name} />}
              {question.lesson_name && <Tag label="Lesson" value={question.lesson_name} />}
              {question.skill_name && <Tag label="Skill" value={question.skill_name} />}
            </div>
          )}

          {(isIncorrect || showField('studentResponse')) && (
            <div className={`rounded-xl border p-4 ${
              status === 'unanswered'
                ? 'border-slate-200 bg-slate-50'
                : status === 'correct'
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : 'border-rose-200 bg-rose-50/40'
            }`}>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Your response
              </div>
              <div className="mt-2 text-sm text-slate-800">
                {formatStudentResponse(question.student_answer, question.choices, status)}
              </div>
            </div>
          )}

          {isIncorrect && (
            <div className="space-y-4" aria-label="Incorrect answer explanation">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <h4 className="text-sm font-semibold text-emerald-900">Correct answer</h4>
                <div className="mt-2 text-sm text-slate-800">
                  {correctChoices.length ? correctChoices.map((choice) => (
                    <div key={choice.id} className="flex items-start gap-2">
                      <span className="font-semibold text-emerald-800">{question.choices.indexOf(choice) + 1}.</span>
                      <ContentBlockRenderer blocks={choice.content_blocks} />
                    </div>
                  )) : question.correct_answer_data?.value !== undefined && question.correct_answer_data?.value !== null
                    ? <MathRenderer text={String(question.correct_answer_data.value)} />
                    : <span className="text-slate-600">The correct answer was not included in the saved report.</span>}
                </div>
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4">
                <h4 className="text-sm font-semibold text-sky-900">Complete Step-by-Step Solution</h4>
                <div className="mt-2 text-sm text-slate-800">
                  {solutionAvailable
                    ? <ContentBlockRenderer blocks={question.explanation_blocks} />
                    : <p className="text-slate-600">No step-by-step solution was provided for this question.</p>}
                </div>
              </div>
            </div>
          )}
      </div>
    </article>
  )
}
