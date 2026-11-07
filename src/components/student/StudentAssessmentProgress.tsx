import React from 'react'
import { Layers } from 'lucide-react'

type StudentAssessmentProgressProps = {
  title: string
  sectionIndex: number
  sectionCount: number
  questionIndex: number
  questionCount: number
  sectionAnswers: boolean[]
  totalAnswered: number
  totalQuestions: number
  sectionUnanswered?: number
  sectionFlagged?: number
  timer?: React.ReactNode
  children?: React.ReactNode
}

/** One accessible progress/navigation panel; actions stay in the assessment player. */
export const StudentAssessmentProgress: React.FC<StudentAssessmentProgressProps> = ({
  sectionIndex, sectionCount, questionIndex, questionCount,
  totalAnswered, totalQuestions, sectionUnanswered = 0, sectionFlagged = 0,
  timer, children,
}) => {
  const pct = totalQuestions > 0 ? Math.round(totalAnswered / totalQuestions * 100) : 0
  return (
    <section aria-label="Assessment progress and question navigation" className="ms-student-progress rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-slate-900">Assessment progress</h2>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800">
            <Layers className="h-4 w-4" aria-hidden="true" /> Section {sectionIndex + 1} of {sectionCount}
            <span className="text-slate-400" aria-hidden="true">·</span>
            <span className="text-slate-600">Question {questionIndex + 1} of {questionCount}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="text-right">
            <p className="text-xl font-bold tabular-nums text-slate-900">{totalAnswered}<span className="text-sm font-medium text-slate-500">/{totalQuestions}</span></p>
            <p className="text-xs text-slate-500">Answered</p>
          </div>
          {timer}
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex justify-between gap-2 text-xs text-slate-600">
          <span>Overall completion</span><span className="font-semibold tabular-nums">{pct}%</span>
        </div>
        <div role="progressbar" aria-label="Questions answered" aria-valuenow={totalAnswered} aria-valuemin={0} aria-valuemax={totalQuestions} className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="ms-student-progress-fill h-full rounded-full transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {children && <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold text-slate-800">Questions</p>
          <p className="text-xs tabular-nums text-slate-500">{sectionUnanswered} unanswered · {sectionFlagged} flagged</p>
        </div>
        {children}
      </div>}
    </section>
  )
}

export default StudentAssessmentProgress
