import { buildPublishedStudioSections, type PublishedStudioTemplate } from './publishedStudioTypes'
import { exportElementToPDF } from './pdfExport'
import { studentScoreDisplay } from './scoringSchemes'
import type { ReportData, QuestionReviewItem } from '../components/Reports/Types'
import type { ActionPlan } from './surveyService'

// Text-first PDF export avoids html2canvas' unsupported CSS colors and enormous
// single-canvas captures. It uses only saved, authorized report data.
export interface DiagnosticPdfSection { title: string; lines: string[] }

function text(value: unknown, fallback = 'Not recorded'): string {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
function plainBlocks(blocks: unknown): string {
  if (typeof blocks === 'string') return blocks
  if (!Array.isArray(blocks)) return ''
  return blocks.map(block => {
    if (!block || typeof block !== 'object') return ''
    if (block.type === 'image') return `[Diagram/image${block.caption ? `: ${block.caption}` : ''} - use Print for image]`
    return text(block.content ?? block.text ?? block.value ?? block.latex ?? '', '')
  }).filter(Boolean).join(' ')
}
function answerFor(question: QuestionReviewItem): string {
  const answer = question.student_answer || {}
  const choices = Array.isArray(question.choices) ? question.choices : []
  const rawIdx = answer.choice_idx
  const idx = typeof rawIdx === 'number' ? rawIdx : typeof rawIdx === 'string' && rawIdx.trim() ? Number(rawIdx) : NaN
  if (Number.isInteger(idx) && idx >= 0 && idx < choices.length) return plainBlocks(choices[idx].content_blocks) || `Option ${idx + 1}`
  const chosen = answer.choice_ids ?? answer.selected_choice_ids ?? answer.choice_id
  if (chosen !== undefined && chosen !== null) {
    const ids = (Array.isArray(chosen) ? chosen : [chosen]).map(String)
    const selected = choices.filter(c => ids.includes(String(c.id)))
    return selected.length ? selected.map(c => plainBlocks(c.content_blocks)).join('; ') : ids.join(', ')
  }
  const value = answer.value ?? answer.text ?? answer.numerical
  return text(value, question.status === 'unanswered' ? 'Unanswered' : 'Not recorded')
}
function safeNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n) ? n : null
}
function percentage(value: unknown): string {
  const n = safeNumber(value)
  return n === null ? 'Not recorded' : `${Math.round(n * 10) / 10}%`
}
function duration(value: unknown): string {
  const n = safeNumber(value)
  return n === null ? 'Not recorded' : `${Math.round(n)} seconds`
}
export function buildDiagnosticPdfSections(report: ReportData, studentName: string, plan?: ActionPlan | null, studio?: PublishedStudioTemplate | null): DiagnosticPdfSection[] {
  const info = report.student_info
  const overall = report.overall
  const questions = Array.isArray(report.questions) ? report.questions : []
  const breakdowns = Array.isArray(report.breakdowns) ? report.breakdowns : []
  const courses = Array.isArray(report.courses) ? report.courses : []
  const studentScore = studentScoreDisplay(report.scoring)
  const examMode = Boolean(studentScore?.maximum)
  const sections: DiagnosticPdfSection[] = [
    { title: 'Student and assessment', lines: [
      `Student: ${studentName}`,
      `Assessment: ${text(info.assessment_name)}`,
      `Completed: ${info.completed_at ? new Date(info.completed_at).toLocaleString() : 'Not recorded'}`,
      `Assessment version: ${text((info as typeof info & { assessment_version?: number }).assessment_version)}`,
    ] },
    { title: 'Saved assessment result', lines: [
      `Overall score: ${studentScore?.value || percentage(overall.percentage)}`,
      ...(!examMode ? [
        `Correct: ${text(overall.correct_count)} / ${text(overall.total_questions)}`,
        `Points: ${text(overall.points_earned)} / ${text(overall.points_possible)}`,
        `Incorrect: ${text(overall.incorrect_count)}`,
        `Unanswered: ${text(overall.unanswered_count)}`,
      ] : []),
      `Duration: ${duration(info.total_time_seconds)}`,
      `Evaluation level: ${overall.level?.name || 'Not assigned in saved result'}`,
    ] },
  ]
  if (studio) {
    const studioSections = buildPublishedStudioSections(studio, report)
    sections.push({ title: `Published diagnostic design v${studio.version}`, lines: [studio.layout.title] })
    for (const section of studioSections) sections.push({ title: section.title, lines: section.items.flatMap(item => item.rows?.length ? [item.title, ...item.rows.map(row => `${row.label}: ${row.correct}/${row.count} correct (${row.percentage.toFixed(1)}%)`)] : item.segments?.length ? [item.title, ...item.segments.map(segment => `${segment.label}: ${segment.count} (${segment.percentage.toFixed(1)}%)`)] : [`${item.title}: ${item.value}`]) })
  }
  if (studentScore) sections.push({ title: examMode ? 'Exam-style scaled results' : 'Saved scoring scheme',
    lines: [...studentScore.lines, ...(studentScore.note ? [studentScore.note] : [])] })
  if (!studio && breakdowns.length) sections.push({ title: 'Saved domain breakdowns', lines: breakdowns.map(row =>
    `${text(row.type)} - ${text(row.label)}: ${percentage(row.percentage)}${examMode ? '' : `, ${text(row.correct_count)}/${text(row.total_questions)} correct`}`),
  })
  if (questions.length) sections.push({ title: 'Question-by-question review', lines: questions.flatMap((q, index) => [
    `Question ${index + 1}: ${plainBlocks(q.content_blocks) || 'Question text not saved'}`,
    `Status: ${q.status || (q.is_correct ? 'correct' : 'incorrect')}${examMode ? '' : ` | ${text(q.points_earned)} / ${text(q.points_possible)} points`} | Difficulty: ${text(q.difficulty)}`,
    `Student answer: ${answerFor(q)}`,
    '',
  ]) })
  if (!studio && overall.level?.recommendation) sections.push({ title: 'Saved evaluation recommendation', lines: [overall.level.recommendation] })
  if (plan) sections.push({ title: 'Personalized action plan (matched from survey)', lines: [
    plan.title, plan.summary,
    ...plan.milestones.flatMap((m, index) => [`Phase ${index + 1}: ${m.title} (${m.timeframe})`, m.description, ...m.tasks.map(t => `- ${t}`)]),
  ] })
  if (courses.length) sections.push({ title: 'Saved learning resources', lines: courses.map(course =>
    `${course.name}${course.description ? ` - ${course.description}` : ''}${course.registration_url ? ` (${course.registration_url})` : ''}`),
  })
  return sections
}

