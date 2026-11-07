import type { ReportData } from './Types'
import { buildPublishedStudioSections, type PublishedStudioTemplate } from '../../lib/publishedStudioTypes'

export function PublishedStudioReport({ template, report }: { template: PublishedStudioTemplate; report: ReportData }) {
  const sections = buildPublishedStudioSections(template, report)
  return <section className="mx-auto mt-6 max-w-6xl rounded-2xl border border-teal-200 bg-white p-6 shadow-sm" aria-label="Published diagnostic report">
    <div className="mb-5 border-b border-slate-200 pb-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Diagnostic report · Design v{template.version}</p>
      <h2 className="mt-1 text-xl font-bold text-slate-900">{template.layout.title}</h2>
      <p className="mt-1 text-sm text-slate-500">Based on the completed assessment. Detailed question review remains available below.</p>
    </div>
    {sections.map(section => <div key={section.id} className="mb-6">
      <h3 className="mb-3 text-base font-semibold text-slate-800">{section.title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {section.items.map(item => <div key={item.id} className={`rounded-xl border border-slate-200 bg-slate-50 p-4 ${item.width === 'full' ? 'sm:col-span-2' : ''}`}>
          <p className="text-sm font-semibold text-slate-700">{item.title}</p>
          {item.kind === 'gauge' && item.percentage != null && <div className="mt-3" role="img" aria-label={`${item.title}: ${item.percentage.toFixed(1)} percent correct`}>
            <div className="flex items-center gap-4"><div className="grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{background:`conic-gradient(#0f766e ${item.percentage}%, #e2e8f0 ${item.percentage}% 100%)`}}>
              <div className="grid h-16 w-16 place-items-center rounded-full bg-white text-base font-bold text-slate-900">{item.percentage.toFixed(1)}%</div></div>
              <p className="text-xs text-slate-600">Correct answers / assessed questions. This is accuracy, not a weighted or scaled score.</p></div>
          </div>}
          {item.kind === 'donut' && item.segments && <div className="mt-3">
            <div className="flex items-center gap-4"><div role="img" aria-label={item.segments.map(s => `${s.label}: ${s.count}`).join(', ')} className="grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{background:`conic-gradient(#0f766e 0% ${item.segments[0].percentage}%, #f59e0b ${item.segments[0].percentage}% ${item.segments[0].percentage+item.segments[1].percentage}%, #94a3b8 ${item.segments[0].percentage+item.segments[1].percentage}% 100%)`}}><div className="h-16 w-16 rounded-full bg-white" /></div>
            <div className="space-y-1 text-xs text-slate-700">{item.segments.map(segment => <div key={segment.label}>{segment.label}: <strong>{segment.count}</strong> ({segment.percentage.toFixed(1)}%)</div>)}</div></div>
          </div>}
          {item.kind === 'chart' && item.rows && <div className="mt-3 space-y-3">{item.rows.map((row, index) => <div key={`${row.label}-${index}`}>
            <div className="mb-1 flex justify-between gap-2 text-xs text-slate-600"><span>{row.label}</span><span>{row.percentage.toFixed(1)}% · {row.count} questions</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-teal-600" style={{width:`${row.percentage}%`}} /></div>
          </div>)}</div>}
          {item.kind === 'table' && item.rows && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2">Area</th><th>Correct</th><th>Questions</th><th>Accuracy</th></tr></thead><tbody>{item.rows.map((row,index) => <tr key={`${row.label}-${index}`} className="border-b border-slate-100"><td className="py-2">{row.label}</td><td>{row.correct}</td><td>{row.count}</td><td>{row.percentage.toFixed(1)}%</td></tr>)}</tbody></table></div>}
          {item.kind !== 'chart' && item.kind !== 'table' && item.kind !== 'gauge' && item.kind !== 'donut' && <p className={`mt-2 whitespace-pre-line ${item.kind === 'metric' ? 'text-2xl font-bold text-slate-900' : 'text-sm text-slate-600'}`}>{item.value}</p>}
        </div>)}
      </div>
    </div>)}
  </section>
}
