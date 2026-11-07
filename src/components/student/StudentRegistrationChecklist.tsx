import React from 'react'
import { CheckCircle2, Circle, LockKeyhole, UserRoundCheck } from 'lucide-react'

type Props = {
  completedRequired: number
  totalRequired: number
  passcodeRequired: boolean
  passcodeEntered: boolean
  mode: 'learning' | 'exam'
}

/** Display-only readiness guidance; final validation remains on form submission. */
export const StudentRegistrationChecklist: React.FC<Props> = ({
  completedRequired, totalRequired, passcodeRequired, passcodeEntered,
}) => {
  const detailsReady = completedRequired === totalRequired
  const codeReady = !passcodeRequired || passcodeEntered
  const rows = [
    { label: 'Registration details', detail: totalRequired ? `${completedRequired} of ${totalRequired} required fields completed` : 'No details required', ready: detailsReady, Icon: UserRoundCheck },
    ...(passcodeRequired ? [{ label: 'Access code', detail: passcodeEntered ? 'Code entered' : 'Enter the code provided by your teacher', ready: codeReady, Icon: LockKeyhole }] : []),
  ]
  const readyCount = rows.filter((row) => row.ready).length
  return (
    <section aria-label="Registration checklist" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">Ready to start?</h3>
        <span className="text-xs font-semibold tabular-nums text-slate-600">{readyCount} of {rows.length} ready</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(({ label, detail, ready, Icon }) => (
          <div key={label} className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">{label}</p>
              <p className="mt-0.5 text-xs text-slate-600">{detail}</p>
            </div>
            {ready ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Ready" /> : <Circle className="h-4 w-4 shrink-0 text-amber-500" aria-label="Not ready" />}
          </div>
        ))}
      </div>
    </section>
  )
}

export default StudentRegistrationChecklist
