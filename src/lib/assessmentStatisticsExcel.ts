import type { PassingBenchmark } from './passingBenchmark'
import { benchmarkLabel } from './passingBenchmark'
/** Self-contained, professionally formatted Excel export for assessment results.
 * All teacher/student-provided values are stored as literal inline strings.
 */
import { strToU8, zipSync } from 'fflate'

export interface AssessmentStatisticsRow {
  id: string
  studentName: string
  studentEmail: string
  status: string
  startedAt: string | null
  completedAt: string | null
  percentage: number | null
  benchmarkScore?: number | null
  correctCount: number | null
  totalQuestions: number | null
  levelName: string | null
}

type Cell = string | number | null
interface SheetDefinition { name: string; title: string; subtitle: string; headings: string[]; data: Cell[][]; widths: number[]; scoreColumns?: number[] }

const xml = (value: string): string => value
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

function col(index: number): string {
  let result = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result
  return result
}
const round = (n: number): number => Math.round(n * 100) / 100
const mean = (values: number[]): number | null => values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null
const median = (values: number[]): number | null => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const m = Math.floor(sorted.length / 2)
  return round(sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2)
}
const validScore = (row: AssessmentStatisticsRow): row is AssessmentStatisticsRow & { percentage: number } =>
  row.status === 'completed' && typeof row.percentage === 'number' && Number.isFinite(row.percentage)
