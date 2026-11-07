import type jsPDF from 'jspdf'

export interface PDFExportOptions {
  element: HTMLElement
  filename?: string
  autoDownload?: boolean
  onBeforeClone?: (element: HTMLElement) => void
  onAfterClone?: (clone: HTMLElement) => void
}

export interface PDFExportResult {
  pdf: jsPDF
  base64: string
  blob: Blob
  filename: string
}

/** A4, millimetres. All report blocks are rendered at one consistent width. */
const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const SIDE_MARGIN = 11
const TOP_MARGIN = 11
const FOOTER_RESERVED = 17
const BLOCK_GAP = 3.5
const CONTENT_WIDTH = PAGE_WIDTH - SIDE_MARGIN * 2
const CONTENT_HEIGHT = PAGE_HEIGHT - TOP_MARGIN - FOOTER_RESERVED
const CAPTURE_WIDTH_PX = 920
const CAPTURE_SCALE = 2

function addFooter(pdf: jsPDF, page: number, total: number): void {
  const ruleY = PAGE_HEIGHT - 12
  pdf.setLineWidth(0.25)
  pdf.setDrawColor(223, 231, 239)
  pdf.line(SIDE_MARGIN, ruleY, PAGE_WIDTH - SIDE_MARGIN, ruleY)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(100, 116, 139)
  pdf.text('MathSystem  |  Student Diagnostic Report', SIDE_MARGIN, PAGE_HEIGHT - 7)
  pdf.text(`${page} / ${total}`, PAGE_WIDTH - SIDE_MARGIN, PAGE_HEIGHT - 7, { align: 'right' })
}

function isPrintable(node: HTMLElement): boolean {
  if (node.matches('.no-print, .pdf-capture-hidden')) return false
  if (node.closest('.no-print, .pdf-capture-hidden')) return false
  const style = getComputedStyle(node)
  const hasContent = Boolean(node.textContent?.trim()) || Boolean(node.querySelector('svg, img, canvas, table'))
  return hasContent && node.getBoundingClientRect().height > 5 && style.display !== 'none' && style.visibility !== 'hidden'
}

/**
 * Capture only actual report content, not the outer app shell. The previous
 * implementation captured a wide viewport, then shrunk its narrow report
 * column into A4; that was the reason the report text looked tiny.
 */
function reportBlocks(element: HTMLElement): HTMLElement[] {
  const blocks: HTMLElement[] = []
  const pinned = element.querySelector<HTMLElement>('section[aria-label="Published diagnostic report"]')
  if (pinned && isPrintable(pinned)) return [pinned]

  const reportContent = element.querySelector<HTMLElement>('.ms-report-content')
  if (reportContent) {
    blocks.push(...Array.from(reportContent.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && isPrintable(child),
    ))
  }

  // A caller without MathSystem's report classes can still export its content.
  return blocks.length ? blocks : [element]
}

function copyCanvasContent(source: HTMLElement, clone: HTMLElement): void {
  const originals = Array.from(source.querySelectorAll('canvas'))
  const copies = Array.from(clone.querySelectorAll('canvas'))
  originals.forEach((original, i) => {
    const target = copies[i]
    const context = target?.getContext('2d')
    if (!context) return
    target.width = original.width
    target.height = original.height
    context.drawImage(original, 0, 0)
  })
}

/** Candidate *internal* boundaries used only when a block exceeds one page. */
function internalBreaks(stage: HTMLElement, content: HTMLElement, canvasWidth: number): number[] {
  const bounds = stage.getBoundingClientRect()
  const ratio = canvasWidth / Math.max(1, bounds.width)
  const nodes = content.querySelectorAll<HTMLElement>(
    '[data-pdf-question-card], article, section, li, [data-pdf-section], [class*="rounded-xl"], [class*="rounded-2xl"], .space-y-3 > *, .space-y-4 > *',
  )
  const positions = Array.from(nodes)
    .filter(isPrintable)
    .flatMap((node) => {
      const rect = node.getBoundingClientRect()
      const bottom = Math.round((rect.bottom - bounds.top) * ratio)
      // Question cards should start on a new page rather than being sliced through.
      return node.matches('[data-pdf-question-card]')
        ? [Math.round((rect.top - bounds.top) * ratio), bottom]
        : [bottom]
    })
    .filter((position) => position > 0)
    .sort((a, b) => a - b)
  return positions.filter((value, index) => index === 0 || value - positions[index - 1] > 12)
}

