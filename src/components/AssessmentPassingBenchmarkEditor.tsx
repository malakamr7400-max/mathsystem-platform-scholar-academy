import { useEffect, useState } from 'react'
import type { AssessmentSettings } from '../lib/assessmentService'
import { benchmarkRange, resolvePassingBenchmark } from '../lib/passingBenchmark'
import { scoringLabels } from '../lib/scoringSchemes'

export function AssessmentPassingBenchmarkEditor({ settings, saving, onSave }: {
  settings: AssessmentSettings
  saving: boolean
  onSave: (value: number) => Promise<void> | void
}) {
  const scheme = settings.scoring?.scheme ?? 'standard'
  const resolved = resolvePassingBenchmark(settings)
  const range = benchmarkRange(scheme)
  const [input, setInput] = useState('')
  useEffect(() => { setInput(resolved?.value.toString() ?? ''); }, [scheme, resolved?.value])
  const candidate = input.trim() === '' ? NaN : Number(input)
  const valid = Number.isFinite(candidate) && candidate >= range.min && candidate <= range.max &&
    (scheme === 'standard' || Number.isInteger(candidate))
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 space-y-3">
    <h3 className="text-sm font-bold text-slate-900">Passing benchmark</h3>
    <p className="text-xs leading-5 text-slate-600">Choose the minimum score that counts as meeting the benchmark for this assessment. This is separate from diagnostic proficiency levels.</p>
    <p className="text-xs text-slate-600">Selected scoring system: <strong>{scoringLabels[scheme]}</strong></p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-semibold text-slate-700">Minimum score ({range.unit})
        <input type="number" min={range.min} max={range.max} step={scheme === 'standard' ? 0.1 : 1}
          value={input} onChange={e => { setInput(e.target.value); }}
          className="mt-1 block w-44 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Enter benchmark" />
      </label>
      <button type="button" disabled={saving || !valid || candidate === resolved?.value}
        onClick={() => { void onSave(candidate) }}
        className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save benchmark</button>
    </div>
    {!valid && input !== '' && <p role="alert" className="text-xs text-rose-700">Enter a valid {scheme === 'standard' ? 'percentage' : 'whole number'} between {range.min} and {range.max}.</p>}
    {scheme !== 'standard' && <p className="text-xs text-amber-700">Scaled scores are practice estimates, not official exam scores. Attempts without a saved valid scaled score are excluded from pass-rate calculations.</p>}
  </section>
}