const timestamp = (s: string | null): number => s ? (Date.parse(s) || 0) : 0
const dateText = (value: string | null): string => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}
function studentGroups(rows: AssessmentStatisticsRow[]): AssessmentStatisticsRow[][] {
  const groups = new Map<string, AssessmentStatisticsRow[]>()
  for (const row of rows) {
    const email = row.studentEmail.trim().toLowerCase()
    const name = row.studentName.trim().toLowerCase()
    const key = email ? `email:${email}` : name && name !== 'unnamed student' ? `name:${name}` : `attempt:${row.id}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()]
}

// 1: title, 2: subtitle, 3: spacer, 4: column headers, 5+: data.
function sheetXml(sheet: SheetDefinition): string {
  const end = col(sheet.headings.length - 1)
  const cell = (value: Cell, ref: string, style: number): string => {
    if (value === null || value === '') return ''
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(String(value))}</t></is></c>`
  }
  const rows = [
    `<row r="1" ht="38" customHeight="1">${cell(sheet.title, 'A1', 1)}</row>`,
    `<row r="2" ht="26" customHeight="1">${cell(sheet.subtitle, 'A2', 2)}</row>`,
    '<row r="3" ht="12" customHeight="1"/>',
    `<row r="4" ht="32" customHeight="1">${sheet.headings.map((h, i) => cell(h, `${col(i)}4`, 3)).join('')}</row>`,
    ...sheet.data.map((data, index) => {
      const row = index + 5
      const s = index % 2 ? 5 : 4
      const cells = data.map((value, i) => cell(value, `${col(i)}${row}`, sheet.scoreColumns?.includes(i) ? (index % 2 ? 7 : 6) : s)).join('')
      return `<row r="${row}" ht="24" customHeight="1">${cells}</row>`
    }),
  ].join('')
  const cols = sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')
  const last = Math.max(5, sheet.data.length + 4)
  const scoreFormatting = (sheet.scoreColumns ?? []).map((index) => {
    if (!sheet.data.length) return ''
    const range = `${col(index)}5:${col(index)}${last}`
    return `<conditionalFormatting sqref="${range}"><cfRule type="colorScale" priority="1"><colorScale><cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/><color rgb="FFFEE2E2"/><color rgb="FFFFF4CC"/><color rgb="FFDCFCE7"/></colorScale></cfRule></conditionalFormatting>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="20"/><cols>${cols}</cols><sheetData>${rows}</sheetData>` +
    `<autoFilter ref="A4:${end}${last}"/>` +
    `<mergeCells count="2"><mergeCell ref="A1:${end}1"/><mergeCell ref="A2:${end}2"/></mergeCells>` +
    `${scoreFormatting}` +
    `<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>` +
    `<pageSetup orientation="landscape" fitToWidth="1"/>` +
    `</worksheet>`
}

/** Export every supplied (already filtered) submission, without server-side writes. */
export function buildAssessmentStatisticsXlsx(title: string, rows: AssessmentStatisticsRow[], passMark: PassingBenchmark | number | null): Uint8Array {
  const groups = studentGroups(rows)
  const scored = rows.filter(validScore)
  const scores = scored.map((row) => row.percentage)
  const mark: PassingBenchmark | null = typeof passMark === 'number' ? { scheme: 'standard', value: passMark } : passMark
  const eligible = scored.filter(row => (mark?.scheme === 'standard' ? row.percentage : row.benchmarkScore) !== null && (mark?.scheme === 'standard' || row.benchmarkScore !== undefined))
  const scoreValue = (row: AssessmentStatisticsRow) => mark?.scheme === 'standard' ? row.percentage : row.benchmarkScore ?? null
  const passed = mark === null ? null : eligible.filter(row => scoreValue(row)! >= mark.value).length
  const completionRate = rows.length ? round(rows.filter((r) => r.status === 'completed').length / rows.length * 100) : null
  const scoreBands = [
    { label: 'Excellent (90–100%)', min: 90, max: Infinity },
    { label: 'Strong (80–<90%)', min: 80, max: 90 },
    { label: 'Developing (70–<80%)', min: 70, max: 80 },
    { label: 'Needs support (60–<70%)', min: 60, max: 70 },
    { label: 'Priority support (<60%)', min: -Infinity, max: 60 },
  ]
  const levels = new Map<string, number>()
  for (const row of scored) {
    const level = row.levelName?.trim() || 'Not assigned'
    levels.set(level, (levels.get(level) ?? 0) + 1)
  }
  const subtitle = `Assessment: ${title}   •   Generated ${dateText(new Date().toISOString())}`
  const overview: Cell[][] = [
    ['Students represented', groups.length, 'Unique students by email; fallback to name when email is unavailable'],
    ['Total submissions', rows.length, 'All submissions matching the Results page filters'],
    ['Completed submissions', rows.filter((r) => r.status === 'completed').length, 'Includes completed submissions without scores'],
    ['In-progress submissions', rows.filter((r) => r.status === 'in_progress').length, 'Not included in score statistics'],
    ['Abandoned submissions', rows.filter((r) => r.status === 'abandoned').length, 'Not included in score statistics'],
    ['Completion rate (%)', completionRate, 'Completed submissions / all filtered submissions'],
    ['Scored submissions', scores.length, 'Completed submissions with a numeric score'],
    ['Average score (%)', mean(scores), 'Calculated over scored submissions only'],
    ['Median score (%)', median(scores), 'Middle score across scored submissions'],
    ['Highest score (%)', scores.length ? Math.max(...scores) : null, 'Highest completed score'],
    ['Lowest score (%)', scores.length ? Math.min(...scores) : null, 'Lowest completed score'],
    ['Pass benchmark', mark ? benchmarkLabel(mark, mark.scheme) : 'Not configured', 'Uses the selected scoring system; scaled values are practice estimates'],
    ['Eligible benchmark scores', mark ? eligible.length : null, 'Completed submissions with a saved score on the benchmark scale'],
    ['Passing submissions', passed, 'Completed scored submissions at or above benchmark'],
    ['Pass rate (%)', passed === null || !eligible.length ? null : round(passed / eligible.length * 100), 'Passing / scored submissions'],
    ['Students with at least one pass', mark === null ? null : groups.filter((g) => g.some((r) => validScore(r) && scoreValue(r) !== null && scoreValue(r)! >= mark.value)).length, 'Distinct students passing at least once'],
    ['Scope', 'Current Results filters', 'Search, status and score filters; includes all matching pages'],
  ]
  const summary: Cell[][] = groups.map((group) => {
    const ordered = [...group].sort((a, b) => timestamp(b.completedAt ?? b.startedAt) - timestamp(a.completedAt ?? a.startedAt))
    const completed = group.filter((r) => r.status === 'completed')
    const studentScores = group.filter(validScore).map((r) => r.percentage)
    const recent = ordered.find(validScore)
    const lastLevel = ordered.find((r) => r.levelName)?.levelName ?? ''
    const first = [...group].sort((a, b) => timestamp(a.startedAt) - timestamp(b.startedAt))[0]
    return [ordered[0].studentName, ordered[0].studentEmail, group.length, completed.length,
      group.filter((r) => r.status === 'in_progress').length, group.filter((r) => r.status === 'abandoned').length,
      studentScores.length, mean(studentScores), median(studentScores), studentScores.length ? Math.max(...studentScores) : null,
      recent?.percentage ?? null, mark === null ? null : group.filter((r) => validScore(r) && scoreValue(r) !== null && scoreValue(r)! >= mark.value).length,
      mark === null || !group.some(r => validScore(r) && scoreValue(r) !== null) ? null : round(group.filter(r => validScore(r) && scoreValue(r) !== null && scoreValue(r)! >= mark.value).length / group.filter(r => validScore(r) && scoreValue(r) !== null).length * 100),
      dateText(first?.startedAt ?? null), dateText(ordered[0].completedAt ?? ordered[0].startedAt), lastLevel]
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  const submissions: Cell[][] = [...rows].sort((a, b) => timestamp(b.completedAt ?? b.startedAt) - timestamp(a.completedAt ?? a.startedAt)).map((r) => [
    r.studentName, r.studentEmail, r.status, r.percentage, mark === null || !validScore(r) ? '' : scoreValue(r) === null ? 'Score unavailable' : scoreValue(r)! >= mark.value ? 'Pass' : 'Below benchmark',
    r.correctCount, r.totalQuestions, r.levelName ?? '', dateText(r.startedAt), dateText(r.completedAt), r.id, scoreValue(r),
  ])
  const distribution: Cell[][] = [
    ...scoreBands.map((b) => {
      const count = scores.filter((s) => s >= b.min && s < b.max).length
      return [b.label, count, scores.length ? round(count / scores.length * 100) : null, 'Score band'] as Cell[]
    }),
    ['TOTAL SCORED', scores.length, scores.length ? 100 : null, 'Only completed, numeric scores'],
    [' ', null, null, ' '],
    ...[...levels.entries()].sort((a, b) => b[1] - a[1]).map(([level, count]) => [level, count, scores.length ? round(count / scores.length * 100) : null, 'Evaluation level'] as Cell[]),
  ]
  const sheets: SheetDefinition[] = [
    { name: 'Dashboard', title: 'ASSESSMENT PERFORMANCE DASHBOARD', subtitle, headings: ['Key performance indicator', 'Value', 'How it is calculated'], data: overview, widths: [34, 27, 80], scoreColumns: [1] },
    { name: 'Student Summary', title: 'STUDENT PERFORMANCE SUMMARY', subtitle, headings: ['Student name', 'Student email', 'Submissions', 'Completed', 'In progress', 'Abandoned', 'Scored', 'Average score (%)', 'Median score (%)', 'Best score (%)', 'Latest score (%)', 'Passes', 'Pass rate (%)', 'First started (UTC)', 'Latest activity (UTC)', 'Latest evaluation'], data: summary, widths: [29, 32, 16, 16, 17, 17, 14, 21, 21, 20, 21, 13, 19, 27, 27, 27], scoreColumns: [7, 8, 9, 10, 12] },
    { name: 'Submissions', title: 'INDIVIDUAL ASSESSMENT SUBMISSIONS', subtitle, headings: ['Student name', 'Student email', 'Status', 'Score (%)', 'Benchmark result', 'Correct answers', 'Total questions', 'Evaluation level', 'Started (UTC)', 'Completed (UTC)', 'Attempt ID', 'Benchmark-scale score'], data: submissions, widths: [28, 32, 20, 18, 23, 20, 19, 26, 27, 27, 40, 24], scoreColumns: [3] },
    { name: 'Distribution', title: 'SCORE & EVALUATION DISTRIBUTION', subtitle, headings: ['Score band / evaluation level', 'Submissions', 'Share (%)', 'Group'], data: distribution, widths: [39, 20, 20, 35], scoreColumns: [2] },
  ]
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Aptos"/><color rgb="FF1E293B"/></font><font><b/><sz val="18"/><name val="Aptos Display"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="11"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF102A43"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D4E89"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs></styleSheet>'),
  }
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)) })
  return zipSync(files, { level: 6 })
}