type CapturedBlock = { canvas: HTMLCanvasElement; breaks: number[] }

async function captureBlock(
  original: HTMLElement,
  html2canvas: (element: HTMLElement, options: Record<string, unknown>) => Promise<HTMLCanvasElement>,
  onBeforeClone?: (element: HTMLElement) => void,
  onAfterClone?: (clone: HTMLElement) => void,
): Promise<CapturedBlock> {
  // Keep the complete Tailwind/report ancestor context, but use a width that
  // corresponds to the printable A4 area, rather than the user's viewport.
  const stage = document.createElement('div')
  stage.className = 'print-page ms-report-shell ms-pdf-export bg-slate-50 text-slate-900'
  stage.style.cssText = [
    'position:fixed', 'left:0', 'top:0', `width:${CAPTURE_WIDTH_PX}px`,
    'height:auto', 'min-height:0', 'max-height:none', 'overflow:visible', 'z-index:-2147483647',
    'pointer-events:none', 'background:#f7f9fc',
  ].join(';')

  const content = document.createElement('div')
  content.className = 'ms-report-content w-full space-y-0 px-2 py-0'
  content.style.maxWidth = 'none'
  // Print-density adjustments apply only to the detached capture stage, never
  // to the student's browser report. They reduce screen-sized card padding,
  // preserve the color palette, and keep ordinary body text readable on A4.
  const printStyle = document.createElement('style')
  printStyle.textContent = `
    /* The print stage is deliberately compact; the real website is untouched. */
    .ms-pdf-export, .ms-pdf-export .ms-report-content { min-height:0 !important; height:auto !important; }
    .ms-pdf-export { font-size:14px !important; line-height:1.38 !important; }
    .ms-pdf-export .ms-report-content { max-width:none !important; }
    .ms-pdf-export .ms-report-content > * { margin-top:0 !important; margin-bottom:0 !important; }
    .ms-pdf-export .ms-report-content section,
    .ms-pdf-export .ms-report-content article { scroll-margin:0 !important; }
    /* Print-specific visual system: restrained density, crisp cards and consistent headings. */
    .ms-pdf-export .ms-report-content { color:#1b2d41 !important; }
    .ms-pdf-export .ms-report-content > section,
    .ms-pdf-export .ms-report-content > div.rounded-2xl {
      border-color:#e2e8f0 !important;
      box-shadow:0 1px 3px rgba(21,42,66,.055) !important;
    }
    .ms-pdf-export .ms-report-content h2 {
      font-weight:700 !important;
      color:#192d45 !important;
      font-size:18px !important;
      line-height:1.25 !important;
    }
    .ms-pdf-export .ms-report-content .ms-report-hero h1,
    .ms-pdf-export .ms-report-content .ms-report-hero h2 { color:#fff !important; }
    .ms-pdf-export .ms-report-hero { padding:20px 26px !important; }
    .ms-pdf-export .ms-report-panel { padding:16px 19px !important; }
    .ms-pdf-export .ms-report-content .p-9 { padding:21px 24px !important; }
    .ms-pdf-export .ms-report-content .p-6 { padding:15px 19px !important; }
    .ms-pdf-export .ms-report-content .p-5 { padding:13px 16px !important; }
    .ms-pdf-export .ms-report-content .p-4 { padding:11px 14px !important; }
    .ms-pdf-export .ms-report-content .py-6 { padding-top:14px !important; padding-bottom:14px !important; }
    .ms-pdf-export .ms-report-content .mt-6 { margin-top:14px !important; }
    .ms-pdf-export .ms-report-content .mt-5 { margin-top:12px !important; }
    .ms-pdf-export .ms-report-content .mt-4 { margin-top:10px !important; }
    .ms-pdf-export .ms-report-content .space-y-6 > :not([hidden]) ~ :not([hidden]) { margin-top:11px !important; }
    .ms-pdf-export .ms-report-content .space-y-4 > :not([hidden]) ~ :not([hidden]) { margin-top:8px !important; }
    .ms-pdf-export .ms-report-content .space-y-3 > :not([hidden]) ~ :not([hidden]) { margin-top:6px !important; }
    .ms-pdf-export .shadow-floating,
    .ms-pdf-export .shadow-sm,
    .ms-pdf-export .shadow-2xs { box-shadow:0 1px 3px rgba(20,40,62,.07) !important; }
    .ms-pdf-export .no-print,
    .ms-pdf-export button:not([data-pdf-question-header]),
    .ms-pdf-export [role=button]:not([data-pdf-question-header]) { display:none !important; }
    /* A question heading is a disclosure button in the website; retain its text in PDF. */
    .ms-pdf-export [data-pdf-question-header] { display:flex !important; cursor:default !important; }
    .ms-pdf-export .ms-report-content h1,
    .ms-pdf-export .ms-report-content h2,
    .ms-pdf-export .ms-report-content h3 { letter-spacing:-.012em !important; }
  `
  stage.appendChild(printStyle)
  const block = original.cloneNode(true) as HTMLElement
  block.classList.remove('mx-auto', 'mt-6')
  block.style.setProperty('margin-top', '0', 'important')
  block.style.setProperty('margin-bottom', '0', 'important')
  content.appendChild(block)
  stage.appendChild(content)
  document.body.appendChild(stage)

  try {
    copyCanvasContent(original, block)
    // PDF-only disclosure state. Source React state is never changed:
    // incorrect questions expand; correct and unanswered questions collapse.
    // This must run before capture to ensure page-break measurements match.
    block.querySelectorAll<HTMLElement>('[data-pdf-question-card]').forEach((card) => {
      const details = card.querySelector<HTMLElement>('[data-pdf-review-details]')
      const header = card.querySelector<HTMLElement>('[data-pdf-question-header]')
      const disclosure = card.querySelector<HTMLElement>('[data-pdf-disclosure-label]')
      const expand = card.dataset.pdfReviewStatus === 'incorrect'
      details?.style.setProperty('display', expand ? 'block' : 'none', 'important')
      header?.setAttribute('aria-expanded', String(expand))
      disclosure?.style.setProperty('display', 'none', 'important')
    })
    onBeforeClone?.(block)
    await document.fonts?.ready
    const canvas = await html2canvas(stage, {
      scale: CAPTURE_SCALE,
      backgroundColor: '#f7f9fc',
      useCORS: true,
      logging: false,
      width: CAPTURE_WIDTH_PX,
      height: Math.ceil(stage.scrollHeight),
      windowWidth: Math.max(window.innerWidth, CAPTURE_WIDTH_PX),
      windowHeight: Math.max(window.innerHeight, Math.ceil(stage.scrollHeight)),
      onclone: (doc: Document, clone: HTMLElement) => {
        clone.querySelectorAll<HTMLElement>('.no-print, .pdf-capture-hidden, button:not([data-pdf-question-header]), [role="button"]:not([data-pdf-question-header]), input, select, textarea')
          .forEach((node) => node.style.setProperty('display', 'none', 'important'))
        clone.style.setProperty('overflow', 'visible', 'important')
        clone.style.setProperty('height', 'auto', 'important')
        clone.querySelectorAll<HTMLElement>('*').forEach((node) => {
          const computed = doc.defaultView?.getComputedStyle(node)
          if (computed && ['scroll', 'auto'].includes(computed.overflowY)) {
            node.style.setProperty('overflow-y', 'visible', 'important')
            node.style.setProperty('max-height', 'none', 'important')
          }
          node.style.setProperty('animation', 'none', 'important')
          node.style.setProperty('transition', 'none', 'important')
        })
        clone.querySelectorAll<HTMLElement>('[data-pdf-question-card]').forEach((card) => {
          const details = card.querySelector<HTMLElement>('[data-pdf-review-details]')
          const expand = card.dataset.pdfReviewStatus === 'incorrect'
          details?.style.setProperty('display', expand ? 'block' : 'none', 'important')
          card.querySelector<HTMLElement>('[data-pdf-disclosure-label]')?.style.setProperty('display', 'none', 'important')
        })
        onAfterClone?.(clone)
      },
    })
    if (!canvas.width || !canvas.height) throw new Error('A report section rendered as an empty image.')
    return { canvas, breaks: internalBreaks(stage, block, canvas.width) }
  } finally {
    stage.remove()
  }
}