export async function exportDiagnosticReportPDF({
  report, studentName, filename, plan, studio, element, autoDownload = true,
}: { report: ReportData; studentName: string; filename: string; plan?: ActionPlan | null; studio?: PublishedStudioTemplate | null; element?: HTMLElement | null; autoDownload?: boolean }) {
  // Browser downloads capture the exact rendered report surface. Data-only callers keep the text-first fallback.
  if (element) return exportElementToPDF({ element, filename, autoDownload })
  const { jsPDF: JsPDF } = await import('jspdf')
  const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  // Presentation-only PDF layout. Every score and answer comes from the saved report.
  const left = 19
  const right = 191
  const usableWidth = right - left
  const pageHeight = 297
  const pageBottom = 276
  const navy: [number, number, number] = [21, 40, 63]
  const jade: [number, number, number] = [84, 134, 125]
  let y = 51
  const drawPageHeader = (continuation = false) => {
    pdf.setFillColor(...navy)
    pdf.rect(0, 0, 210, continuation ? 22 : 39, 'F')
    pdf.setFillColor(...jade)
    pdf.rect(0, continuation ? 22 : 39, 210, 1.5, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(continuation ? 11 : 17)
    pdf.text(continuation ? 'ASSESSMENT REPORT' : 'STUDENT ASSESSMENT REPORT', left, continuation ? 14 : 20)
    if (!continuation) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.text(normalize(studentName).slice(0, 95), left, 29)
    }
  }
  const nextPage = () => {
    pdf.addPage()
    drawPageHeader(true)
    y = 33
  }
  const ensure = (height: number) => {
    if (y + height > pageBottom) nextPage()
  }
  const normalize = (s: string) => s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u2022/g, '-').replace(/\u00a0/g, ' ')
  const paragraph = (value: string) => {
    const clean = normalize(value)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9.5)
    pdf.setTextColor(51, 65, 85)
    const lines = pdf.splitTextToSize(clean || ' ', usableWidth) as string[]
    for (const line of lines) {
      ensure(5.4)
      pdf.text(line, left, y)
      y += 5.4
    }
  }
  drawPageHeader()
  for (const section of buildDiagnosticPdfSections(report, studentName, plan, studio)) {
    ensure(17)
    pdf.setFillColor(241, 246, 244)
    pdf.roundedRect(left - 2, y - 5.5, usableWidth + 4, 10.5, 1.7, 1.7, 'F')
    pdf.setFillColor(...jade)
    pdf.rect(left - 2, y - 5.5, 1.4, 10.5, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(...navy)
    pdf.text(normalize(section.title), left + 2, y + 1.3)
    y += 12
    for (const line of section.lines) {
      paragraph(line)
      if (!line) y += 1
    }
    y += 6
  }
  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i)
    pdf.setDrawColor(227, 234, 233)
    pdf.line(left, pageHeight - 18, right, pageHeight - 18)
    pdf.setTextColor(104, 119, 132)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.text(`MathSystem  |  Page ${i} of ${pages}`, left, pageHeight - 11)
  }
  const base64 = pdf.output('datauristring')
  const blob = pdf.output('blob')
  if (autoDownload) pdf.save(filename)
  return { pdf, base64, blob, filename }
}
