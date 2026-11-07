import { useEffect, useState } from 'react'
import type { AssessmentSection } from '../lib/assessmentService'
import { defaultScale, scoringLabels, scoringSectionDefaults, validateScoringConfig,
  type AssessmentScoringConfig, type ScoringRole, type ScoringScheme } from '../lib/scoringSchemes'

const inputClass = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900'
const roleOptions: Array<{value: ScoringRole; label: string}> = [
  {value:'math',label:'Math'}, {value:'reading_writing',label:'Reading / Writing'},
  {value:'english',label:'English'}, {value:'reading',label:'Reading'},
  {value:'science',label:'Science'}, {value:'other',label:'Other / not included'},
]
function parseTable(text: string): Array<{raw: number; scaled: number}> {
  if (!text.trim()) return []
  return text.trim().split(/[\n,;]+/).map(part => {
    const match = part.trim().match(/^(\d+)\s*[:=]\s*(\d+)$/)
    if (!match) throw new Error('Use one entry per line, such as 0=200 or 1=230.')
    return { raw: Number(match[1]), scaled: Number(match[2]) }
  })
}
export function AssessmentScoringEditor({ initial, sections, saving, onSave }: {
  initial: AssessmentScoringConfig; sections: AssessmentSection[]; saving: boolean;
  onSave: (config: AssessmentScoringConfig) => Promise<void>
}) {
  const [draft,setDraft] = useState<AssessmentScoringConfig>(initial)
  const [tables,setTables] = useState<Record<string,string>>({})
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  useEffect(() => {
    setDraft(initial)
    setTables(Object.fromEntries((initial.sections || []).map(s => [s.sectionId,(s.conversionTable || []).map(p => `${p.raw}=${p.scaled}`).join('\n')])))
  }, [initial])
  const setScheme = (scheme: ScoringScheme) => {
    setDraft({ scheme, mode: 'default', sections: [] }); setTables({}); setError('')
  }
  const setMode = (mode: 'default'|'custom') => {
    setDraft(current => ({ ...current, mode,
      sections: mode === 'custom' ? sections.map(sec => current.sections.find(s => s.sectionId === sec.id) || scoringSectionDefaults(current.scheme, sec.id, sec.title)) : [] }))
    setError('')
  }
  const updateSection = (id: string, updates: Partial<AssessmentScoringConfig['sections'][number]>) =>
    setDraft(current => ({ ...current, sections: current.sections.map(s => s.sectionId === id ? {...s,...updates} : s) }))
  const save = async () => {
    try {
      setError('')
      const next = { ...draft, sections: draft.mode === 'custom' && draft.scheme !== 'standard'
        ? draft.sections.map(section => ({...section, maxScaled: defaultScale(draft.scheme).max, conversionTable: parseTable(tables[section.sectionId] || '')})) : [] }
      const errors = validateScoringConfig(next, sections)
      if (errors.length) throw new Error(errors.join(' '))
      setBusy(true)
      await onSave(next)
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setBusy(false) }
  }
  return <section className="rounded-3xl border border-blue-200 bg-white p-6 shadow-sm space-y-4">
    <div>
      <h3 className="text-sm font-bold text-slate-900">How should this assessment be scored?</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">Choose how results will appear to students. When you save a change, earlier student results stay exactly as they were. SAT, ACT and EST default scores are practice estimates, not official exam results.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-700">Scoring method
        <select className={`mt-1 block w-full ${inputClass}`} value={draft.scheme} onChange={e => setScheme(e.target.value as ScoringScheme)}>
          {Object.entries(scoringLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold text-slate-700">Score conversion
        <select className={`mt-1 block w-full ${inputClass}`} value={draft.mode} onChange={e => setMode(e.target.value as 'default'|'custom')} disabled={draft.scheme === 'standard'}>
          <option value="default">Use recommended practice conversion</option>
          <option value="custom">Use my own conversion table</option>
        </select>
      </label>
    </div>
    {draft.scheme !== 'standard' && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">The recommended conversion estimates a score for each section; it is not an official exam score. If you have a verified score conversion table for this test, choose “Use my own conversion table.” Scores missing from that table will appear as “N/A” rather than being guessed.</p>}
    {draft.scheme !== 'standard' && draft.mode === 'custom' && <div className="space-y-4">
      {sections.map(sec => {
        const c = draft.sections.find(s => s.sectionId === sec.id) || scoringSectionDefaults(draft.scheme,sec.id,sec.title)
        return <div key={sec.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-sm font-bold text-slate-900">{sec.title} <span className="text-xs font-normal text-slate-500">({sec.questions.length} questions)</span></p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs">What does this section assess?<select className={`mt-1 block w-full ${inputClass}`} value={c.role} onChange={e=>updateSection(sec.id,{role:e.target.value as ScoringRole})}>
              {roleOptions.map(role=><option key={role.value} value={role.value}>{role.label}</option>)}
            </select></label>
            <label className="text-xs">Lowest possible score<input className={`mt-1 block w-full ${inputClass}`} type="number" min={0} max={2000} value={c.minScaled} onChange={e=>updateSection(sec.id,{minScaled:Number(e.target.value)})}/></label>
            <label className="text-xs">Highest possible score<input className={`mt-1 block w-full ${inputClass}`} type="number" value={defaultScale(draft.scheme).max} disabled title="Student exam scores must be out of 800 for SAT/EST or 36 for ACT."/></label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={c.includeInComposite} onChange={e=>updateSection(sec.id,{includeInComposite:e.target.checked})}/>Include in overall score</label>
          </div>
          <label className="block text-xs font-semibold text-slate-700">Score conversion table (optional)
            <textarea className={`mt-1 block w-full ${inputClass}`} rows={3} value={tables[sec.id] ?? (c.conversionTable||[]).map(p=>`${p.raw}=${p.scaled}`).join('\n')}
              onChange={e=>setTables(t=>({...t,[sec.id]:e.target.value}))} placeholder={`0=${defaultScale(draft.scheme).min}\n1=...\n${sec.questions.length}=${defaultScale(draft.scheme).max}`} />
          </label>
          <p className="text-[11px] text-slate-500">Enter one line for each possible number of correct answers, from 0 to {sec.questions.length} (for example, 3=700). Leave this blank to use an estimated practice conversion.</p>
        </div>
      })}
    </div>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    <button type="button" onClick={save} disabled={saving || busy} className="rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving || busy ? 'Saving...' : 'Save scoring settings'}</button>
  </section>
}