function cropCanvas(canvas: HTMLCanvasElement, y: number, height: number): HTMLCanvasElement {
  const cropped = document.createElement('canvas')
  cropped.width = canvas.width
  cropped.height = height
  const ctx = cropped.getContext('2d')
  if (!ctx) throw new Error('Cannot create a PDF page image.')
  ctx.fillStyle = '#f7f9fc'
  ctx.fillRect(0, 0, cropped.width, cropped.height)
  ctx.drawImage(canvas, 0, y, canvas.width, height, 0, 0, canvas.width, height)
  return cropped
}

export async function exportElementToPDF({
  element,
  filename = 'student-diagnostic-report.pdf',
  autoDownload = true,
  onBeforeClone,
  onAfterClone,
}: PDFExportOptions): Promise<PDFExportResult> {
  const [{ default: html2canvas }, { default: JsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])
  const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  let page = 1
  let cursor = TOP_MARGIN

  const newPage = () => {
    pdf.addPage('a4', 'portrait')
    page += 1
    cursor = TOP_MARGIN
  }

  // IMPORTANT: page composition happens at the block level, not by cutting a
  // single screenshot across arbitrary Y coordinates. Short sections always
  // move together onto the next page if they cannot fit the current one.
  for (const source of reportBlocks(element)) {
    const { canvas, breaks } = await captureBlock(source, html2canvas, onBeforeClone, onAfterClone)
    // Ignore zero-height layout artifacts, not actual content.
    if (canvas.height <= 2) { canvas.width = 1; canvas.height = 1; continue }
    const mmPerPx = CONTENT_WIDTH / canvas.width
    const totalHeightMm = canvas.height * mmPerPx

    if (totalHeightMm <= CONTENT_HEIGHT) {
      if (cursor + totalHeightMm > TOP_MARGIN + CONTENT_HEIGHT && cursor > TOP_MARGIN) newPage()
      pdf.addImage(canvas, 'PNG', SIDE_MARGIN, cursor, CONTENT_WIDTH, totalHeightMm, undefined, 'FAST')
      cursor += totalHeightMm + BLOCK_GAP
      canvas.width = 1
      canvas.height = 1
      continue
    }

    // A long section only starts a new page if the remaining space is too short
    // to show its title plus meaningful first content. This avoids large gaps.
    if (cursor > TOP_MARGIN && (TOP_MARGIN + CONTENT_HEIGHT - cursor) < 95) newPage()

    // An exceptionally tall block (usually many reviewed questions) cannot
    // fit intact on one A4 page. Split at inner card boundaries where possible,
    // never omit the remainder. Keep the same visual scale on every page.
    let sourceY = 0
    while (sourceY < canvas.height) {
      let availableMm = TOP_MARGIN + CONTENT_HEIGHT - cursor
      if (availableMm < 40 && cursor > TOP_MARGIN) {
        newPage()
        availableMm = CONTENT_HEIGHT
      }
      const capacityPx = Math.max(1, Math.floor(availableMm / mmPerPx))
      let end = Math.min(canvas.height, sourceY + capacityPx)
      if (end < canvas.height) {
        // Prefer semantic boundaries even when they leave some unused space.
        // The old 75% threshold often sliced a question between its answer and solution.
        const candidates = breaks.filter((point) => point > sourceY + capacityPx * 0.35 && point <= end)
        if (candidates.length) end = candidates[candidates.length - 1]
      }
      const part = cropCanvas(canvas, sourceY, end - sourceY)
      const heightMm = part.height * mmPerPx
      pdf.addImage(part, 'PNG', SIDE_MARGIN, cursor, CONTENT_WIDTH, heightMm, undefined, 'FAST')
      part.width = 1
      part.height = 1
      sourceY = end
      cursor += heightMm + BLOCK_GAP
      if (sourceY < canvas.height) newPage()
    }
    canvas.width = 1
    canvas.height = 1
  }

  for (let i = 1; i <= page; i += 1) {
    pdf.setPage(i)
    addFooter(pdf, i, page)
  }

  if (autoDownload) pdf.save(filename)
  return { pdf, base64: pdf.output('datauristring'), blob: pdf.output('blob'), filename }
}
