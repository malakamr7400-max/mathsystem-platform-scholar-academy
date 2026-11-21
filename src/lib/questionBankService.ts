import { supabase, isSupabaseConfigured } from './supabaseClient'

export interface QuestionChoice {
  id: string
  text: string
  isCorrect: boolean
  rationale?: string
}

export interface QuestionBankItem {
  id: string
  collection?: string
  subject?: string
  domain: string
  chapter: string
  lesson: string
  /** Generic taxonomy nodes assigned to this question. Legacy domain/chapter/lesson remain compatibility fields. */
  taxonomyNodeIds?: string[]
  topic?: string
  difficulty: 'easy' | 'medium' | 'hard'
  questionType: 'multiple_choice' | 'multi_select' | 'grid_in'
  calculatorAllowed: boolean
  estimatedSeconds: number
  targetExam?: string
  prompt: string
  imageUrl?: string
  imageCaption?: string
  choices: QuestionChoice[]
  numericAnswer?: string
  numericAlternateAnswers?: string[]
  gridAnswerKind?: 'numeric' | 'text'
  numericTolerance?: string
  explanation: string
  commonMisconception?: string
  createdAt?: string
  updatedAt?: string
}

export interface QuestionCollection {
  id?: string
  name: string
  description?: string
  targetExam?: string
  colorTag?: string
  questionCount: number
  parentName?: string | null
  createdAt?: string
  updatedAt?: string
}
export interface GenericTaxonomy {
  id: string
  organizationId: string
  name: string
  code?: string
  description?: string
  isActive: boolean
}

export interface GenericTaxonomyNode {
  id: string
  taxonomyId: string
  parentId: string | null
  name: string
  code?: string
  description?: string
  sortOrder: number
  isActive: boolean
}
// Taxonomy Schema: Domain (Unit) -> Chapter -> Lesson
export interface TaxonomyLesson {
  name: string
  code?: string
  description?: string
}

export interface TaxonomyChapter {
  name: string
  code?: string
  lessons: (string | TaxonomyLesson)[]
}

export interface TaxonomyDomain {
  name: string
  unitLabel?: string // e.g. "Unit 1", "Unit 2"
  code?: string
  chapters: TaxonomyChapter[]
}

export type TaxonomyRegistry = Record<string, {
  unitLabel?: string
  code?: string
  chapters: {
    name: string
    code?: string
    lessons: string[]
  }[]
}>

const TAXONOMY_STORAGE_KEY = 'math_diag_custom_taxonomy'
const TAXONOMY_INITIALIZED_FLAG = 'math_diag_taxonomy_initialized_v2'

// 3-Level Categorization Map: Domain(Unit) -> Chapter -> Lesson
export const CURRICULUM_TAXONOMY: TaxonomyRegistry = {
  'Algebra & Functions': {
    unitLabel: 'Unit 1: Foundations of Functions & Algebra',
    code: 'ALG',
    chapters: [
      {
        name: 'Linear Equations & Systems',
        code: 'ALG.1',
        lessons: [
          'Single-Variable Linear Equations',
          'Systems of Linear Equations (2x2 & 3x3)',
          'Linear Inequalities & Shaded Coordinate Regions',
          'Interpreting Slope and Intercepts in Applied Models',
        ],
      },
      {
        name: 'Quadratic & Polynomial Equations',
        code: 'ALG.2',
        lessons: [
          'Factoring Techniques & Root Finding',
          'Quadratic Formula & Discriminant Analysis',
          'Vertex Form & Parabola Optimization',
          'Polynomial Long Division & Remainder Theorem',
          'Higher Degree Roots & Multiplicity',
        ],
      },
      {
        name: 'Exponential & Logarithmic Functions',
        code: 'ALG.3',
        lessons: [
          'Laws of Exponents & Radical Simplification',
          'Logarithmic Properties & Change of Base',
          'Solving Exponential Equations',
          'Exponential Growth & Decay Word Problems',
        ],
      },
      {
        name: 'Rational & Radical Equations',
        code: 'ALG.4',
        lessons: [
          'Operations with Rational Expressions',
          'Extraneous Solutions in Radical Equations',
          'Partial Fractions & Domain Restrictions',
        ],
      },
    ],
  },
  'Geometry & Measurement': {
    unitLabel: 'Unit 2: Spatial, Synthetic & Analytic Geometry',
    code: 'GEO',
    chapters: [
      {
        name: 'Congruence, Similarity & Geometric Proofs',
        code: 'GEO.1',
        lessons: [
          'Triangle Congruence & Similarity Criteria (SSS, SAS, AA)',
          'Parallel Lines & Transversal Angle Theorems',
          'Properties of Polygons & Quadrilaterals',
        ],
      },
      {
        name: 'Circles & Coordinate Geometry',
        code: 'GEO.2',
        lessons: [
          'Arc Length & Sector Area Calculations',
          'Inscribed & Central Angles in Circles',
          'Standard Circle Equations in the Cartesian Plane',
          'Distance, Midpoint & Perpendicular Slope Formulas',
        ],
      },
      {
        name: 'Area, Surface Area & 3D Volume',
        code: 'GEO.3',
        lessons: [
          'Prisms, Pyramids, Cylinders & Cones',
          'Spheres & Composite Geometric Solids',
          'Cross-Sections & Solids of Revolution',
        ],
      },
    ],
  },
  'Trigonometry': {
    unitLabel: 'Unit 3: Trigonometric Formulations & Periodic Functions',
    code: 'TRIG',
    chapters: [
      {
        name: 'Right Triangle Trigonometry',
        code: 'TRIG.1',
        lessons: [
          'Trigonometric Definitions (Sine, Cosine, Tangent)',
          'Special Right Triangles (30-60-90, 45-45-90)',
          'Angles of Elevation and Depression',
        ],
      },
      {
        name: 'Unit Circle & Analytic Identities',
        code: 'TRIG.2',
        lessons: [
          'Radian Measure & Arc Length on the Unit Circle',
          'Pythagorean Trigonometric Identities',
          'Double-Angle and Half-Angle Formulas',
          'Solving Trigonometric Equations on Intervals',
        ],
      },
      {
        name: 'Laws of Sines and Cosines',
        code: 'TRIG.3',
        lessons: [
          'Law of Sines & Ambiguous Case (SSA)',
          'Law of Cosines in Oblique Triangles',
          'Heron\'s Formula & Area of Non-Right Triangles',
        ],
      },
    ],
  },
  'Calculus & Analysis': {
    unitLabel: 'Unit 4: Limits, Differentiation & Integration',
    code: 'CALC',
    chapters: [
      {
        name: 'Limits & Continuity',
        code: 'CALC.1',
        lessons: [
          'Algebraic Limit Evaluation Techniques',
          'Limits at Infinity & Vertical/Horizontal Asymptotes',
          'Continuity and Intermediate Value Theorem',
          'L\'Hôpital\'s Rule for Indeterminate Forms',
        ],
      },
      {
        name: 'Differential Calculus',
        code: 'CALC.2',
        lessons: [
          'Power, Product, & Quotient Differentiation Rules',
          'Chain Rule & Implicit Differentiation',
          'Tangents, Normals, & Rates of Change',
          'Extreme Value Theorem & Optimization',
        ],
      },
      {
        name: 'Integral Calculus & Accumulation',
        code: 'CALC.3',
        lessons: [
          'Riemann Sums & Definite Integrals',
          'Fundamental Theorem of Calculus',
          'Integration by U-Substitution',
          'Area Between Curves & Net Change',
        ],
      },
    ],
  },
  'Statistics & Probability': {
    unitLabel: 'Unit 5: Empirical Data & Probabilistic Models',
    code: 'STAT',
    chapters: [
      {
        name: 'Descriptive Statistics & Data Distributions',
        code: 'STAT.1',
        lessons: [
          'Measures of Center (Mean, Median, Mode)',
          'Standard Deviation & Spread',
          'Box Plots, IQR, & Outlier Detection',
          'Normal Distribution, Z-Scores & Empirical Rule',
        ],
      },
      {
        name: 'Probability Rules & Combinatorics',
        code: 'STAT.2',
        lessons: [
          'Basic Probability & Complement Rule',
          'Independent & Mutually Exclusive Events',
          'Conditional Probability & Two-Way Contingency Tables',
          'Permutations & Combinations in Sampling',
        ],
      },
    ],
  },
}

const STORAGE_KEY = 'math_diag_question_bank'
const COLLECTIONS_STORAGE_KEY = 'math_diag_custom_collections'
const QB_INITIALIZED_FLAG = 'math_diag_qb_initialized_v2'
const COLLECTIONS_INITIALIZED_FLAG = 'math_diag_cols_initialized_v2'

export const INITIAL_COLLECTIONS: QuestionCollection[] = [
  {
    id: 'col-seed-01',
    name: 'EST 1 Math Diagnostic 2025',
    description: 'Core specimen diagnostic collection for EST 1 Math with quadratic, linear, and geometric questions',
    targetExam: 'EST 1 / SAT Math',
    colorTag: 'blue',
    questionCount: 3,
    createdAt: '2025-01-15T10:00:00.000Z',
  },
  {
    id: 'col-seed-02',
    name: 'Algebra Mastery Sprint',
    description: 'Targeted algebraic functions, systems, and exponential sprint collection',
    targetExam: 'EST 1 / SAT Math',
    colorTag: 'emerald',
    questionCount: 1,
    createdAt: '2025-01-18T14:00:00.000Z',
  },
  {
    id: 'col-seed-03',
    name: 'Trigonometry & Calculus Pack',
    description: 'Advanced analytic identities, derivatives, and rates of change',
    targetExam: 'EST 2 / SAT Subject',
    colorTag: 'purple',
    questionCount: 2,
    createdAt: '2025-01-19T16:00:00.000Z',
  },
  {
    id: 'col-seed-04',
    name: 'General Question Bank',
    description: 'Default uncategorized question pool',
    targetExam: 'General',
    colorTag: 'slate',
    questionCount: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
  },
]

// Initial Seed Questions (organized into collections)
export const SAMPLE_SECTOR_DIAGRAM_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 360" width="100%" height="100%" style="background-color:%23f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <defs>
    <linearGradient id="sectorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="%233b82f6" stop-opacity="0.28" />
      <stop offset="100%" stop-color="%2360a5fa" stop-opacity="0.12" />
    </linearGradient>
  </defs>
  <!-- Full circle dashed outline -->
  <circle cx="230" cy="190" r="140" fill="none" stroke="%23cbd5e1" stroke-width="2" stroke-dasharray="5,5" />
  <!-- Shaded 60 degree sector OAB -->
  <path d="M 230 190 L 370 190 A 140 140 0 0 0 300 68.8 Z" fill="url(%23sectorGrad)" stroke="%232563eb" stroke-width="3" stroke-linejoin="round" />
  <!-- Radii segments -->
  <line x1="230" y1="190" x2="370" y2="190" stroke="%232563eb" stroke-width="2.5" />
  <line x1="230" y1="190" x2="300" y2="68.8" stroke="%232563eb" stroke-width="2.5" />
  <!-- Angle arc indicator at center -->
  <path d="M 270 190 A 40 40 0 0 0 250 155.3" fill="none" stroke="%23d97706" stroke-width="2.5" />
  <text x="272" y="166" font-size="14" font-weight="bold" fill="%23b45309">60°</text>
  <!-- Center point O -->
  <circle cx="230" cy="190" r="4.5" fill="%231e293b" />
  <text x="208" y="202" font-size="16" font-weight="bold" fill="%230f172a">O</text>
  <!-- Vertex A -->
  <circle cx="370" cy="190" r="4" fill="%232563eb" />
  <text x="382" y="195" font-size="16" font-weight="bold" fill="%231d4ed8">A</text>
  <!-- Vertex B -->
  <circle cx="300" cy="68.8" r="4" fill="%232563eb" />
  <text x="306" y="58" font-size="16" font-weight="bold" fill="%231d4ed8">B</text>
  <!-- Radius label r = 6 cm on OA -->
  <rect x="275" y="200" width="76" height="24" rx="6" fill="%23ffffff" stroke="%23e2e8f0" />
  <text x="313" y="216" font-size="13" font-weight="600" fill="%23334155" text-anchor="middle">r = 6 cm</text>
  <!-- Radius label on OB -->
  <rect x="228" y="105" width="76" height="24" rx="6" fill="%23ffffff" stroke="%23e2e8f0" />
  <text x="266" y="121" font-size="13" font-weight="600" fill="%23334155" text-anchor="middle">r = 6 cm</text>
  <!-- Arc AB note -->
  <text x="360" y="125" font-size="13" font-style="italic" fill="%2364748b">Arc AB</text>
</svg>`

export const INITIAL_SEED_QUESTIONS: QuestionBankItem[] = [
  {
    id: 'qb-seed-01',
    collection: 'EST 1 Math Diagnostic 2025',
    domain: 'Algebra & Functions',
    chapter: 'Quadratic & Polynomial Equations',
    lesson: 'Quadratic Formula & Discriminant Analysis',
    difficulty: 'medium',
    questionType: 'multiple_choice',
    calculatorAllowed: false,
    estimatedSeconds: 90,
    targetExam: 'EST 1 / SAT Math',
    prompt:
      'For the quadratic equation $2x^2 - 4x + k = 0$, what value of $k$ will yield exactly one real distinct root?',
    choices: [
      {
        id: 'c1',
        text: '$k = 2$',
        isCorrect: true,
        rationale: 'Discriminant $\\Delta = (-4)^2 - 4(2)(k) = 16 - 8k = 0 \\implies k = 2$.',
      },
      {
        id: 'c2',
        text: '$k = 4$',
        isCorrect: false,
        rationale: 'If $k = 4$, $\\Delta = 16 - 32 = -16 < 0$ which produces complex roots.',
      },
      {
        id: 'c3',
        text: '$k = -2$',
        isCorrect: false,
        rationale: 'Common sign error in applying $-4ac$.',
      },
      {
        id: 'c4',
        text: '$k = 0$',
        isCorrect: false,
        rationale: 'If $k = 0$, the equation $2x(x - 2) = 0$ yields two distinct roots: $0$ and $2$.',
      },
    ],
    explanation:
      'For any quadratic equation $ax^2 + bx + c = 0$ to possess exactly one repeated real solution, the discriminant must be zero:\n\n$$\\Delta = b^2 - 4ac = 0$$\n\nHere $a = 2$, $b = -4$, and $c = k$. Substituting these parameters:\n\n$$(-4)^2 - 4(2)(k) = 0$$\n$$16 - 8k = 0 \\implies 8k = 16 \\implies k = 2$$',
    commonMisconception:
      'Students frequently confuse the condition for two distinct real roots ($\\Delta > 0$) with the condition for exactly one root ($\\Delta = 0$), or miscalculate $(-4)^2$ as $-16$.',
    createdAt: '2025-01-15T10:00:00.000Z',
  },
  {
    id: 'qb-seed-02',
    collection: 'EST 1 Math Diagnostic 2025',
    domain: 'Algebra & Functions',
    chapter: 'Linear Equations & Systems',
    lesson: 'Systems of Linear Equations (2x2 & 3x3)',
    difficulty: 'hard',
    questionType: 'multiple_choice',
    calculatorAllowed: false,
    estimatedSeconds: 105,
    targetExam: 'EST 1 / SAT Math',
    prompt:
      'In the system of equations below, $p$ is a constant. If the system has no solution, what is the value of $p$?\n\n$$\\begin{cases} 3x - 5y = 12 \\\\ px + 10y = 7 \\end{cases}$$',
    choices: [
      {
        id: 'c1',
        text: '$p = -6$',
        isCorrect: true,
        rationale: 'Parallel lines require matching slope ratios: $3/p = -5/10 = -1/2 \\implies p = -6$.',
      },
      {
        id: 'c2',
        text: '$p = 6$',
        isCorrect: false,
        rationale: 'Sign error when comparing negative y-coefficient to positive.',
      },
      {
        id: 'c3',
        text: '$p = -15$',
        isCorrect: false,
        rationale: 'Incorrect cross multiplication.',
      },
      {
        id: 'c4',
        text: '$p = 10$',
        isCorrect: false,
        rationale: 'Confusing y-coefficient with target x-coefficient.',
      },
    ],
    explanation:
      'A linear system of two equations has no solution if and only if the lines are strictly parallel (identical slopes with differing y-intercepts).\n\nThe slope of the first line is $m_1 = -\\frac{3}{-5} = \\frac{3}{5}$.\nThe slope of the second line is $m_2 = -\\frac{p}{10}$.\n\nSetting slopes equal:\n$$\\frac{3}{5} = -\\frac{p}{10} \\implies 5p = -30 \\implies p = -6$$\n\nBecause the constant terms are not proportional ($12/7 \\neq -5/10$), the lines do not coincide and there is no solution.',
    commonMisconception:
      'Students often invert the slope formula or miss the negative sign in the ratio $a_1/a_2 = b_1/b_2 \\neq c_1/c_2$.',
    createdAt: '2025-01-16T11:00:00.000Z',
  },
  {
    id: 'qb-seed-03',
    collection: 'EST 1 Math Diagnostic 2025',
    domain: 'Geometry & Measurement',
    chapter: 'Circles & Coordinate Geometry',
    lesson: 'Arc Length & Sector Area Calculations',
    difficulty: 'medium',
    questionType: 'multiple_choice',
    calculatorAllowed: true,
    estimatedSeconds: 75,
    targetExam: 'EST 1 / SAT Math',
    prompt:
      'A circle with center $O$ has radius $r = 6\\text{ cm}$. A central angle $\\theta = 60^\\circ$ intercepts an arc $AB$. What is the area of sector $OAB$ in terms of $\\pi$?',
    imageUrl: SAMPLE_SECTOR_DIAGRAM_SVG,
    imageCaption: 'Circular sector OAB with central angle θ = 60° and radius r = 6 cm',
    choices: [
      {
        id: 'c1',
        text: '$6\\pi\\text{ cm}^2$',
        isCorrect: true,
        rationale: 'Area = $(\\theta / 360) \\pi r^2 = (60/360) \\pi (36) = \\frac{1}{6} \\cdot 36\\pi = 6\\pi$.',
      },
      {
        id: 'c2',
        text: '$12\\pi\\text{ cm}^2$',
        isCorrect: false,
        rationale: 'Multiplied by diameter instead of squaring radius.',
      },
      {
        id: 'c3',
        text: '$2\\pi\\text{ cm}^2$',
        isCorrect: false,
        rationale: 'Calculated arc length instead of sector area.',
      },
      {
        id: 'c4',
        text: '$36\\pi\\text{ cm}^2$',
        isCorrect: false,
        rationale: 'Calculated full circle area without fractioning the central angle.',
      },
    ],
    explanation:
      'The area of a circular sector is the fraction of the total circular area swept out by its central angle:\n\n$$\\text{Sector Area} = \\frac{\\theta}{360^\\circ} \\cdot \\pi r^2$$\n\nSubstitute $\\theta = 60^\\circ$ and $r = 6$:\n\n$$\\text{Sector Area} = \\frac{60^\\circ}{360^\\circ} \\cdot \\pi (6^2) = \\frac{1}{6} \\cdot 36\\pi = 6\\pi\\text{ cm}^2$$',
    commonMisconception:
      'Confusing the arc length formula ($s = \\frac{\\theta}{360} 2\\pi r$) with the sector area formula.',
    createdAt: '2025-01-17T09:30:00.000Z',
  },
  {
    id: 'qb-seed-04',
    collection: 'Algebra Mastery Sprint',
    domain: 'Algebra & Functions',
    chapter: 'Exponential & Logarithmic Functions',
    lesson: 'Solving Exponential Equations',
    difficulty: 'easy',
    questionType: 'grid_in',
    calculatorAllowed: false,
    estimatedSeconds: 60,
    targetExam: 'EST 1 / SAT Math',
    prompt:
      'If $4^{2x + 1} = 64$, what is the value of $x$?',
    choices: [],
    numericAnswer: '1',
    numericTolerance: '0',
    explanation:
      'Express both sides with the same base:\n\n$$4^{2x + 1} = 4^3$$\n\nEquating exponents:\n$$2x + 1 = 3 \\implies 2x = 2 \\implies x = 1$$',
    commonMisconception:
      'Incorrectly converting $64$ to base $4$ as $4^4$ instead of $4^3$.',
    createdAt: '2025-01-18T14:00:00.000Z',
  },
  {
    id: 'qb-seed-05',
    collection: 'Trigonometry & Calculus Pack',
    domain: 'Trigonometry',
    chapter: 'Unit Circle & Analytic Identities',
    lesson: 'Pythagorean Trigonometric Identities',
    difficulty: 'medium',
    questionType: 'multiple_choice',
    calculatorAllowed: false,
    estimatedSeconds: 80,
    targetExam: 'EST 2 / SAT Subject',
    prompt:
      'Given that $\\sin(\\theta) = \\frac{3}{5}$ and $\\frac{\\pi}{2} < \\theta < \\pi$, what is the exact value of $\\cos(\\theta)$?',
    choices: [
      {
        id: 'c1',
        text: '$-\\frac{4}{5}$',
        isCorrect: true,
        rationale: 'In Quadrant II, cosine is negative: $-\\sqrt{1 - (3/5)^2} = -4/5$.',
      },
      {
        id: 'c2',
        text: '$\\frac{4}{5}$',
        isCorrect: false,
        rationale: 'Forgot that cosine is negative in Quadrant II.',
      },
      {
        id: 'c3',
        text: '$-\\frac{3}{4}$',
        isCorrect: false,
        rationale: 'Calculated tangent rather than cosine.',
      },
      {
        id: 'c4',
        text: '$\\frac{5}{3}$',
        isCorrect: false,
        rationale: 'Inverted ratio to cosecant.',
      },
    ],
    explanation:
      'Using the fundamental Pythagorean trigonometric identity:\n\n$$\\sin^2(\\theta) + \\cos^2(\\theta) = 1$$\n$$\\left(\\frac{3}{5}\\right)^2 + \\cos^2(\\theta) = 1 \\implies \\frac{9}{25} + \\cos^2(\\theta) = 1$$\n$$\\cos^2(\\theta) = 1 - \\frac{9}{25} = \\frac{16}{25} \\implies \\cos(\\theta) = \\pm \\frac{4}{5}$$\n\nSince $\\frac{\\pi}{2} < \\theta < \\pi$ places the angle in **Quadrant II**, the x-coordinate (cosine) is negative. Therefore:\n\n$$\\cos(\\theta) = -\\frac{4}{5}$$',
    commonMisconception:
      'Failing to verify the quadrant constraint and selecting $+4/5$.',
    createdAt: '2025-01-19T16:00:00.000Z',
  },
  {
    id: 'qb-seed-06',
    collection: 'Trigonometry & Calculus Pack',
    domain: 'Calculus & Analysis',
    chapter: 'Differential Calculus',
    lesson: 'Tangents, Normals, & Rates of Change',
    difficulty: 'hard',
    questionType: 'multiple_choice',
    calculatorAllowed: false,
    estimatedSeconds: 120,
    targetExam: 'AP Calculus AB/BC',
    prompt:
      'Find the equation of the line tangent to the curve $f(x) = x^3 - 3x^2 + 2$ at the point where $x = 2$.',
    choices: [
      {
        id: 'c1',
        text: '$y = -2$',
        isCorrect: true,
        rationale: 'Slope $f\'(2) = 3(4) - 6(2) = 0$. Since $f(2) = -2$, tangent is horizontal: $y = -2$.',
      },
      {
        id: 'c2',
        text: '$y = 3x - 8$',
        isCorrect: false,
        rationale: 'Derivative power rule calculation error.',
      },
      {
        id: 'c3',
        text: '$y = -3x + 4$',
        isCorrect: false,
        rationale: 'Incorrect evaluation of slope.',
      },
      {
        id: 'c4',
        text: '$y = 0$',
        isCorrect: false,
        rationale: 'Confusing root of derivative with y-value on curve.',
      },
    ],
    explanation:
      'First compute the derivative function $f\'(x)$:\n\n$$f\'(x) = 3x^2 - 6x$$\n\nEvaluate at $x = 2$ to find the slope $m$ of the tangent line:\n\n$$m = f\'(2) = 3(2)^2 - 6(2) = 12 - 12 = 0$$\n\nNext evaluate $f(2)$ to identify the point of tangency $(x_0, y_0)$:\n\n$$y_0 = f(2) = 2^3 - 3(2)^2 + 2 = 8 - 12 + 2 = -2$$\n\nUsing point-slope form:\n$$y - (-2) = 0(x - 2) \\implies y + 2 = 0 \\implies y = -2$$',
    commonMisconception:
      'Overlooking that a derivative of $0$ produces a horizontal tangent line of the form $y = c$.',
    createdAt: '2025-01-20T10:00:00.000Z',
  },
]

let _questionsCache: QuestionBankItem[] = []
let _hasLoadedQuestions = false

// The Supabase schema differs between deployments. Once PostgREST confirms a
// duration column is missing, remember that for this browser session instead of
// repeating one or two failed HTTP requests for every question.
let _questionDurationColumn: 'estimated_seconds' | 'time_limit_seconds' | null = 'estimated_seconds'

// Database-backed taxonomy cache - starts empty, strictly populated from database
let _taxonomyCache: TaxonomyRegistry = {}
let _hasLoadedTaxonomy = false
let _isFetchingTaxonomy = false
const _taxonomyListeners = new Set<(tax: TaxonomyRegistry) => void>()
const _supabaseDomainIdMap = new Map<string, string>()
const _supabaseChapterIdMap = new Map<string, string>()
const _supabaseLessonIdMap = new Map<string, string>()

let _collectionsCache: QuestionCollection[] = []
let _hasLoadedCollections = false

// Scoped to a single import. Never cache another user's organization or permissions
// across sessions. The normal single-question save path remains unchanged.
interface ImportSyncContext {
  organizationId: string
  answerTypeIds: Map<string, string>
  questionSetIds: Map<string, Promise<string>>
}

async function buildImportSyncContext(): Promise<ImportSyncContext> {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!auth.user?.id) throw new Error('Sign in before importing questions.')
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('organization_id, role').eq('id', auth.user.id).single()
  if (profileError) throw profileError
  if (!profile?.organization_id || !['admin', 'teacher'].includes(String(profile.role).toLowerCase())) {
    throw new Error('Your account is not permitted to import questions.')
  }
  const { data: answerTypes, error: answerTypeError } = await supabase
    .from('answer_types').select('id, code').eq('is_active', true)
  if (answerTypeError) throw answerTypeError
  const answerTypeIds = new Map<string, string>()
  for (const answerType of answerTypes || []) {
    const key = String(answerType.code || '').toUpperCase()
    if (key && !answerTypeIds.has(key)) answerTypeIds.set(key, String(answerType.id))
  }
  if (!answerTypeIds.has('MCQ') && !answerTypeIds.has('MULTIPLE_CHOICE')) {
    throw new Error('Multiple-choice answer type is not configured in Staging.')
  }
  return { organizationId: String(profile.organization_id), answerTypeIds, questionSetIds: new Map() }
}

/**
 * Resolve exactly one question_set in the signed-in organization. Never hide a
 * multiple-row error by inserting another duplicate, and never select a set
 * belonging to a different organization. The database unique index installed
 * after the guarded Staging cleanup is the final concurrency protection.
 */
async function resolveQuestionSetId(organizationId: string, collectionName: string): Promise<string> {
  const title = collectionName.trim()
  if (!title) throw new Error('Collection name cannot be empty.')
  const normalized = title.toLocaleLowerCase()

  const lookup = async (): Promise<string[]> => {
    const { data, error } = await supabase.from('question_sets')
      .select('id, title')
      .eq('organization_id', organizationId)
      .ilike('title', title)
      .limit(2)
    if (error) throw error
    return (data || [])
      .filter((row) => String(row.title || '').trim().toLocaleLowerCase() === normalized)
      .map((row) => String(row.id))
  }

  const matchingIds = await lookup()
  if (matchingIds.length > 1) {
    throw new Error(`Collection "${title}" has duplicate database records. Import stopped safely; ask an administrator to complete the Staging collection repair.`)
  }
  if (matchingIds.length === 1) return matchingIds[0]

  const { data: created, error: createError } = await supabase.from('question_sets')
    .insert({ organization_id: organizationId, title })
    .select('id').single()
  if (!createError && created?.id) return String(created.id)

  // After the unique index is installed, concurrent inserts produce 23505.
  // Reuse the winning row, but do not mistake multiple matches for success.
  if (createError?.code === '23505') {
    const concurrentIds = await lookup()
    if (concurrentIds.length === 1) return concurrentIds[0]
    if (concurrentIds.length > 1) {
      throw new Error(`Collection "${title}" has duplicate database records. Import stopped safely.`)
    }
    throw new Error(`Collection "${title}" already exists with a conflicting name. Refresh and try again.`)
  }
  if (createError) throw createError
  throw new Error(`Unable to confirm the database collection "${title}" was created.`)
}

async function getImportQuestionSetId(context: ImportSyncContext, collectionName: string): Promise<string> {
  const key = collectionName.trim().toLocaleLowerCase()
  let pending = context.questionSetIds.get(key)
  if (!pending) {
    pending = resolveQuestionSetId(context.organizationId, collectionName)
    context.questionSetIds.set(key, pending)
  }
  return pending
}

interface DetectedTaxonomySchema {
  hasTaxonomyTable: boolean
  hasCurriculumTaxonomyTable: boolean
  hasCategoriesTable: boolean
  columns: Set<string>
  isFlatDenormalized: boolean
  isHierarchical: boolean
  isJsonDocument: boolean
}

const _detectedTaxonomySchema: DetectedTaxonomySchema = {
  hasTaxonomyTable: false,
  hasCurriculumTaxonomyTable: false,
  hasCategoriesTable: false,
  columns: new Set<string>(),
  isFlatDenormalized: false,
  isHierarchical: false,
  isJsonDocument: false,
}

// Universal parser for rows returned from Supabase tables
function parseSupabaseTaxonomyRows(rows: any[], targetTax: TaxonomyRegistry): number {
  if (!Array.isArray(rows) || rows.length === 0) return 0
  let rowsCount = 0

  // 1. Check if rows contain JSON document (e.g. data column)
  for (const row of rows) {
    if (row && typeof row === 'object' && row.data) {
      try {
        const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          Object.assign(targetTax, parsed)
          rowsCount++
        }
      } catch {}
    }
  }

  // Build row lookup by ID
  const idMap = new Map<string, any>()
  rows.forEach((r) => {
    if (r && r.id !== undefined && r.id !== null) {
      idMap.set(String(r.id), r)
    }
  })

  // 2. Identify and register Domain nodes
  rows.forEach((r) => {
    if (!r || typeof r !== 'object') return
    const type = String(r.type || '').toLowerCase()
    const level = Number(r.level)
    const isDomain =
      type === 'domain' ||
      type === 'category' ||
      level === 1 ||
      (!r.parent_id && !r.chapter && !r.lesson && (r.domain || r.name || r.title))

    if (isDomain) {
      const dName = String(r.domain || r.name || r.title || r.label || '').trim()
      if (dName) {
        let unitLabel = r.unit_label || r.description || `Unit: ${dName}`
        let code = r.code || getDomainCode(dName)
        if (r.description && typeof r.description === 'string' && r.description.startsWith('{')) {
          try {
            const p = JSON.parse(r.description)
            if (p.unitLabel) unitLabel = p.unitLabel
            if (p.code) code = p.code
          } catch {}
        }

        if (!targetTax[dName]) {
          targetTax[dName] = { unitLabel, code, chapters: [] }
        }
        if (r.id) {
          _supabaseDomainIdMap.set(dName.toLowerCase(), String(r.id))
          _supabaseDomainIdMap.set(String(r.id), dName)
        }
        rowsCount++
      }
    }
  })

  // 3. Identify and register Chapter nodes
  rows.forEach((r) => {
    if (!r || typeof r !== 'object') return
    const type = String(r.type || '').toLowerCase()
    const level = Number(r.level)
    const hasChapName = Boolean(r.chapter || (type === 'chapter' && (r.name || r.title)) || level === 2)

    if (hasChapName) {
      const cName = String(r.chapter || r.name || r.title || r.label || '').trim()
      if (cName) {
        let domainName = ''
        if (r.parent_id && _supabaseDomainIdMap.has(String(r.parent_id))) {
          domainName = _supabaseDomainIdMap.get(String(r.parent_id))!
        } else if (r.parent_id && idMap.has(String(r.parent_id))) {
          const parentRow = idMap.get(String(r.parent_id))
          domainName = String(parentRow.name || parentRow.domain || parentRow.title || '').trim()
        } else if (r.domain && targetTax[r.domain]) {
          domainName = r.domain
        } else if (r.domain) {
          domainName = String(r.domain).trim()
        } else {
          domainName = Object.keys(targetTax)[0] || 'General Curriculum'
        }

        if (!targetTax[domainName]) {
          targetTax[domainName] = { unitLabel: `Unit: ${domainName}`, code: getDomainCode(domainName), chapters: [] }
        }

        let chap = targetTax[domainName].chapters.find((c) => c.name.toLowerCase() === cName.toLowerCase())
        if (!chap) {
          const chapCode = r.code || r.description || `${targetTax[domainName].code || 'CH'}.${targetTax[domainName].chapters.length + 1}`
          chap = { name: cName, code: chapCode, lessons: [] }
          targetTax[domainName].chapters.push(chap)
        }

        if (r.id) {
          const catId = _supabaseDomainIdMap.get(domainName.toLowerCase())
          if (catId) {
            _supabaseChapterIdMap.set(`${catId}::${cName.toLowerCase()}`, String(r.id))
          }
          _supabaseChapterIdMap.set(String(r.id), cName)
        }
        rowsCount++
      }
    }
  })

  // 4. Identify and register Lesson nodes
  rows.forEach((r) => {
    if (!r || typeof r !== 'object') return
    const type = String(r.type || '').toLowerCase()
    const level = Number(r.level)
    const hasLessonName = Boolean(r.lesson || (type === 'lesson' && (r.name || r.title)) || level === 3)

    if (hasLessonName) {
      const lName = String(r.lesson || r.name || r.title || r.label || '').trim()
      if (lName) {
        let parentChapName = ''
        if (r.parent_id && _supabaseChapterIdMap.has(String(r.parent_id))) {
          parentChapName = _supabaseChapterIdMap.get(String(r.parent_id))!
        } else if (r.parent_id && idMap.has(String(r.parent_id))) {
          const pRow = idMap.get(String(r.parent_id))
          parentChapName = String(pRow.chapter || pRow.name || pRow.title || '').trim()
        } else if (r.chapter) {
          parentChapName = String(r.chapter).trim()
        }

        // Find chapter across domains
        let targetChap: { name: string; lessons: string[] } | null = null
        for (const d of Object.values(targetTax)) {
          const ch = d.chapters.find((c) =>
            parentChapName ? c.name.toLowerCase() === parentChapName.toLowerCase() : true
          )
          if (ch) {
            targetChap = ch
            break
          }
        }

        if (!targetChap) {
          const firstDom = Object.keys(targetTax)[0] || 'General Curriculum'
          if (!targetTax[firstDom]) {
            targetTax[firstDom] = { unitLabel: `Unit: ${firstDom}`, code: 'GEN', chapters: [] }
          }
          if (targetTax[firstDom].chapters.length === 0) {
            targetTax[firstDom].chapters.push({ name: parentChapName || 'General Chapter', code: 'GEN.1', lessons: [] })
          }
          targetChap = targetTax[firstDom].chapters[0]
        }

        if (targetChap && !targetChap.lessons.some((l) => l.toLowerCase() === lName.toLowerCase())) {
          targetChap.lessons.push(lName)
        }
        if (r.id) {
          _supabaseLessonIdMap.set(String(r.id), lName)
        }
        rowsCount++
      }
    }
  })

  // 5. Ensure Flat / Denormalized rows with domain + chapter + lesson are also fully populated
  rows.forEach((r) => {
    if (!r || typeof r !== 'object') return
    const rawDomain = r.domain || r.domain_name || r.category || r.category_name || r.subject_area || r.unit_name
    const rawChapter = r.chapter || r.chapter_name || r.topic || r.module
    const rawLesson = r.lesson || r.lesson_name || r.skill || r.subtopic

    if (rawDomain) {
      const dName = String(rawDomain).trim()
      if (dName) {
        if (!targetTax[dName]) {
          targetTax[dName] = {
            unitLabel: r.unit_label || r.unit || `Unit: ${dName}`,
            code: r.code || r.domain_code || getDomainCode(dName),
            chapters: [],
          }
        }

        if (rawChapter) {
          const cName = String(rawChapter).trim()
          let chap = targetTax[dName].chapters.find((c) => c.name.toLowerCase() === cName.toLowerCase())
          if (!chap) {
            chap = {
              name: cName,
              code: r.chapter_code || `${targetTax[dName].code || 'CH'}.${targetTax[dName].chapters.length + 1}`,
              lessons: [],
            }
            targetTax[dName].chapters.push(chap)
          }

          if (rawLesson) {
            const lName = String(rawLesson).trim()
            if (!chap.lessons.some((l) => l.toLowerCase() === lName.toLowerCase())) {
              chap.lessons.push(lName)
            }
          }
        }
        rowsCount++
      }
    }
  })

  return rowsCount
}

async function safeInsertTaxonomyTable(tableName: string, payload: Record<string, any>): Promise<any> {
  let currentPayload = { ...payload }
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase.from(tableName).insert(currentPayload).select('*').maybeSingle()
    if (!error) return { data, error: null }
    // Check if error is missing column error
    const colMatch = error.message?.match(/column "([^"]+)" of relation "[^"]+" does not exist/i) ||
                     error.message?.match(/Could not find the '([^']+)' column/i)
    if (colMatch && colMatch[1] && currentPayload[colMatch[1]] !== undefined) {
      delete currentPayload[colMatch[1]]
      continue
    }
    return { data: null, error }
  }
  return { data: null, error: { message: 'Max retry attempts reached' } }
}

// Service Helpers
function getDomainCode(domain: string): string {
  const norm = (domain || '').toLowerCase()
  if (norm.includes('algebra')) return 'ALG'
  if (norm.includes('geom') || norm.includes('measur')) return 'GEO'
  if (norm.includes('numb') || norm.includes('quant')) return 'NUM'
  if (norm.includes('stat') || norm.includes('prob')) return 'STAT'
  return 'GEN'
}

async function resolveTaxonomyIds(
  question: QuestionBankItem,
  orgId: string | null
): Promise<{
  exam_id: string | null
  subject_id: string | null
  category_id: string | null
  chapter_id: string | null
  lesson_id: string | null
  skill_id: string | null
}> {
  const result = {
    exam_id: null as string | null,
    subject_id: null as string | null,
    category_id: null as string | null,
    chapter_id: null as string | null,
    lesson_id: null as string | null,
    skill_id: null as string | null,
  }

  const examTarget = (question.targetExam || 'EST 1 / SAT Math').trim()
  const domainTarget = (question.domain || '').trim()
  const chapterTarget = (question.chapter || '').trim()
  const lessonTarget = (question.lesson || '').trim()
  const domainCode = getDomainCode(domainTarget)

  // 0. Check in-memory Supabase taxonomy UUID maps first
  const normDom = domainTarget.toLowerCase()
  if (_supabaseDomainIdMap.has(normDom)) {
    const matchedCatId = _supabaseDomainIdMap.get(normDom)
    if (matchedCatId) {
      result.category_id = matchedCatId
      const chapKey = `${matchedCatId}::${chapterTarget.toLowerCase()}`
      if (_supabaseChapterIdMap.has(chapKey)) {
        const matchedChapId = _supabaseChapterIdMap.get(chapKey)
        if (matchedChapId) {
          result.chapter_id = matchedChapId
          const lessKey = `${matchedChapId}::${lessonTarget.toLowerCase()}`
          if (_supabaseLessonIdMap.has(lessKey)) {
            result.lesson_id = _supabaseLessonIdMap.get(lessKey) || null
          }
        }
      }
    }
  }

  // 1. First attempt: RPC if provided by database
  if (orgId) {
    try {
      const { data: taxData, error: taxError } = await supabase.rpc('resolve_or_create_taxonomy', {
        p_org_id: orgId,
        p_exam: examTarget,
        p_subject: 'Mathematics',
        p_category: domainTarget,
        p_chapter: chapterTarget,
        p_lesson: lessonTarget,
        p_skill: null,
      })
      if (!taxError && Array.isArray(taxData) && taxData.length > 0 && taxData[0].category_id) {
        return taxData[0]
      }
    } catch {}
  }

  // 2. Resolve Exam ID
  try {
    const { data: ex1 } = await supabase.from('exams').select('id').ilike('name', `%${examTarget}%`).limit(1).maybeSingle()
    if (ex1?.id) {
      result.exam_id = ex1.id
    } else {
      const { data: anyEx } = await supabase.from('exams').select('id').limit(1).maybeSingle()
      if (anyEx?.id) {
        result.exam_id = anyEx.id
      } else {
        const payload: any = { name: examTarget, code: 'EST', is_active: true }
        if (orgId) payload.organization_id = orgId
        const { data: insEx } = await supabase.from('exams').insert(payload).select('id').maybeSingle()
        if (insEx?.id) result.exam_id = insEx.id
      }
    }
  } catch (e) {
    console.warn('[Taxonomy] Error resolving exam:', e)
  }

  // 3. Resolve Subject ID
  try {
    const { data: sb1 } = await supabase.from('subjects').select('id').ilike('name', '%Math%').limit(1).maybeSingle()
    if (sb1?.id) {
      result.subject_id = sb1.id
    } else {
      const { data: anySb } = await supabase.from('subjects').select('id').limit(1).maybeSingle()
      if (anySb?.id) {
        result.subject_id = anySb.id
      } else {
        const payload: any = { name: 'Mathematics', code: 'MATH', is_active: true }
        if (result.exam_id) payload.exam_id = result.exam_id
        if (orgId) payload.organization_id = orgId
        const { data: insSb } = await supabase.from('subjects').insert(payload).select('id').maybeSingle()
        if (insSb?.id) result.subject_id = insSb.id
      }
    }
  } catch (e) {
    console.warn('[Taxonomy] Error resolving subject:', e)
  }

  // 4. Resolve Category ID (Domain) - Handles prefixes like "[ALG] Algebra & Functions"
  try {
    const searchTerms = [domainTarget, domainTarget.split('&')[0].trim(), domainTarget.split(' ')[0].trim()]
    let matchedCat: any = null

    for (const term of searchTerms) {
      if (!term) continue
      const { data: cData } = await supabase.from('categories').select('id, name').ilike('name', `%${term}%`).limit(1).maybeSingle()
      if (cData?.id) {
        matchedCat = cData
        break
      }
    }

    if (!matchedCat && domainCode) {
      const { data: cData } = await supabase.from('categories').select('id, name').ilike('name', `%${domainCode}%`).limit(1).maybeSingle()
      if (cData?.id) matchedCat = cData
    }

    if (matchedCat?.id) {
      result.category_id = matchedCat.id
    } else {
      const { data: anyCat } = await supabase.from('categories').select('id').limit(1).maybeSingle()
      const payload: any = {
        name: domainTarget,
        code: domainCode,
        is_active: true,
      }
      if (result.subject_id) payload.subject_id = result.subject_id
      if (orgId) payload.organization_id = orgId
      const { data: insCat } = await supabase.from('categories').insert(payload).select('id').maybeSingle()
      result.category_id = insCat?.id || anyCat?.id || null
    }
  } catch (e) {
    console.warn('[Taxonomy] Error resolving category:', e)
  }

  // 5. Resolve Chapter ID
  try {
    const searchTerms = [chapterTarget, chapterTarget.split('&')[0].trim(), chapterTarget.split(' ')[0].trim()]
    let matchedChap: any = null

    for (const term of searchTerms) {
      if (!term) continue
      let q = supabase.from('chapters').select('id, name').ilike('name', `%${term}%`)
      if (result.category_id) q = q.eq('category_id', result.category_id)
      const { data: chData } = await q.limit(1).maybeSingle()
      if (chData?.id) {
        matchedChap = chData
        break
      }
    }

    if (!matchedChap) {
      for (const term of searchTerms) {
        if (!term) continue
        const { data: chData } = await supabase.from('chapters').select('id, name').ilike('name', `%${term}%`).limit(1).maybeSingle()
        if (chData?.id) {
          matchedChap = chData
          break
        }
      }
    }

    if (matchedChap?.id) {
      result.chapter_id = matchedChap.id
    } else {
      const payload: any = {
        name: chapterTarget,
        is_active: true,
      }
      if (result.category_id) payload.category_id = result.category_id
      if (orgId) payload.organization_id = orgId
      const { data: insChap } = await supabase.from('chapters').insert(payload).select('id').maybeSingle()
      if (insChap?.id) {
        result.chapter_id = insChap.id
      } else {
        let q = supabase.from('chapters').select('id')
        if (result.category_id) q = q.eq('category_id', result.category_id)
        const { data: anyChap } = await q.limit(1).maybeSingle()
        result.chapter_id = anyChap?.id || null
      }
    }
  } catch (e) {
    console.warn('[Taxonomy] Error resolving chapter:', e)
  }

  // 6. Resolve Lesson ID
  try {
    const searchTerms = [lessonTarget, lessonTarget.split('(')[0].trim(), lessonTarget.split(' ')[0].trim()]
    let matchedLesson: any = null

    for (const term of searchTerms) {
      if (!term) continue
      let q = supabase.from('lessons').select('id, name').ilike('name', `%${term}%`)
      if (result.chapter_id) q = q.eq('chapter_id', result.chapter_id)
      const { data: lsData } = await q.limit(1).maybeSingle()
      if (lsData?.id) {
        matchedLesson = lsData
        break
      }
    }

    if (!matchedLesson) {
      for (const term of searchTerms) {
        if (!term) continue
        const { data: lsData } = await supabase.from('lessons').select('id, name').ilike('name', `%${term}%`).limit(1).maybeSingle()
        if (lsData?.id) {
          matchedLesson = lsData
          break
        }
      }
    }

    if (matchedLesson?.id) {
      result.lesson_id = matchedLesson.id
    } else {
      const payload: any = {
        name: lessonTarget,
        is_active: true,
      }
      if (result.chapter_id) payload.chapter_id = result.chapter_id
      if (orgId) payload.organization_id = orgId
      const { data: insLs } = await supabase.from('lessons').insert(payload).select('id').maybeSingle()
      if (insLs?.id) {
        result.lesson_id = insLs.id
      } else {
        let q = supabase.from('lessons').select('id')
        if (result.chapter_id) q = q.eq('chapter_id', result.chapter_id)
        const { data: anyLs } = await q.limit(1).maybeSingle()
        result.lesson_id = anyLs?.id || null
      }
    }
  } catch (e) {
    console.warn('[Taxonomy] Error resolving lesson:', e)
  }

  return result
}

async function getOrCreateGenericTaxonomy(
  name: string,
  code?: string,
  description?: string
): Promise<GenericTaxonomy> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.')
  }

  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error('Taxonomy name is required.')
  }

  const { data: existing, error: existingError } = await supabase
    .from('taxonomies')
    .select('id, organization_id, name, code, description, is_active')
    .eq('name', trimmedName)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (existingError) throw existingError

  if (existing?.id) {
    return {
      id: String(existing.id),
      organizationId: String(existing.organization_id),
      name: String(existing.name),
      code: existing.code ?? undefined,
      description: existing.description ?? undefined,
      isActive: Boolean(existing.is_active),
    }
  }

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id')
    .limit(1)
    .maybeSingle()

  if (organizationError) throw organizationError
  if (!organization?.id) {
    throw new Error('Create an organization before creating a taxonomy.')
  }

  const { data: created, error: createError } = await supabase
    .from('taxonomies')
    .insert({
      organization_id: organization.id,
      name: trimmedName,
      code: code?.trim() || null,
      description: description?.trim() || null,
      is_active: true,
    })
    .select('id, organization_id, name, code, description, is_active')
    .single()

  if (createError) throw createError

  return {
    id: String(created.id),
    organizationId: String(created.organization_id),
    name: String(created.name),
    code: created.code ?? undefined,
    description: created.description ?? undefined,
    isActive: Boolean(created.is_active),
  }
}

async function getOrCreateGenericTaxonomyNode(
  taxonomyId: string,
  name: string,
  parentId: string | null = null,
  options: {
    code?: string
    description?: string
    sortOrder?: number
  } = {}
): Promise<GenericTaxonomyNode> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.')
  }

  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error('Taxonomy node name is required.')
  }

  let existingQuery = supabase
    .from('taxonomy_nodes')
    .select(
      'id, taxonomy_id, parent_id, name, code, description, sort_order, is_active'
    )
    .eq('taxonomy_id', taxonomyId)
    .eq('name', trimmedName)
    .eq('is_active', true)

  if (parentId) {
    existingQuery = existingQuery.eq('parent_id', parentId)
  } else {
    existingQuery = existingQuery.is('parent_id', null)
  }

  const { data: existing, error: existingError } = await existingQuery
    .limit(1)
    .maybeSingle()

  if (existingError) throw existingError

  if (existing?.id) {
    return {
      id: String(existing.id),
      taxonomyId: String(existing.taxonomy_id),
      parentId: existing.parent_id ? String(existing.parent_id) : null,
      name: String(existing.name),
      code: existing.code ?? undefined,
      description: existing.description ?? undefined,
      sortOrder: Number(existing.sort_order ?? 0),
      isActive: Boolean(existing.is_active),
    }
  }

  const { data: created, error: createError } = await supabase
    .from('taxonomy_nodes')
    .insert({
      taxonomy_id: taxonomyId,
      parent_id: parentId,
      name: trimmedName,
      code: options.code?.trim() || null,
      description: options.description?.trim() || null,
      sort_order: options.sortOrder ?? 0,
      is_active: true,
    })
    .select(
      'id, taxonomy_id, parent_id, name, code, description, sort_order, is_active'
    )
    .single()

  if (createError) throw createError

  return {
    id: String(created.id),
    taxonomyId: String(created.taxonomy_id),
    parentId: created.parent_id ? String(created.parent_id) : null,
    name: String(created.name),
    code: created.code ?? undefined,
    description: created.description ?? undefined,
    sortOrder: Number(created.sort_order ?? 0),
    isActive: Boolean(created.is_active),
  }
}

async function updateGenericTaxonomy(
  taxonomyId: string,
  updates: Partial<Pick<GenericTaxonomy, 'name' | 'code' | 'description' | 'isActive'>>
): Promise<GenericTaxonomy> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
  if (!taxonomyId) throw new Error('Taxonomy id is required.')

  const payload: Record<string, unknown> = {}
  if (updates.name !== undefined) {
    const name = updates.name.trim()
    if (!name) throw new Error('Taxonomy name is required.')
    payload.name = name
  }
  if (updates.code !== undefined) payload.code = updates.code.trim() || null
  if (updates.description !== undefined) payload.description = updates.description.trim() || null
  if (updates.isActive !== undefined) payload.is_active = Boolean(updates.isActive)
  if (Object.keys(payload).length === 0) throw new Error('No taxonomy changes were provided.')

  const { data, error } = await supabase
    .from('taxonomies')
    .update(payload)
    .eq('id', taxonomyId)
    .select('id, organization_id, name, code, description, is_active')
    .single()
  if (error) throw error
  if (!data) throw new Error('Taxonomy update returned no record. Check your Supabase permissions.')

  return {
    id: String(data.id),
    organizationId: String(data.organization_id ?? ''),
    name: String(data.name),
    code: data.code ?? undefined,
    description: data.description ?? undefined,
    isActive: Boolean(data.is_active),
  }
}

async function updateGenericTaxonomyNode(
  nodeId: string,
  updates: Partial<Pick<GenericTaxonomyNode, 'name' | 'code' | 'description' | 'sortOrder' | 'isActive'>>
): Promise<GenericTaxonomyNode> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.')
  }

  if (!nodeId) {
    throw new Error('Taxonomy node id is required.')
  }

  const payload: Record<string, unknown> = {}
  if (updates.name !== undefined) {
    const trimmedName = updates.name.trim()
    if (!trimmedName) throw new Error('Taxonomy node name is required.')
    payload.name = trimmedName
  }
  if (updates.code !== undefined) payload.code = updates.code?.trim() || null
  if (updates.description !== undefined) payload.description = updates.description?.trim() || null
  if (updates.sortOrder !== undefined) payload.sort_order = Number(updates.sortOrder) || 0
  if (updates.isActive !== undefined) payload.is_active = Boolean(updates.isActive)

  if (Object.keys(payload).length === 0) {
    throw new Error('No taxonomy node changes were provided.')
  }

  const { data, error } = await supabase
    .from('taxonomy_nodes')
    .update(payload)
    .eq('id', nodeId)
    .select('id, taxonomy_id, parent_id, name, code, description, sort_order, is_active')
    .single()

  if (error) throw error

  return {
    id: String(data.id),
    taxonomyId: String(data.taxonomy_id),
    parentId: data.parent_id ? String(data.parent_id) : null,
    name: String(data.name),
    code: data.code ?? undefined,
    description: data.description ?? undefined,
    sortOrder: Number(data.sort_order ?? 0),
    isActive: Boolean(data.is_active),
  }
}

/**
 * Supabase applies a maximum row count to individual SELECT requests (often 1,000).
 * Read in deterministic pages so larger taxonomies are not silently truncated.
 */
const TAXONOMY_FETCH_PAGE_SIZE = 500

async function fetchGenericTaxonomies(): Promise<GenericTaxonomy[]> {
  if (!isSupabaseConfigured) return []

  const rows: any[] = []
  for (let from = 0; ; from += TAXONOMY_FETCH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('taxonomies')
      .select('id, organization_id, name, code, description, is_active')
      .eq('is_active', true)
      .order('name')
      .order('id')
      .range(from, from + TAXONOMY_FETCH_PAGE_SIZE - 1)

    if (error) throw error

    const page = data ?? []
    rows.push(...page)
    if (page.length < TAXONOMY_FETCH_PAGE_SIZE) break
  }

  return rows.map((row: any) => ({
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    code: row.code ?? undefined,
    description: row.description ?? undefined,
    isActive: Boolean(row.is_active),
  }))
}

/** Inspect an entire dynamic-taxonomy branch before any destructive operation.
 * Never truncate descendant traversal at Supabase's default row limit.
 */
async function getGenericTaxonomyNodeDeleteImpact(nodeId: string): Promise<{ descendantCount: number; linkedQuestionCount: number; nodeIds: string[] }> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
  if (!nodeId.trim()) throw new Error('Taxonomy node id is required.')
  const { data: root, error: rootError } = await supabase
    .from('taxonomy_nodes').select('id, taxonomy_id').eq('id', nodeId).maybeSingle()
  if (rootError) throw rootError
  if (!root) throw new Error('Taxonomy node was not found.')
  const nodes: Array<{ id: string; parent_id: string | null }> = []
  for (let offset = 0; ; offset += TAXONOMY_FETCH_PAGE_SIZE) {
    const { data, error } = await supabase.from('taxonomy_nodes')
      .select('id, parent_id').eq('taxonomy_id', root.taxonomy_id)
      .order('id').range(offset, offset + TAXONOMY_FETCH_PAGE_SIZE - 1)
    if (error) throw error
    nodes.push(...(data ?? []))
    if ((data ?? []).length < TAXONOMY_FETCH_PAGE_SIZE) break
  }
  const childIds = new Map<string, string[]>()
  for (const node of nodes) {
    if (!node.parent_id) continue
    childIds.set(String(node.parent_id), [...(childIds.get(String(node.parent_id)) || []), String(node.id)])
  }
  const seen = new Set<string>()
  const visit = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    for (const child of childIds.get(id) || []) visit(child)
  }
  visit(nodeId)
  const nodeIds = [...seen]
  let linkedQuestionCount = 0
  for (let offset = 0; offset < nodeIds.length; offset += 100) {
    // Exact server-side count avoids truncating the result to 1,000 assignments.
    const { count, error } = await supabase.from('question_taxonomy_nodes')
      .select('question_id', { count: 'exact', head: true })
      .in('taxonomy_node_id', nodeIds.slice(offset, offset + 100))
    if (error) throw error
    linkedQuestionCount += count ?? 0
  }
  return { descendantCount: nodeIds.length - 1, linkedQuestionCount, nodeIds }
}

async function deleteGenericTaxonomyNode(nodeId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
  const impact = await getGenericTaxonomyNodeDeleteImpact(nodeId)
  if (impact.linkedQuestionCount > 0) {
    throw new Error(`This branch has ${impact.linkedQuestionCount} linked question assignment(s). Reassign these questions before deleting; nothing was changed.`)
  }
  // Recheck links for each node immediately before deletion. Foreign-key
  // constraints remain the final protection against concurrent assignments.
  // Delete descendants first; stop and show an error on any blocked delete.
  for (const id of [...impact.nodeIds].reverse()) {
    const { count, error: checkError } = await supabase.from('question_taxonomy_nodes')
      .select('question_id', { count: 'exact', head: true }).eq('taxonomy_node_id', id)
    if (checkError) throw checkError
    if (count) throw new Error('A question was linked during deletion. Remaining nodes were preserved; refresh and review the hierarchy.')
    const { error } = await supabase.from('taxonomy_nodes').delete().eq('id', id)
    if (error) throw new Error(`Unable to delete node ${id}: ${error.message}. Refresh to see the current state.`)
  }
}

async function deleteGenericTaxonomy(taxonomyId: string): Promise<{ deletedNodeCount: number; unlinkedQuestionCount: number }> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
  if (!taxonomyId.trim()) throw new Error('Taxonomy id is required.')

  // The database function performs all deletes in one transaction so question
  // records and assignments to other taxonomies remain intact if a delete fails.
  const { data, error } = await supabase.rpc('delete_generic_taxonomy_preserving_questions', {
    p_taxonomy_id: taxonomyId,
  })
  if (error) throw new Error(`Could not delete taxonomy. ${error.message}`)

  const result = Array.isArray(data) ? data[0] : data
  return {
    deletedNodeCount: Number(result?.deleted_node_count ?? 0),
    unlinkedQuestionCount: Number(result?.unlinked_question_count ?? 0),
  }
}

async function getGenericTaxonomyDeleteImpact(taxonomyId: string): Promise<{ nodeCount: number; linkedQuestionCount: number }> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
  if (!taxonomyId.trim()) throw new Error('Taxonomy id is required.')

  const { data: nodes, error: nodesError } = await supabase
    .from('taxonomy_nodes')
    .select('id')
    .eq('taxonomy_id', taxonomyId)
  if (nodesError) throw nodesError
  const nodeIds = (nodes ?? []).map((node: { id: string }) => String(node.id))
  if (nodeIds.length === 0) return { nodeCount: 0, linkedQuestionCount: 0 }

  // Fetch assignment IDs in chunks to avoid URL/request limits on large taxonomies.
  const questionIds = new Set<string>()
  const chunkSize = 200
  for (let i = 0; i < nodeIds.length; i += chunkSize) {
    const { data: links, error: linksError } = await supabase
      .from('question_taxonomy_nodes')
      .select('question_id')
      .in('taxonomy_node_id', nodeIds.slice(i, i + chunkSize))
    if (linksError) throw linksError
    for (const link of links ?? []) if (link.question_id) questionIds.add(String(link.question_id))
  }
  return { nodeCount: nodeIds.length, linkedQuestionCount: questionIds.size }
}

async function fetchGenericTaxonomyNodes(
  taxonomyId: string
): Promise<GenericTaxonomyNode[]> {
  if (!isSupabaseConfigured) return []
  if (!taxonomyId.trim()) throw new Error('Taxonomy id is required.')

  const rows: any[] = []
  for (let from = 0; ; from += TAXONOMY_FETCH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('taxonomy_nodes')
      .select(
        'id, taxonomy_id, parent_id, name, code, description, sort_order, is_active'
      )
      .eq('taxonomy_id', taxonomyId)
      .eq('is_active', true)
      .order('sort_order')
      .order('name')
      .order('id')
      .range(from, from + TAXONOMY_FETCH_PAGE_SIZE - 1)

    if (error) throw error

    const page = data ?? []
    rows.push(...page)
    if (page.length < TAXONOMY_FETCH_PAGE_SIZE) break
  }

  return rows.map((row: any) => ({
    id: String(row.id),
    taxonomyId: String(row.taxonomy_id),
    parentId: row.parent_id ? String(row.parent_id) : null,
    name: String(row.name),
    code: row.code ?? undefined,
    description: row.description ?? undefined,
    sortOrder: Number(row.sort_order ?? 0),
    isActive: Boolean(row.is_active),
  }))
}
/**
 * Temporary compatibility adapter.
 *
 * The application still expects the legacy TaxonomyRegistry shape in some
 * pages. This adapter lets us read the new generic taxonomy model without
 * changing those pages yet. It does not write to Supabase.
 */
function buildLegacyTaxonomyRegistry(
  taxonomy: GenericTaxonomy,
  nodes: GenericTaxonomyNode[]
): TaxonomyRegistry {
  const registry: TaxonomyRegistry = {}
  const childrenByParent = new Map<string | null, GenericTaxonomyNode[]>()

  for (const node of nodes) {
    const key = node.parentId
    const children = childrenByParent.get(key) || []
    children.push(node)
    childrenByParent.set(key, children)
  }

  const rootNodes = childrenByParent.get(null) || []

  for (const rootNode of rootNodes) {
    const chapterNodes = childrenByParent.get(rootNode.id) || []

    // Legacy TaxonomyRegistry is keyed only by domain name, so identical root
    // names from different generic taxonomies would otherwise overwrite each
    // other when their registries are merged. Namespace each root by taxonomy.
    const standaloneDomainName = `${taxonomy.name} / ${rootNode.name}`

    registry[standaloneDomainName] = {
      unitLabel: taxonomy.name,
      code: rootNode.code || taxonomy.code || 'GEN',
      chapters: chapterNodes.map((chapterNode, index) => ({
        name: chapterNode.name,
        code: chapterNode.code || `${rootNode.code || taxonomy.code || 'GEN'}.${index + 1}`,
        lessons: (childrenByParent.get(chapterNode.id) || []).map(
          (lessonNode) => lessonNode.name
        ),
      })),
    }
  }

  return registry
}

export const questionBankService = {
  async createGenericTaxonomy(
    name: string,
    code?: string,
    description?: string
  ): Promise<GenericTaxonomy> {
    return getOrCreateGenericTaxonomy(name, code, description)
  },

  async createGenericTaxonomyNode(
    taxonomyId: string,
    name: string,
    parentId: string | null = null,
    options: { code?: string; description?: string; sortOrder?: number } = {}
  ): Promise<GenericTaxonomyNode> {
    return getOrCreateGenericTaxonomyNode(taxonomyId, name, parentId, options)
  },

  async updateGenericTaxonomy(
    taxonomyId: string,
    updates: Partial<Pick<GenericTaxonomy, 'name' | 'code' | 'description' | 'isActive'>>
  ): Promise<GenericTaxonomy> {
    return updateGenericTaxonomy(taxonomyId, updates)
  },

  async updateGenericTaxonomyNode(
    nodeId: string,
    updates: Partial<Pick<GenericTaxonomyNode, 'name' | 'code' | 'description' | 'sortOrder' | 'isActive'>>
  ): Promise<GenericTaxonomyNode> {
    return updateGenericTaxonomyNode(nodeId, updates)
  },

  async getGenericTaxonomyNodeDeleteImpact(nodeId: string): Promise<{ descendantCount: number; linkedQuestionCount: number }> {
    const { descendantCount, linkedQuestionCount } = await getGenericTaxonomyNodeDeleteImpact(nodeId)
    return { descendantCount, linkedQuestionCount }
  },

  async deleteGenericTaxonomyNode(nodeId: string): Promise<void> {
    return deleteGenericTaxonomyNode(nodeId)
  },

  async getGenericTaxonomyDeleteImpact(taxonomyId: string): Promise<{ nodeCount: number; linkedQuestionCount: number }> {
    return getGenericTaxonomyDeleteImpact(taxonomyId)
  },

  async deleteGenericTaxonomy(taxonomyId: string): Promise<{ deletedNodeCount: number; unlinkedQuestionCount: number }> {
    return deleteGenericTaxonomy(taxonomyId)
  },

  async fetchGenericTaxonomies(): Promise<GenericTaxonomy[]> {
    return fetchGenericTaxonomies()
  },

  async fetchGenericTaxonomyNodes(taxonomyId: string): Promise<GenericTaxonomyNode[]> {
    return fetchGenericTaxonomyNodes(taxonomyId)
  },

  getStoredQuestions(): QuestionBankItem[] {
    if (!_hasLoadedQuestions && typeof window !== 'undefined') {
      this.fetchQuestionsFromDatabase().catch(() => {})
    }
    return _questionsCache
  },

  async saveQuestions(questions: QuestionBankItem[]): Promise<boolean> {
    const sanitized = questions.map((q) => ({
      ...q,
      domain: (q.domain ? String(q.domain) : 'Unassigned').trim() || 'Unassigned',
      chapter: (q.chapter ? String(q.chapter) : '').trim(),
      lesson: (q.lesson ? String(q.lesson) : '').trim(),
      estimatedSeconds: Math.max(10, Number(q.estimatedSeconds) || 90),
      prompt: (q.prompt ? String(q.prompt) : 'Question Prompt').trim() || 'Question Prompt',
      subject: (q.subject ? String(q.subject) : 'Mathematics').trim(),
      difficulty: q.difficulty || 'medium',
      targetExam: (q.targetExam ? String(q.targetExam) : 'EST 1 / SAT Math').trim(),
      questionType: q.questionType || 'multiple_choice',
    }))
    try {
      await Promise.all(sanitized.map((question) => this.syncQuestionToDatabase(question)))
      _questionsCache = sanitized
      return true
    } catch (err) {
      console.warn('Failed to save questions to Supabase:', err)
      return false
    }
  },

  /**
  * Sync a question bank item to Supabase
   */
  async syncQuestionToDatabase(question: QuestionBankItem, importContext?: ImportSyncContext): Promise<boolean> {
    const sanitized: QuestionBankItem = {
      ...question,
      domain: (question.domain || '').trim(),
      chapter: (question.chapter || '').trim(),
      lesson: (question.lesson || '').trim(),
      estimatedSeconds: Math.max(10, Number(question.estimatedSeconds) || 90),
      prompt: (question.prompt || 'Question Prompt').trim(),
      subject: (question.subject || 'Mathematics').trim(),
      difficulty: question.difficulty || 'medium',
      targetExam: (question.targetExam || 'EST 1 / SAT Math').trim(),
      questionType: question.questionType || 'multiple_choice',
      taxonomyNodeIds: Array.isArray((question as QuestionBankItem).taxonomyNodeIds)
        ? Array.from(new Set((question as QuestionBankItem).taxonomyNodeIds!.map(String).filter(Boolean)))
        : [],
    }

    try {
      // Always use the signed-in user's organization. Selecting the first
      // organization is unsafe in multi-tenant Staging and Production.
      let orgId: string = importContext?.organizationId || ''
      if (!importContext) {
        const { data: auth, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!auth.user?.id) throw new Error('Sign in before saving questions.')
        const { data: profile, error: profileError } = await supabase.from('profiles')
          .select('organization_id').eq('id', auth.user.id).single()
        if (profileError) throw profileError
        if (!profile?.organization_id) throw new Error('No organization is assigned to your account.')
        orgId = String(profile.organization_id)
      }

      let answerTypeId: string | null = null
      if (importContext) {
        const types = importContext.answerTypeIds
        const target = question.questionType === 'grid_in' ? 'GRID_IN'
          : question.questionType === 'multi_select' && types.has('MULTI_SELECT') ? 'MULTI_SELECT' : 'MCQ'
        answerTypeId = types.get(target) || (target === 'MCQ' ? types.get('MULTIPLE_CHOICE') : types.get('GRID_IN')) || null
        if (!answerTypeId) throw new Error(`Missing answer type for ${question.questionType}. Import was stopped.`)
      } else {
        try {
          const { data: answerTypes } = await supabase.from('answer_types').select('id, code')
          if (Array.isArray(answerTypes) && answerTypes.length > 0) {
            const typeMap = new Map<string, string>()
            answerTypes.forEach((at) => typeMap.set(String(at.code).toUpperCase(), at.id))
            let targetCode = 'MCQ'
            if (question.questionType === 'grid_in') targetCode = 'GRID_IN'
            else if (question.questionType === 'multi_select') {
              targetCode = typeMap.has('MULTI_SELECT') ? 'MULTI_SELECT' : 'MCQ'
            }
            answerTypeId = typeMap.get(targetCode) || answerTypes[0].id
          }
        } catch (e) {
          console.warn('Could not query answer_types in Supabase:', e)
        }
      }

      const setName = question.collection?.trim() || 'General Question Bank'
      const questionSetId = importContext
        ? await getImportQuestionSetId(importContext, setName)
        : await resolveQuestionSetId(orgId, setName)

      // 4. Generic taxonomy relationships are the authoritative taxonomy model.
      // If taxonomyNodeIds is present on the question (including an explicit empty
      // array), do not resolve/create legacy taxonomy rows. Older callers that do
      // not provide taxonomyNodeIds keep the legacy compatibility fallback.
      const hasGenericTaxonomyPayload = Array.isArray(question.taxonomyNodeIds)
      const emptyLegacyTaxIds = {
        exam_id: null as string | null,
        subject_id: null as string | null,
        category_id: null as string | null,
        chapter_id: null as string | null,
        lesson_id: null as string | null,
        skill_id: null as string | null,
      }
      const taxIds = hasGenericTaxonomyPayload
        ? emptyLegacyTaxIds
        : await resolveTaxonomyIds(sanitized, orgId)

      // 5. Build Content Blocks
      const contentBlocks: any[] = []
      if (sanitized.imageUrl) {
        contentBlocks.push({
          type: 'image',
          url: sanitized.imageUrl,
          caption: sanitized.imageCaption || '',
          alt: sanitized.imageCaption || 'Question figure',
        })
      }
      if (sanitized.prompt) {
        contentBlocks.push({
          type: 'text',
          content: sanitized.prompt,
        })
      }

      const explanationBlocks: any[] = sanitized.explanation
        ? [{ type: 'text', content: sanitized.explanation }]
        : []

      // 6. Check UUID format
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sanitized.id)
      const estSeconds = Math.max(10, Number(sanitized.estimatedSeconds) || 90)

      const payload: Record<string, any> = {
        difficulty: sanitized.difficulty || 'medium',
        points: 1,
        content_blocks: contentBlocks,
        explanation_blocks: explanationBlocks,
        status: 'published',
      }

      if (isUuid) payload.id = sanitized.id
      if (orgId) payload.organization_id = orgId
      if (answerTypeId) payload.answer_type_id = answerTypeId
      if (questionSetId) payload.question_set_id = questionSetId
      if (taxIds.exam_id) payload.exam_id = taxIds.exam_id
      if (taxIds.subject_id) payload.subject_id = taxIds.subject_id
      if (taxIds.category_id) payload.category_id = taxIds.category_id
      if (taxIds.chapter_id) payload.chapter_id = taxIds.chapter_id
      if (taxIds.lesson_id) payload.lesson_id = taxIds.lesson_id
      if (taxIds.skill_id) payload.skill_id = taxIds.skill_id

      let qData: any = null
      let qError: any = null

      // Preserve existing duration-column compatibility, but learn the working
      // schema after the first save. Without this cache, a batch of 249 questions
      // can produce ~498 avoidable HTTP 400 requests before successful writes.
      for (let attempt = 0; attempt < 3; attempt++) {
        delete payload.estimated_seconds
        delete payload.time_limit_seconds
        const durationColumn = _questionDurationColumn
        if (durationColumn) payload[durationColumn] = estSeconds

        const result = await supabase.from('questions').upsert(payload).select('id').maybeSingle()
        qData = result.data
        qError = result.error
        if (!qError) break

        // Only a confirmed missing-column error justifies changing schema mode.
        // Never hide validation, RLS, FK, or other database failures.
        const columnIsMissing = durationColumn !== null &&
          (qError.code === 'PGRST204' || qError.code === '42703') &&
          qError.message?.includes(`'${durationColumn}'`)
        if (!columnIsMissing) break

        // Compare-and-swap: concurrent imports must not undo a mode already
        // discovered by another question save.
        if (_questionDurationColumn === durationColumn) {
          _questionDurationColumn = durationColumn === 'estimated_seconds' ? 'time_limit_seconds' : null
        }
      }

      if (qError) {
        console.error('[Supabase Error] Failed to upsert question into questions table:', qError)
        throw new Error(`Supabase database error: ${qError.message} (${qError.details || qError.hint || ''})`)
      }

      const targetQId = qData?.id || (isUuid ? question.id : null)
      if (targetQId) {
        // Generic taxonomy links are authoritative for taxonomy membership.
        // Legacy taxonomy columns above remain untouched for compatibility.
        if (sanitized.taxonomyNodeIds && sanitized.taxonomyNodeIds.length > 0) {
          await this.setQuestionTaxonomyNodes(targetQId, sanitized.taxonomyNodeIds)
        } else {
          await this.setQuestionTaxonomyNodes(targetQId, [])
        }

        if (question.questionType === 'grid_in') {
          // Clean previous correct answers and insert
          const { error: previousAnswerError } = await supabase
            .from('question_correct_answers')
            .delete()
            .eq('question_id', targetQId)
          if (previousAnswerError) throw previousAnswerError
          const { error: previousChoiceError } = await supabase
            .from('question_choices')
            .delete()
            .eq('question_id', targetQId)
          if (previousChoiceError) throw previousChoiceError

          const val = question.numericAnswer !== undefined && question.numericAnswer !== ''
            ? (isNaN(Number(question.numericAnswer)) ? question.numericAnswer : Number(question.numericAnswer))
            : 0

          const { error: ansError } = await supabase.from('question_correct_answers').insert({
            question_id: targetQId,
            answer_data: {
              value: val,
              tolerance: Number(question.numericTolerance) || 0,
            },
          })
          if (ansError) throw ansError
        } else if (question.choices && question.choices.length > 0) {
          // Clean previous choices and insert
          const { error: previousChoiceError } = await supabase
            .from('question_choices')
            .delete()
            .eq('question_id', targetQId)
          if (previousChoiceError) throw previousChoiceError
          const { error: previousAnswerError } = await supabase
            .from('question_correct_answers')
            .delete()
            .eq('question_id', targetQId)
          if (previousAnswerError) throw previousAnswerError

          const choiceRows = question.choices.map((c, idx) => ({
            question_id: targetQId,
            content_blocks: [{ type: 'text', content: c.text }],
            is_correct: Boolean(c.isCorrect),
            display_order: idx,
          }))
          const { error: choiceError } = await supabase.from('question_choices').insert(choiceRows)
          if (choiceError) throw choiceError
        }
      }

      console.log(`[Supabase] Successfully synced question "${question.prompt.slice(0, 30)}..." (ID: ${targetQId}) to Supabase`)
    } catch (err: any) {
      console.error('[Supabase Sync Error]:', err)
      throw err
    }

    return true
  },

  async deleteQuestionFromDatabase(id: string): Promise<boolean> {
    const targetId = String(id).trim()
    if (!targetId) throw new Error('Question ID is required.')
    const { data, error } = await supabase.rpc('delete_question_bank_items_v1', {
      p_question_ids: [targetId],
    })
    if (error) throw error
    if (data !== 1) {
      throw new Error('Question deletion could not be confirmed; please refresh and try again.')
    }
    return true
  },

  /**
   * Fetch generic taxonomy-node assignments for one question.
   */
  async fetchQuestionTaxonomyNodeIds(questionId: string): Promise<string[]> {
    if (!isSupabaseConfigured || !questionId) return []

    const { data, error } = await supabase
      .from('question_taxonomy_nodes')
      .select('taxonomy_node_id')
      .eq('question_id', questionId)

    if (error) throw error
    return Array.isArray(data)
      ? data.map((row: any) => String(row.taxonomy_node_id)).filter(Boolean)
      : []
  },

  /**
   * Replace the complete generic taxonomy-node assignment set for a question.
   * This intentionally does not mutate legacy questions.domain/chapter/lesson.
   */
  async setQuestionTaxonomyNodes(questionId: string, taxonomyNodeIds: string[]): Promise<void> {
    if (!isSupabaseConfigured || !questionId) return

    const uniqueNodeIds = Array.from(new Set((taxonomyNodeIds || []).map(String).filter(Boolean)))

    if (uniqueNodeIds.length > 0) {
      const { data: validNodes, error: nodeError } = await supabase
        .from('taxonomy_nodes')
        .select('id')
        .in('id', uniqueNodeIds)
        .eq('is_active', true)

      if (nodeError) throw nodeError

      const validIds = new Set((validNodes || []).map((row: any) => String(row.id)))
      if (validIds.size !== uniqueNodeIds.length) {
        throw new Error('One or more selected taxonomy nodes could not be found or are inactive.')
      }
    }

    const { error: deleteError } = await supabase
      .from('question_taxonomy_nodes')
      .delete()
      .eq('question_id', questionId)

    if (deleteError) throw deleteError

    if (uniqueNodeIds.length === 0) return

    const rows = uniqueNodeIds.map((taxonomyNodeId) => ({
      question_id: questionId,
      taxonomy_node_id: taxonomyNodeId,
    }))

    const { error: insertError } = await supabase
      .from('question_taxonomy_nodes')
      .insert(rows)

    if (insertError) throw insertError
  },

  /**
   * Assign a question to one generic taxonomy node without touching other links.
   */
  async addQuestionTaxonomyNode(questionId: string, taxonomyNodeId: string): Promise<void> {
    if (!isSupabaseConfigured || !questionId || !taxonomyNodeId) return

    const { data: node, error: nodeError } = await supabase
      .from('taxonomy_nodes')
      .select('id')
      .eq('id', taxonomyNodeId)
      .eq('is_active', true)
      .maybeSingle()

    if (nodeError) throw nodeError
    if (!node?.id) throw new Error('The selected taxonomy node could not be found or is inactive.')

    const { error } = await supabase
      .from('question_taxonomy_nodes')
      .upsert({ question_id: questionId, taxonomy_node_id: taxonomyNodeId })

    if (error) throw error
  },

  /**
   * Remove one generic taxonomy-node assignment from a question.
   */
  async removeQuestionTaxonomyNode(questionId: string, taxonomyNodeId: string): Promise<void> {
    if (!isSupabaseConfigured || !questionId || !taxonomyNodeId) return

    const { error } = await supabase
      .from('question_taxonomy_nodes')
      .delete()
      .eq('question_id', questionId)
      .eq('taxonomy_node_id', taxonomyNodeId)

    if (error) throw error
  },

  /**
  * Fetch the generic taxonomy assignments for many questions in one query.
   */
  async fetchQuestionTaxonomyNodeIdsBatch(questionIds: string[]): Promise<Record<string, string[]>> {
    const result: Record<string, string[]> = {}
    const ids = Array.from(new Set((questionIds || []).map(String).filter(Boolean)))
    ids.forEach((id) => { result[id] = [] })

    if (!isSupabaseConfigured || ids.length === 0) return result

    const { data, error } = await supabase
      .from('question_taxonomy_nodes')
      .select('question_id, taxonomy_node_id')
      .in('question_id', ids)

    if (error) throw error

    for (const row of data || []) {
      const questionId = String((row as any).question_id)
      const nodeId = String((row as any).taxonomy_node_id)
      if (!result[questionId]) result[questionId] = []
      if (nodeId && !result[questionId].includes(nodeId)) result[questionId].push(nodeId)
    }

    return result
  },

  /**
  * Fetch questions from Supabase
   */
  async fetchQuestionsFromDatabase(): Promise<QuestionBankItem[]> {
    _hasLoadedQuestions = true

    try {
      const { data, error } = await supabase
        .from('questions')
        .select(`
          id,
          difficulty,
          points,
          question_set_id,
          content_blocks,
          explanation_blocks,
          created_at,
          question_choices ( id, content_blocks, is_correct, display_order ),
          question_correct_answers ( id, answer_data )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!Array.isArray(data) || data.length === 0) {
        _questionsCache = []
        return _questionsCache
      }

      const localMap = new Map(_questionsCache.map((q) => [q.id, q]))

      // Resolve persisted question collections from question_sets.
      // The questions table stores the relationship by question_set_id, while
      // the editor/question-bank UI works with the collection title. Keep this
      // lookup database-backed so a browser refresh does not lose collection
      // membership when the in-memory question cache is empty.
      const questionSetIds: string[] = Array.from(
        new Set<string>(
          data
            .map((row: any) => String(row.question_set_id || '').trim())
            .filter(Boolean)
        )
      )

      const questionSetNames = new Map<string, string>()
      if (questionSetIds.length > 0) {
        const { data: questionSets, error: questionSetsError } = await supabase
          .from('question_sets')
          .select('id, title')
          .in('id', questionSetIds)

        if (questionSetsError) {
          console.warn('[Supabase] Failed to resolve question collections:', questionSetsError.message)
        } else {
          for (const row of questionSets || []) {
            const id = String(row.id || '').trim()
            const title = String(row.title || '').trim()
            if (id && title) questionSetNames.set(id, title)
          }
        }
      }

      const mapped: QuestionBankItem[] = data.map((row: any) => {
        const existingLocal = localMap.get(row.id)
        let prompt = ''
        let imageUrl = ''
        let imageCaption = ''

        if (Array.isArray(row.content_blocks)) {
          row.content_blocks.forEach((b: any) => {
            if (b.type === 'text' && b.content) prompt += (prompt ? '\n\n' : '') + b.content
            if (b.type === 'image' && b.url) {
              imageUrl = b.url
              imageCaption = b.caption || ''
            }
          })
        }

        let explanation = ''
        if (Array.isArray(row.explanation_blocks)) {
          explanation = row.explanation_blocks.map((b: any) => b.content || '').join('\n\n')
        }

        const choices: QuestionChoice[] = Array.isArray(row.question_choices) && row.question_choices.length > 0
          ? row.question_choices
              .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
              .map((c: any, cIdx: number) => {
                let text = ''
                if (Array.isArray(c.content_blocks)) {
                  text = c.content_blocks.map((b: any) => b.content || '').join('')
                }
                return {
                  id: c.id || `c${cIdx + 1}`,
                  text: text || `Choice ${cIdx + 1}`,
                  isCorrect: Boolean(c.is_correct),
                }
              })
          : existingLocal?.choices || []

        let numericAnswer = existingLocal?.numericAnswer || ''
        let numericTolerance = existingLocal?.numericTolerance || '0'
        if (Array.isArray(row.question_correct_answers) && row.question_correct_answers.length > 0) {
          const ans = row.question_correct_answers[0]?.answer_data
          if (ans) {
            numericAnswer = String(ans.value ?? '')
            numericTolerance = String(ans.tolerance ?? '0')
          }
        }

        const questionType = choices.length > 0
          ? 'multiple_choice'
          : numericAnswer
          ? 'grid_in'
          : (existingLocal?.questionType || 'multiple_choice')

        return {
          id: String(row.id),
          collection:
            questionSetNames.get(String(row.question_set_id || '').trim()) ||
            existingLocal?.collection ||
            'General Question Bank',
          domain: existingLocal?.domain || 'General Mathematics',
          chapter: existingLocal?.chapter || 'Core Concepts',
          lesson: existingLocal?.lesson || 'Topic Overview',
          difficulty: (row.difficulty || existingLocal?.difficulty || 'medium') as any,
          questionType: questionType as any,
          calculatorAllowed: existingLocal?.calculatorAllowed ?? true,
          estimatedSeconds: existingLocal?.estimatedSeconds || 90,
          targetExam: existingLocal?.targetExam || 'General',
          prompt: prompt || existingLocal?.prompt || 'Question Prompt',
          imageUrl: imageUrl || existingLocal?.imageUrl,
          imageCaption: imageCaption || existingLocal?.imageCaption,
          choices,
          numericAnswer: numericAnswer || undefined,
          numericTolerance: numericTolerance || undefined,
          explanation: explanation || existingLocal?.explanation || '',
          createdAt: row.created_at || existingLocal?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      })

      const taxonomyLinks = await this.fetchQuestionTaxonomyNodeIdsBatch(mapped.map((q) => q.id))
      const mappedWithTaxonomy = mapped.map((q) => ({
        ...q,
        taxonomyNodeIds: taxonomyLinks[q.id] || [],
      }))

      _questionsCache = mappedWithTaxonomy

      // Trigger automatic background backfill of any NULL taxonomy IDs in Supabase
      this.backfillSupabaseQuestionsTaxonomy().catch((err) => {
        console.warn('Notice running background Supabase taxonomy backfill:', err)
      })

      return mappedWithTaxonomy
    } catch (e) {
      console.warn('Error reading questions from Supabase:', e)
      throw e
    }
  },

  /**
   * Automatically repairs and links any Supabase questions that have null exam_id, subject_id, category_id, chapter_id, or lesson_id
   */
  async backfillSupabaseQuestionsTaxonomy(): Promise<{ updatedCount: number }> {
    if (!isSupabaseConfigured) return { updatedCount: 0 }

    try {
      // Find all questions in Supabase where category_id, chapter_id, lesson_id, exam_id, or subject_id is null
      const { data: nullQuestions, error } = await supabase
        .from('questions')
        .select('id, content_blocks, exam_id, subject_id, category_id, chapter_id, lesson_id')
        .or('category_id.is.null,chapter_id.is.null,lesson_id.is.null,exam_id.is.null,subject_id.is.null')

      if (error || !Array.isArray(nullQuestions) || nullQuestions.length === 0) {
        return { updatedCount: 0 }
      }

      // Generic taxonomy assignments are authoritative. Never backfill legacy
      // taxonomy foreign keys for questions that already have generic links.
      const candidateQuestionIds = nullQuestions.map((row: any) => String(row.id)).filter(Boolean)
      const { data: genericLinks, error: genericLinksError } = await supabase
        .from('question_taxonomy_nodes')
        .select('question_id')
        .in('question_id', candidateQuestionIds)

      if (genericLinksError) {
        throw genericLinksError
      }

      const genericQuestionIds = new Set(
        (genericLinks || []).map((row: any) => String(row.question_id)).filter(Boolean)
      )
      const legacyBackfillCandidates = nullQuestions.filter(
        (row: any) => !genericQuestionIds.has(String(row.id))
      )

      if (legacyBackfillCandidates.length === 0) {
        return { updatedCount: 0 }
      }

      console.log(`[Supabase] Found ${legacyBackfillCandidates.length} legacy question(s) with null taxonomy IDs. Running compatibility backfill...`)

      let orgId: string | null = null
      try {
        const { data: orgData } = await supabase.from('organizations').select('id').limit(1).maybeSingle()
        if (orgData?.id) orgId = orgData.id
      } catch {}

      const localQuestions = this.getStoredQuestions()
      const localMap = new Map(localQuestions.map((q) => [String(q.id).trim(), q]))

      let updatedCount = 0

      for (const row of legacyBackfillCandidates) {
        const localQ = localMap.get(String(row.id).trim())

        let promptText = ''
        if (Array.isArray(row.content_blocks)) {
          for (const b of row.content_blocks) {
            if (b.type === 'text' && b.content) promptText += b.content + ' '
          }
        }

        const matchedQ: QuestionBankItem = localQ || localQuestions.find((q) => promptText && promptText.includes(q.prompt.slice(0, 20))) || {
          id: row.id,
          domain: 'Algebra & Functions',
          chapter: 'Linear Equations & Systems',
          lesson: 'Single-Variable Linear Equations',
          targetExam: 'EST 1 / SAT Math',
          prompt: promptText || 'Math Question',
          difficulty: 'medium',
          questionType: 'multiple_choice',
          calculatorAllowed: false,
          estimatedSeconds: 90,
          choices: [],
          explanation: '',
        }

        const taxIds = await resolveTaxonomyIds(matchedQ, orgId)

        const updates: any = {}
        if (taxIds.exam_id) updates.exam_id = taxIds.exam_id
        if (taxIds.subject_id) updates.subject_id = taxIds.subject_id
        if (taxIds.category_id) updates.category_id = taxIds.category_id
        if (taxIds.chapter_id) updates.chapter_id = taxIds.chapter_id
        if (taxIds.lesson_id) updates.lesson_id = taxIds.lesson_id

        if (Object.keys(updates).length > 0) {
          const { error: updErr } = await supabase.from('questions').update(updates).eq('id', row.id)
          if (!updErr) {
            updatedCount++
            console.log(`[Supabase] Successfully linked question ${row.id} to taxonomy IDs:`, updates)
          } else {
            console.warn(`[Supabase] Failed to update taxonomy for question ${row.id}:`, updErr)
          }
        }
      }

      console.log(`[Supabase] Successfully backfilled ${updatedCount} legacy question(s) with compatibility taxonomy links.`)
      return { updatedCount }
    } catch (e) {
      console.warn('[Supabase] Error running backfillSupabaseQuestionsTaxonomy:', e)
      return { updatedCount: 0 }
    }
  },

  getQuestionById(id: string): QuestionBankItem | undefined {
    const list = this.getStoredQuestions()
    const targetId = String(id).trim()
    return list.find((q) => String(q.id).trim() === targetId)
  },

  /**
   * Resolve one question for edit/preview routes.
   *
   * The in-memory cache is only the fast path. Direct navigation and a full
   * browser refresh can occur before the question cache has been populated,
   * so the database-backed loader is the authoritative fallback.
   */
  async fetchQuestionById(id: string): Promise<QuestionBankItem | null> {
    const targetId = String(id || '').trim()
    if (!targetId) return null

    const cached = this.getQuestionById(targetId)
    if (cached) return cached

    const questions = await this.fetchQuestionsFromDatabase()
    return questions.find((question) => String(question.id).trim() === targetId) || null
  },

  /**
   * Load the persisted context required by the question editor.
   *
   * Collection membership comes from questions.question_set_id -> question_sets.
   * Generic taxonomy membership comes from question_taxonomy_nodes -> taxonomy_nodes.
   * The generic relationship table is authoritative; legacy domain/chapter/lesson
   * fields are intentionally not used to manufacture taxonomy assignments here.
   */
  async fetchQuestionEditorContext(questionId: string): Promise<{
    collectionName: string
    collectionId: string | null
    taxonomyId: string | null
    taxonomyNodeIds: string[]
    taxonomyNodes: GenericTaxonomyNode[]
  }> {
    const targetId = String(questionId || '').trim()

    if (!targetId) {
      return {
        collectionName: '',
        collectionId: null,
        taxonomyId: null,
        taxonomyNodeIds: [],
        taxonomyNodes: [],
      }
    }

    if (!isSupabaseConfigured) {
      return {
        collectionName: '',
        collectionId: null,
        taxonomyId: null,
        taxonomyNodeIds: [],
        taxonomyNodes: [],
      }
    }

    const [questionResult, taxonomyLinkResult] = await Promise.all([
      supabase
        .from('questions')
        .select('question_set_id')
        .eq('id', targetId)
        .maybeSingle(),
      supabase
        .from('question_taxonomy_nodes')
        .select('taxonomy_node_id')
        .eq('question_id', targetId),
    ])

    if (questionResult.error) throw questionResult.error
    if (taxonomyLinkResult.error) throw taxonomyLinkResult.error

    const collectionId = questionResult.data?.question_set_id
      ? String(questionResult.data.question_set_id)
      : null

    let collectionName = ''
    if (collectionId) {
      const { data: collection, error: collectionError } = await supabase
        .from('question_sets')
        .select('id, title')
        .eq('id', collectionId)
        .maybeSingle()

      if (collectionError) throw collectionError
      collectionName = collection?.title ? String(collection.title) : ''
    }

    const taxonomyNodeIds: string[] = Array.from(
      new Set<string>(
        (taxonomyLinkResult.data || [])
          .map((row: any) => String(row.taxonomy_node_id || '').trim())
          .filter(Boolean)
      )
    )

    if (taxonomyNodeIds.length === 0) {
      return {
        collectionName,
        collectionId,
        taxonomyId: null,
        taxonomyNodeIds: [],
        taxonomyNodes: [],
      }
    }

    const { data: nodeRows, error: nodeError } = await supabase
      .from('taxonomy_nodes')
      .select('id, taxonomy_id, parent_id, name, code, description, sort_order, is_active')
      .in('id', taxonomyNodeIds)
      .eq('is_active', true)

    if (nodeError) throw nodeError

    const selectedRows = nodeRows || []
    const taxonomyIds: string[] = Array.from(
      new Set<string>(
        selectedRows
          .map((row: any) => String(row.taxonomy_id || '').trim())
          .filter(Boolean)
      )
    )
    const taxonomyId: string | null = taxonomyIds[0] || null

    let taxonomyNodes: GenericTaxonomyNode[] = []
    if (taxonomyId) {
      taxonomyNodes = await fetchGenericTaxonomyNodes(taxonomyId)
    }

    return {
      collectionName,
      collectionId,
      taxonomyId,
      taxonomyNodeIds,
      taxonomyNodes,
    }
  },

  async addQuestion(question: QuestionBankItem): Promise<QuestionBankItem> {
    if (!_hasLoadedQuestions && typeof window !== 'undefined') {
      try {
        await this.fetchQuestionsFromDatabase()
      } catch {}
    }
    const list = this.getStoredQuestions()
    const targetId = String(question.id).trim()
    const updated = [question, ...list.filter((q) => String(q.id).trim() !== targetId)]

    // Persist through Supabase before returning the saved question.
    await this.syncQuestionToDatabase(question)
    _questionsCache = updated
    return question
  },

  async updateQuestion(id: string, updates: Partial<QuestionBankItem>): Promise<QuestionBankItem | null> {
    if (!_hasLoadedQuestions && typeof window !== 'undefined') {
      try {
        await this.fetchQuestionsFromDatabase()
      } catch {}
    }
    const list = this.getStoredQuestions()
    const targetId = String(id).trim()
    const original = list.find((q) => String(q.id).trim() === targetId)
    let updatedItem: QuestionBankItem | null = null
    const updated = list.map((q) => {
      if (String(q.id).trim() === targetId) {
        updatedItem = { ...q, ...updates, updatedAt: new Date().toISOString() }
        return updatedItem
      }
      return q
    })
    if (updatedItem && original) {
      // The usual sync rebuilds choices, correct answers, and taxonomy links.
      // For text/explanation/difficulty-only edits, preserve those dependent
      // rows (and their IDs) by updating only the changed questions columns.
      // All other edits retain the existing full-sync behavior.
      const changedFields = (Object.keys(updatedItem) as Array<keyof QuestionBankItem>)
        .filter((key) => key !== 'updatedAt' &&
          JSON.stringify(original[key]) !== JSON.stringify(updatedItem![key]))
      const simpleFields = new Set<keyof QuestionBankItem>(['prompt', 'explanation', 'difficulty'])
      const isSimpleEdit = changedFields.length > 0 &&
        changedFields.every((key) => simpleFields.has(key)) &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)

      let savedByFastPath = false
      if (isSimpleEdit) {
        const needsPrompt = changedFields.includes('prompt')
        const needsExplanation = changedFields.includes('explanation')
        const payload: Record<string, unknown> = {}
        if (changedFields.includes('difficulty')) payload.difficulty = updatedItem.difficulty

        // Only the logged-in organization may be updated. This is intentional
        // even on deployments where the legacy questions RLS is too permissive.
        const { data: auth, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!auth.user?.id) throw new Error('Sign in before updating a question.')
        const { data: profile, error: profileError } = await supabase.from('profiles')
          .select('organization_id').eq('id', auth.user.id).single()
        if (profileError) throw profileError
        if (!profile?.organization_id) throw new Error('No organization is assigned to your account.')

        if (needsPrompt || needsExplanation) {
          const { data: persisted, error: readError } = await supabase.from('questions')
            .select('content_blocks, explanation_blocks')
            .eq('id', targetId)
            .eq('organization_id', profile.organization_id)
            .maybeSingle()
          if (readError) throw readError
          if (!persisted) throw new Error('Question not found in your organization. Refresh before editing.')

          // Do not flatten rich content such as images, math, or tables. The
          // simple path is valid only for the same plain-text representation
          // that the current Question Bank editor loaded into its baseline.
          if (needsPrompt) {
            const blocks = persisted.content_blocks
            const textBlocks = Array.isArray(blocks)
              ? blocks.filter((block: any) => block?.type === 'text') : []
            if (textBlocks.length === 1 &&
                String(textBlocks[0].content ?? '') === String(original.prompt ?? '')) {
              payload.content_blocks = blocks.map((block: any) => block?.type === 'text'
                ? { ...block, content: (updatedItem!.prompt || 'Question Prompt').trim() }
                : block)
            } else if (textBlocks.length === 1) {
              throw new Error('Question text changed since it was loaded. Refresh before saving.')
            }
          }
          if (needsExplanation) {
            const blocks = persisted.explanation_blocks
            const textBlocks = Array.isArray(blocks)
              ? blocks.filter((block: any) => block?.type === 'text') : []
            if (Array.isArray(blocks) && blocks.length === 0 && !original.explanation) {
              payload.explanation_blocks = updatedItem.explanation
                ? [{ type: 'text', content: updatedItem.explanation }] : []
            } else if (Array.isArray(blocks) && blocks.length === 1 &&
                textBlocks.length === 1 &&
                String(textBlocks[0].content ?? '') === String(original.explanation ?? '')) {
              payload.explanation_blocks = updatedItem.explanation
                ? [{ ...textBlocks[0], content: updatedItem.explanation }] : []
            } else if (textBlocks.length === 1 && blocks.length === 1) {
              throw new Error('Question explanation changed since it was loaded. Refresh before saving.')
            }
          }
        }

        // If this question uses a richer content representation than the
        // simple path supports, fall back to the established sync method.
        const allRequestedFieldsHandled =
          (!needsPrompt || Object.prototype.hasOwnProperty.call(payload, 'content_blocks')) &&
          (!needsExplanation || Object.prototype.hasOwnProperty.call(payload, 'explanation_blocks'))
        if (allRequestedFieldsHandled) {
          const { data: confirmed, error: updateError } = await supabase.from('questions')
            .update(payload)
            .eq('id', targetId)
            .eq('organization_id', profile.organization_id)
            .select('id')
            .maybeSingle()
          if (updateError) throw updateError
          if (!confirmed?.id) throw new Error('Question edit was not saved. Refresh before retrying.')
          savedByFastPath = true
        }
      }
      if (!savedByFastPath) await this.syncQuestionToDatabase(updatedItem)
    }
    _questionsCache = updated
    return updatedItem
  },

  async deleteQuestion(id: string): Promise<void> {
    const targetId = String(id).trim()
    await this.deleteQuestionFromDatabase(targetId)
    _questionsCache = _questionsCache.filter((q) => String(q.id).trim() !== targetId)
  },

  async deleteQuestions(ids: string[]): Promise<void> {
    const validIds = Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)))
    if (validIds.length === 0) return

    // All requested deletions and their assessment-reference cleanup commit
    // together, including the normalized module mirror update.
    const { data, error } = await supabase.rpc('delete_question_bank_items_v1', {
      p_question_ids: validIds,
    })
    if (error) throw error
    if (data !== validIds.length) {
      throw new Error('Bulk deletion could not be confirmed. No local question list was changed.')
    }
    const idSet = new Set(validIds)
    _questionsCache = _questionsCache.filter((q) => !idSet.has(String(q.id).trim()))
  },

  async clearAllQuestions(): Promise<void> {
    // This RPC is explicitly scoped to the signed-in organization, and refuses
    // to remove questions still used by published or attempted assessments.
    const { data, error } = await supabase.rpc('clear_organization_question_bank_v1')
    if (error) throw error
    if (typeof data !== 'number' || !Number.isFinite(data)) {
      throw new Error('Question Bank deletion could not be confirmed.')
    }
    _questionsCache = []
    _hasLoadedQuestions = true
    if (Array.isArray(_collectionsCache)) {
      _collectionsCache = _collectionsCache.map((collection) => ({ ...collection, questionCount: 0 }))
    }
  },

  async restoreDefaultSeedQuestions(): Promise<QuestionBankItem[]> {
    _questionsCache = INITIAL_SEED_QUESTIONS
    await this.saveQuestions(INITIAL_SEED_QUESTIONS)
    return INITIAL_SEED_QUESTIONS
  },

  deleteCollection(collectionName: string, deleteQuestions: boolean = false): void {
    const trimmed = collectionName.trim().toLowerCase()
    const currentCols = this.getStoredCollections()
    this.saveStoredCollections(currentCols.filter((c) => c.name.trim().toLowerCase() !== trimmed))

    const currentQuestions = this.getStoredQuestions()
    if (deleteQuestions) {
      this.saveQuestions(
        currentQuestions.filter((q) => (q.collection || '').trim().toLowerCase() !== trimmed)
      )
    } else {
      const updated = currentQuestions.map((q) => {
        if ((q.collection || '').trim().toLowerCase() === trimmed) {
          return { ...q, collection: 'General Question Bank' }
        }
        return q
      })
      this.saveQuestions(updated)
    }
  },

  // Dynamic Taxonomy Management (Domain (Unit) -> Chapter -> Lesson) with Supabase persistence
  subscribeTaxonomy(listener: (tax: TaxonomyRegistry) => void): () => void {
    _taxonomyListeners.add(listener)
    return () => _taxonomyListeners.delete(listener)
  },

  _notifyTaxonomyListeners(): void {
    _taxonomyListeners.forEach((fn) => {
      try { fn(_taxonomyCache) } catch {}
    })
  },

  getTaxonomy(): TaxonomyRegistry {
    if (!_hasLoadedTaxonomy && !_isFetchingTaxonomy && typeof window !== 'undefined') {
      this.fetchTaxonomy().catch(() => {})
    }
    return _taxonomyCache
  },


  async fetchTaxonomy(): Promise<TaxonomyRegistry> {
    if (_isFetchingTaxonomy) return _taxonomyCache

    _isFetchingTaxonomy = true

    try {
      // Start completely empty - strictly populated from database, NO DATA SEEDING
      const mergedTax: TaxonomyRegistry = {}

      // Prefer the new generic taxonomy model.
      // Keep the legacy loader below as a compatibility fallback.
      if (isSupabaseConfigured) {
        try {
          const genericTaxonomies = await fetchGenericTaxonomies()

          if (genericTaxonomies.length > 0) {
            for (const taxonomy of genericTaxonomies) {
              const nodes = await fetchGenericTaxonomyNodes(taxonomy.id)

              if (nodes.length === 0) continue

              const legacyRegistry = buildLegacyTaxonomyRegistry(
                taxonomy,
                nodes
              )

              Object.assign(mergedTax, legacyRegistry)
            }

            if (Object.keys(mergedTax).length > 0) {
              _taxonomyCache = mergedTax
              _hasLoadedTaxonomy = true
              this._notifyTaxonomyListeners()
              return _taxonomyCache
            }
          }
        } catch (genericTaxonomyError) {
          console.warn(
            '[Generic Taxonomy] Falling back to legacy taxonomy loader:',
            genericTaxonomyError
          )
        }
      }

      // Fetch directly from Supabase database tables
      if (isSupabaseConfigured) {
        // A. Primary: Check 'taxonomy' table in Supabase
        try {
          const { data: taxRows, error: taxErr } = await supabase
            .from('taxonomy')
            .select('*')
            .range(0, 9999)

          if (!taxErr && Array.isArray(taxRows) && taxRows.length > 0) {
            _detectedTaxonomySchema.hasTaxonomyTable = true
            parseSupabaseTaxonomyRows(taxRows, mergedTax)

            console.log(
              `[Supabase Taxonomy] Retrieved and parsed ${taxRows.length} row(s) from 'taxonomy' table into ${Object.keys(mergedTax).length} domain(s).`
            )
          }
        } catch (dbErr) {
          console.warn(
            '[Supabase Taxonomy] Exception checking taxonomy table:',
            dbErr
          )
        }

        // B. Check 'curriculum_taxonomy' document table in Supabase
        try {
          const { data: currTaxRows, error: currErr } = await supabase
            .from('curriculum_taxonomy')
            .select('*')

          if (
            !currErr &&
            Array.isArray(currTaxRows) &&
            currTaxRows.length > 0
          ) {
            _detectedTaxonomySchema.hasCurriculumTaxonomyTable = true
            parseSupabaseTaxonomyRows(currTaxRows, mergedTax)
          }
        } catch {}

        // C. Relational: categories, chapters, lessons, skills in Supabase
        try {
          const [catRes, chapRes, lessonRes, skillRes] = await Promise.all([
            supabase
              .from('categories')
              .select('*')
              .range(0, 9999)
              .order('name'),
            supabase
              .from('chapters')
              .select('*')
              .range(0, 9999)
              .order('name'),
            supabase
              .from('lessons')
              .select('*')
              .range(0, 9999)
              .order('name'),
            supabase
              .from('skills')
              .select('*')
              .range(0, 9999)
              .order('name'),
          ])

          const categories = catRes.data || []
          const chapters = chapRes.data || []
          const lessons = lessonRes.data || []
          const skills = skillRes.data || []

          if (
            categories.length > 0 ||
            chapters.length > 0 ||
            lessons.length > 0
          ) {
            _detectedTaxonomySchema.hasCategoriesTable = true

            console.log(
              `[Supabase Taxonomy] Retrieved ${categories.length} categories, ${chapters.length} chapters, ${lessons.length} lessons.`
            )

            // Map all categories to domains
            categories.forEach((cat: any) => {
              if (!cat || !cat.name) return

              const rawName = String(cat.name).trim()
              let domainName = rawName
              let extractedCode: string | undefined = undefined

              const codePrefixMatch = rawName.match(
                /^\[([A-Za-z0-9_-]+)\]\s*(.*)$/
              )

              if (codePrefixMatch) {
                extractedCode = codePrefixMatch[1]
                domainName = codePrefixMatch[2] || rawName
              }

              let unitLabel = `Unit: ${domainName}`
              let code = extractedCode || getDomainCode(domainName)

              if (cat.description) {
                try {
                  const parsed = JSON.parse(cat.description)

                  if (parsed.unitLabel) unitLabel = parsed.unitLabel
                  if (parsed.code) code = parsed.code
                } catch {
                  if (
                    typeof cat.description === 'string' &&
                    cat.description.trim()
                  ) {
                    unitLabel = cat.description.trim()
                  }
                }
              }

              if (cat.id) {
                _supabaseDomainIdMap.set(
                  domainName.toLowerCase(),
                  String(cat.id)
                )

                _supabaseDomainIdMap.set(
                  rawName.toLowerCase(),
                  String(cat.id)
                )

                _supabaseDomainIdMap.set(
                  String(cat.id),
                  domainName
                )
              }

              if (!mergedTax[domainName]) {
                mergedTax[domainName] = {
                  unitLabel,
                  code,
                  chapters: [],
                }
              }
            })

            // Map all chapters to their respective domain
            chapters.forEach((ch: any) => {
              const chapName = String(ch.name || '').trim()
              if (!chapName) return

              let targetDomainName = ''

              if (ch.category_id) {
                targetDomainName =
                  _supabaseDomainIdMap.get(String(ch.category_id)) || ''
              }

              if (!targetDomainName && ch.domain) {
                targetDomainName = String(ch.domain).trim()
              }

              if (!targetDomainName) {
                const firstDom = Object.keys(mergedTax)[0]
                targetDomainName =
                  firstDom || 'General Curriculum'
              }

              if (!mergedTax[targetDomainName]) {
                mergedTax[targetDomainName] = {
                  unitLabel: `Unit: ${targetDomainName}`,
                  code: getDomainCode(targetDomainName),
                  chapters: [],
                }
              }

              const catId =
                _supabaseDomainIdMap.get(
                  targetDomainName.toLowerCase()
                ) || ch.category_id

              if (ch.id && catId) {
                _supabaseChapterIdMap.set(
                  `${catId}::${chapName.toLowerCase()}`,
                  String(ch.id)
                )

                _supabaseChapterIdMap.set(
                  String(ch.id),
                  chapName
                )
              }

              let chapObj = mergedTax[targetDomainName].chapters.find(
                (c) =>
                  c.name.toLowerCase() === chapName.toLowerCase()
              )

              if (!chapObj) {
                chapObj = {
                  name: chapName,
                  code:
                    ch.description ||
                    `${mergedTax[targetDomainName].code || 'CH'}.${mergedTax[targetDomainName].chapters.length + 1}`,
                  lessons: [],
                }

                mergedTax[targetDomainName].chapters.push(chapObj)
              }
            })

            // Map all lessons to chapters
            lessons.forEach((ls: any) => {
              const lessonName = String(ls.name || '').trim()
              if (!lessonName) return

              let targetChapName = ''

              if (ls.chapter_id) {
                targetChapName =
                  _supabaseChapterIdMap.get(
                    String(ls.chapter_id)
                  ) || ''
              }

              if (!targetChapName && ls.chapter) {
                targetChapName = String(ls.chapter).trim()
              }

              let foundChap: {
                name: string
                lessons: string[]
              } | null = null

              for (const d of Object.values(mergedTax)) {
                const c = d.chapters.find((ch) =>
                  targetChapName
                    ? ch.name.toLowerCase() ===
                      targetChapName.toLowerCase()
                    : true
                )

                if (c) {
                  foundChap = c
                  break
                }
              }

              if (!foundChap) {
                const firstDom =
                  Object.keys(mergedTax)[0] ||
                  'General Curriculum'

                if (!mergedTax[firstDom]) {
                  mergedTax[firstDom] = {
                    unitLabel: `Unit: ${firstDom}`,
                    code: 'GEN',
                    chapters: [],
                  }
                }

                if (mergedTax[firstDom].chapters.length === 0) {
                  mergedTax[firstDom].chapters.push({
                    name:
                      targetChapName || 'General Chapter',
                    code: 'GEN.1',
                    lessons: [],
                  })
                }

                foundChap = mergedTax[firstDom].chapters[0]
              }

              if (
                foundChap &&
                !foundChap.lessons.some(
                  (l) =>
                    l.toLowerCase() ===
                    lessonName.toLowerCase()
                )
              ) {
                foundChap.lessons.push(lessonName)
              }

              if (ls.id && ls.chapter_id) {
                _supabaseLessonIdMap.set(
                  `${ls.chapter_id}::${lessonName.toLowerCase()}`,
                  String(ls.id)
                )
              }
            })

            // Map any skills from skills table
            skills.forEach((sk: any) => {
              const skillName = String(sk.name || '').trim()
              if (!skillName) return

              for (const d of Object.values(mergedTax)) {
                for (const c of d.chapters) {
                  if (
                    !c.lessons.some(
                      (l) =>
                        l.toLowerCase() ===
                        skillName.toLowerCase()
                    )
                  ) {
                    c.lessons.push(skillName)
                  }
                }
              }
            })
          }
        } catch (dbErr) {
          console.warn(
            '[Supabase Taxonomy] Notice loading categories:',
            dbErr
          )
        }
      }

      // 3. Ensure all questions in database are linked into the taxonomy tree
      try {
        const questionsList = this.getStoredQuestions()

        for (const q of questionsList) {
          const d = (q.domain || '').trim()
          if (!d) continue

          if (!mergedTax[d]) {
            mergedTax[d] = {
              unitLabel: `Unit: ${d}`,
              code: getDomainCode(d),
              chapters: [],
            }
          }

          const cName = (q.chapter || q.topic || '').trim()

          if (cName) {
            let chap = mergedTax[d].chapters.find(
              (c) =>
                c.name.toLowerCase() ===
                cName.toLowerCase()
            )

            if (!chap) {
              chap = {
                name: cName,
                code: `${mergedTax[d].code || 'CH'}.${mergedTax[d].chapters.length + 1}`,
                lessons: [],
              }

              mergedTax[d].chapters.push(chap)
            }

            const lName = (q.lesson || '').trim()

            if (
              lName &&
              !chap.lessons.some(
                (l) =>
                  l.toLowerCase() ===
                  lName.toLowerCase()
              )
            ) {
              chap.lessons.push(lName)
            }
          }
        }
      } catch (qErr) {
        console.warn(
          '[Taxonomy] Notice linking questions into taxonomy:',
          qErr
        )
      }

      _taxonomyCache = mergedTax
      _hasLoadedTaxonomy = true
      this._notifyTaxonomyListeners()

         return _taxonomyCache
    } finally {
      _isFetchingTaxonomy = false
    }
  },

  async saveTaxonomy(taxonomy: TaxonomyRegistry): Promise<boolean> {
    _taxonomyCache = { ...taxonomy }
    _hasLoadedTaxonomy = true
    this._notifyTaxonomyListeners()

    if (!isSupabaseConfigured) {
      return true
    }

    try {
      const { error } = await supabase
        .from('curriculum_taxonomy')
        .upsert({
          id: 'current',
          data: JSON.stringify(_taxonomyCache),
        })

      if (error) {
        console.warn('[Taxonomy] Notice saving taxonomy:', error)
        return false
      }

      return true
    } catch (err) {
      console.warn('[Taxonomy] Notice saving taxonomy:', err)
      return false
    }
  },

  restoreDefaultTaxonomy(): TaxonomyRegistry {
    // Taxonomy is database-backed.
    // Do not seed hardcoded taxonomy data.
    this.fetchTaxonomy().catch(() => {})
    return _taxonomyCache
  },

  async clearAllTaxonomy(
    deleteLinkedQuestions: boolean = false
  ): Promise<void> {
    const taxonomyQuestionFilter =
      'exam_id.not.is.null,subject_id.not.is.null,category_id.not.is.null,chapter_id.not.is.null,lesson_id.not.is.null,skill_id.not.is.null'

    const [{ data: legacyLinkedQuestions, error: questionsError }, { data: genericLinks, error: genericLinksError }] = await Promise.all([
      supabase
        .from('questions')
        .select('id')
        .or(taxonomyQuestionFilter),
      supabase
        .from('question_taxonomy_nodes')
        .select('question_id'),
    ])

    if (questionsError) {
      throw questionsError
    }
    if (genericLinksError) {
      throw genericLinksError
    }

    const questionIds = Array.from(new Set([
      ...(legacyLinkedQuestions ?? []).map((question: { id: string }) => String(question.id)),
      ...(genericLinks ?? []).map((row: { question_id: string }) => String(row.question_id)),
    ]))

    if (questionIds.length > 0) {
      if (deleteLinkedQuestions) {
        await this.deleteQuestions(questionIds)
      } else {
        const { error: genericDeleteError } = await supabase
          .from('question_taxonomy_nodes')
          .delete()
          .in('question_id', questionIds)

        if (genericDeleteError) {
          throw genericDeleteError
        }

        const { error } = await supabase
          .from('questions')
          .update({
            exam_id: null,
            subject_id: null,
            category_id: null,
            chapter_id: null,
            lesson_id: null,
            skill_id: null,
          })
          .in('id', questionIds)

        if (error) {
          throw error
        }

        const linkedIdSet = new Set(questionIds.map(String))

        _questionsCache = _questionsCache.map((question) =>
          linkedIdSet.has(String(question.id))
            ? {
                ...question,
                taxonomyNodeIds: [],
                domain: 'Unassigned',
                chapter: '',
                lesson: '',
              }
            : question
        )
      }
    }

    const { error: levelCategoriesError } = await supabase
      .from('level_categories')
      .delete()
      .not('level_id', 'is', null)

    if (levelCategoriesError) {
      throw levelCategoriesError
    }

    const { error: lessonsError } = await supabase
      .from('lessons')
      .delete()
      .not('id', 'is', null)

    if (lessonsError) {
      throw lessonsError
    }

    const { error: chaptersError } = await supabase
      .from('chapters')
      .delete()
      .not('id', 'is', null)

    if (chaptersError) {
      throw chaptersError
    }

    const { error: categoriesError } = await supabase
      .from('categories')
      .delete()
      .not('id', 'is', null)

    if (categoriesError) {
      throw categoriesError
    }

    if (_detectedTaxonomySchema.hasTaxonomyTable) {
      const { error: taxonomyError } = await supabase
        .from('taxonomy')
        .delete()
        .not('id', 'is', null)

      if (taxonomyError) {
        throw taxonomyError
      }
    }

    if (_detectedTaxonomySchema.hasCurriculumTaxonomyTable) {
      const { error: curriculumTaxonomyError } = await supabase
        .from('curriculum_taxonomy')
        .delete()
        .not('id', 'is', null)

      if (curriculumTaxonomyError) {
        throw curriculumTaxonomyError
      }
    }

    _taxonomyCache = {}
    _hasLoadedTaxonomy = true

    _supabaseDomainIdMap.clear()
    _supabaseChapterIdMap.clear()
    _supabaseLessonIdMap.clear()

    this._notifyTaxonomyListeners()
  },


  async addDomain(
    domainName: string,
    unitLabel?: string,
    code?: string,
    taxonomyId?: string
  ): Promise<void> {
    const trimmed = domainName.trim()
    if (!trimmed) return

    const finalUnit = unitLabel || `Unit: ${trimmed}`
    const finalCode = code || getDomainCode(trimmed)

    // Generic taxonomy is opt-in for now so existing callers remain compatible.
    // Once the UI passes taxonomyId, the generic taxonomy node becomes the
    // authoritative new write path while legacy tables remain compatibility data.
    if (taxonomyId) {
      const genericNode = await getOrCreateGenericTaxonomyNode(
        taxonomyId,
        trimmed,
        null,
        {
          code: finalCode,
          description: finalUnit,
          sortOrder: 0,
        }
      )

      _supabaseDomainIdMap.set(trimmed.toLowerCase(), genericNode.id)
      _supabaseDomainIdMap.set(genericNode.id, trimmed)

      const taxonomies = await fetchGenericTaxonomies()
      const selectedTaxonomy = taxonomies.find(
        (taxonomy) => taxonomy.id === taxonomyId
      )

      if (!selectedTaxonomy) {
        throw new Error('The selected taxonomy could not be found or is inactive.')
      }

      const tax = this.getTaxonomy()
      const nextTaxonomy = {
        ...tax,
        [trimmed]: {
          unitLabel: finalUnit,
          code: finalCode,
          chapters: tax[trimmed]?.chapters || [],
        },
      }

      _taxonomyCache = nextTaxonomy
      _hasLoadedTaxonomy = true
      this._notifyTaxonomyListeners()

      return
    }

    // Legacy compatibility path.
    // Existing callers do not yet provide a taxonomyId. Keep their current
    // behavior until the taxonomy selector is migrated to the generic model.
    const tax = this.getTaxonomy()

    const { data: subject, error: subjectError } = await supabase
      .from('subjects')
      .select('id')
      .ilike('name', '%Math%')
      .limit(1)
      .maybeSingle()

    if (subjectError) throw subjectError

    if (!subject?.id) {
      throw new Error(
        'Create a Mathematics subject for this organization before adding taxonomy domains.'
      )
    }

    const { data: insertedCategory, error: categoryError } = await supabase
      .from('categories')
      .insert({
        name: trimmed,
        description: JSON.stringify({ unitLabel: finalUnit, code: finalCode }),
        subject_id: subject.id,
        is_active: true,
      })
      .select('id')
      .single()

    if (categoryError) throw categoryError
    if (!insertedCategory?.id) {
      throw new Error('Supabase did not return the created taxonomy domain.')
    }

    const nextTaxonomy = {
      ...tax,
      [trimmed]: {
        unitLabel: finalUnit,
        code: finalCode,
        chapters: tax[trimmed]?.chapters || [],
      },
    }

    _taxonomyCache = nextTaxonomy
    this._notifyTaxonomyListeners()
    _supabaseDomainIdMap.set(trimmed.toLowerCase(), String(insertedCategory.id))
    _supabaseDomainIdMap.set(String(insertedCategory.id), trimmed)

    if (isSupabaseConfigured) {
      try {
        const payload: any = {
          name: trimmed,
          domain: trimmed,
          unit_label: finalUnit,
          code: finalCode,
          type: 'domain',
          description: finalUnit,
        }

        const { data: insRow } = await safeInsertTaxonomyTable('taxonomy', payload)

        if (insRow?.id) {
          _supabaseDomainIdMap.set(trimmed.toLowerCase(), String(insRow.id))
        }
      } catch (e) {
        console.warn(
          '[Supabase Taxonomy] Exception inserting into taxonomy table:',
          e
        )
      }
    }
  },

  async updateDomain(oldDomainName: string, newDomainName: string, unitLabel?: string, code?: string, taxonomyId?: string): Promise<void> {
    const oldTrim = oldDomainName.trim()
    const newTrim = newDomainName.trim()

    if (taxonomyId) {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
      const nodes = await fetchGenericTaxonomyNodes(taxonomyId)
      const node = nodes.find((n) => n.parentId === null && n.name.toLowerCase() === oldTrim.toLowerCase())
      if (!node) throw new Error(`The selected domain "${oldTrim}" was not found in the selected taxonomy.`)
      const updates: any = { name: newTrim }
      if (code !== undefined) updates.code = code || null
      if (unitLabel !== undefined) updates.description = unitLabel || null
      const { error } = await supabase.from('taxonomy_nodes').update(updates).eq('id', node.id).eq('taxonomy_id', taxonomyId)
      if (error) throw error

      const tax = this.getTaxonomy()
      const existingData = tax[oldTrim]
      if (existingData) {
        delete tax[oldTrim]
        tax[newTrim] = { ...existingData, unitLabel: unitLabel ?? existingData.unitLabel, code: code ?? existingData.code }
        _taxonomyCache = { ...tax }
        this._notifyTaxonomyListeners()
      }
      if (oldTrim !== newTrim) {
        const questions = this.getStoredQuestions()
        this.saveQuestions(questions.map((q) => q.domain === oldTrim ? { ...q, domain: newTrim } : q))
      }
      return
    }
    const tax = this.getTaxonomy()
    if (!tax[oldTrim]) return

    const existingData = tax[oldTrim]
    delete tax[oldTrim]
    const finalUnit = unitLabel ?? existingData.unitLabel
    const finalCode = code ?? existingData.code

    tax[newTrim] = {
      ...existingData,
      unitLabel: finalUnit,
      code: finalCode,
    }
    _taxonomyCache = { ...tax }
    this._notifyTaxonomyListeners()

    // Update questions mapped to old domain
    if (oldTrim !== newTrim) {
      const questions = this.getStoredQuestions()
      const updated = questions.map((q) =>
        q.domain === oldTrim ? { ...q, domain: newTrim } : q
      )
      this.saveQuestions(updated)
    }

    // Persist to Supabase
    if (isSupabaseConfigured) {
      // A. Update in 'taxonomy' table
      try {
        await supabase.from('taxonomy').update({ domain: newTrim, name: newTrim, unit_label: finalUnit, code: finalCode }).ilike('domain', oldTrim)
        await supabase.from('taxonomy').update({ name: newTrim, code: finalCode, description: finalUnit }).eq('type', 'domain').ilike('name', oldTrim)
      } catch {}

      // B. Update in 'curriculum_taxonomy'
      try {
        await supabase.from('curriculum_taxonomy').upsert({ id: 'current', data: JSON.stringify(_taxonomyCache) })
      } catch {}

      // C. Update in 'categories' table
      try {
        const catId = _supabaseDomainIdMap.get(oldTrim.toLowerCase())
        const updates: any = {
          name: newTrim,
          description: JSON.stringify({ unitLabel: finalUnit, code: finalCode }),
        }

        if (catId) {
          await supabase.from('categories').update(updates).eq('id', catId)
          _supabaseDomainIdMap.delete(oldTrim.toLowerCase())
          _supabaseDomainIdMap.set(newTrim.toLowerCase(), catId)
        } else {
          await supabase.from('categories').update(updates).ilike('name', oldTrim)
        }
      } catch (err) {
        console.warn('[Supabase Taxonomy] Notice updating domain in categories:', err)
      }
    }
  },

  async deleteDomain(domainName: string, deleteLinkedQuestions: boolean = false): Promise<void> {
    const tax = this.getTaxonomy()
    const trimmed = domainName.trim()
    const matchKey = Object.keys(tax).find((k) => k.trim().toLowerCase() === trimmed.toLowerCase()) || trimmed
    if (tax[matchKey]) {
      delete tax[matchKey]
    }
    _taxonomyCache = { ...tax }
    this._notifyTaxonomyListeners()

    // 1. Update in-memory questions cache according to user's question choice
    if (deleteLinkedQuestions) {
      _questionsCache = _questionsCache.filter(
        (q) => (q.domain || '').trim().toLowerCase() !== trimmed.toLowerCase()
      )
    } else {
      _questionsCache = _questionsCache.map((q) =>
        (q.domain || '').trim().toLowerCase() === trimmed.toLowerCase()
          ? { ...q, domain: 'Unassigned', chapter: '', lesson: '' }
          : q
      )
    }

    // Supabase cascading deletion
    if (isSupabaseConfigured) {
      try {
        await supabase.from('taxonomy').delete().ilike('domain', trimmed)
        await supabase.from('taxonomy').delete().eq('type', 'domain').ilike('name', trimmed)
        const catId = _supabaseDomainIdMap.get(trimmed.toLowerCase())
        if (catId) {
          await supabase.from('taxonomy').delete().eq('id', catId)
        }
      } catch {}

      try {
        await supabase.from('curriculum_taxonomy').upsert({ id: 'current', data: JSON.stringify(_taxonomyCache) })
      } catch {}

      try {
        const catId = _supabaseDomainIdMap.get(trimmed.toLowerCase())
        if (catId) {
          const { data: chaps } = await supabase.from('chapters').select('id').eq('category_id', catId)
          if (chaps && chaps.length > 0) {
            const chapIds = chaps.map((c: any) => c.id)
            await supabase.from('lessons').delete().in('chapter_id', chapIds)
            await supabase.from('chapters').delete().eq('category_id', catId)
          }
          await supabase.from('level_categories').delete().eq('category_id', catId)
          await supabase.from('categories').delete().eq('id', catId)
          _supabaseDomainIdMap.delete(trimmed.toLowerCase())
        } else {
          await supabase.from('categories').delete().ilike('name', trimmed)
        }
      } catch (err) {
        console.warn('[Supabase Taxonomy] Notice deleting domain in categories:', err)
      }

      try {
        if (deleteLinkedQuestions) {
          await supabase.from('questions').delete().ilike('domain', trimmed)
        } else {
          await supabase.from('questions').update({ domain: 'Unassigned', chapter: '', lesson: '' }).ilike('domain', trimmed)
        }
      } catch {}
    }
  },

  async addChapter(domainName: string, chapterName: string, code?: string, taxonomyId?: string): Promise<void> {
    const dTrim = domainName.trim()
    const cTrim = chapterName.trim()
    if (!dTrim || !cTrim) return

    if (taxonomyId) {
      const taxonomies = await fetchGenericTaxonomies()
      const selectedTaxonomy = taxonomies.find((taxonomy) => taxonomy.id === taxonomyId)
      if (!selectedTaxonomy) throw new Error('The selected taxonomy could not be found or is inactive.')

      const rootNodes = await fetchGenericTaxonomyNodes(taxonomyId)
      const parentNode = rootNodes.find(
        (node) => node.parentId === null && node.name.trim().toLowerCase() === dTrim.toLowerCase() && node.isActive
      )
      if (!parentNode) throw new Error(`The selected taxonomy does not contain the domain "${dTrim}".`)

      const childCount = rootNodes.filter((node) => node.parentId === parentNode.id).length
      const chapCode = code?.trim() || `${parentNode.code || selectedTaxonomy.code || 'CH'}.${childCount + 1}`
      const genericNode = await getOrCreateGenericTaxonomyNode(taxonomyId, cTrim, parentNode.id, {
        code: chapCode,
        sortOrder: childCount,
      })

      const tax = this.getTaxonomy()
      const nextTaxonomy = {
        ...tax,
        [dTrim]: {
          unitLabel: tax[dTrim]?.unitLabel || selectedTaxonomy.name,
          code: tax[dTrim]?.code || parentNode.code || selectedTaxonomy.code || getDomainCode(dTrim),
          chapters: [
            ...(tax[dTrim]?.chapters || []).filter((chapter) => chapter.name.toLowerCase() !== cTrim.toLowerCase()),
            { name: genericNode.name, code: genericNode.code || chapCode, lessons: [] },
          ],
        },
      }
      _taxonomyCache = nextTaxonomy
      this._notifyTaxonomyListeners()
      return
    }
    const tax = this.getTaxonomy()
    if (!tax[dTrim]) {
      tax[dTrim] = { unitLabel: `Unit: ${dTrim}`, code: getDomainCode(dTrim), chapters: [] }
    }
    const exists = tax[dTrim].chapters.some((c) => c.name.toLowerCase() === cTrim.toLowerCase())
    if (exists) return

    const chapCode = code || `${tax[dTrim].code || 'CH'}.${tax[dTrim].chapters.length + 1}`
    tax[dTrim].chapters.push({
      name: cTrim,
      code: chapCode,
      lessons: [],
    })
    _taxonomyCache = { ...tax }
    this._notifyTaxonomyListeners()

    if (isSupabaseConfigured) {
      // A. Write to 'taxonomy' table
      try {
        const catId = _supabaseDomainIdMap.get(dTrim.toLowerCase())
        await safeInsertTaxonomyTable('taxonomy', {
          domain: dTrim,
          chapter: cTrim,
          name: cTrim,
          code: chapCode,
          type: 'chapter',
          parent_id: catId || null,
        })
      } catch {}

      // B. Write to 'chapters' table
      try {
        let catId = _supabaseDomainIdMap.get(dTrim.toLowerCase())
        if (!catId) {
          const { data: cData } = await supabase.from('categories').select('id').ilike('name', `%${dTrim}%`).limit(1).maybeSingle()
          if (cData?.id) catId = cData.id
        }

        if (catId) {
          const { data: insChap } = await supabase
            .from('chapters')
            .insert({
              name: cTrim,
              category_id: catId,
              description: chapCode,
              is_active: true,
            })
            .select('id')
            .maybeSingle()

          if (insChap?.id) {
            _supabaseChapterIdMap.set(`${catId}::${cTrim.toLowerCase()}`, insChap.id)
          }
        }
      } catch (err) {
        console.warn('[Supabase Taxonomy] Notice inserting chapter:', err)
      }

      // C. Update curriculum_taxonomy
      try {
        await supabase.from('curriculum_taxonomy').upsert({ id: 'current', data: JSON.stringify(_taxonomyCache) })
      } catch {}
    }
  },

  async updateChapter(domainName: string, oldChapterName: string, newChapterName: string, code?: string, taxonomyId?: string): Promise<void> {
    const dTrim = domainName.trim()
    const oldTrim = oldChapterName.trim()
    const newTrim = newChapterName.trim()

    if (taxonomyId) {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
      const nodes = await fetchGenericTaxonomyNodes(taxonomyId)
      const domainNode = nodes.find((n) => n.parentId === null && n.name.toLowerCase() === dTrim.toLowerCase())
      if (!domainNode) throw new Error(`The selected domain "${dTrim}" was not found in the selected taxonomy.`)
      const node = nodes.find((n) => n.parentId === domainNode.id && n.name.toLowerCase() === oldTrim.toLowerCase())
      if (!node) throw new Error(`The selected chapter "${oldTrim}" was not found under the selected domain.`)
      const updates: any = { name: newTrim }
      if (code !== undefined) updates.code = code || null
      const { error } = await supabase.from('taxonomy_nodes').update(updates).eq('id', node.id).eq('taxonomy_id', taxonomyId)
      if (error) throw error
      const tax = this.getTaxonomy()
      const domain = tax[dTrim]
      const chap = domain?.chapters.find((c) => c.name.toLowerCase() === oldTrim.toLowerCase())
      if (chap) {
        chap.name = newTrim
        if (code !== undefined) chap.code = code || undefined
        _taxonomyCache = { ...tax }
        this._notifyTaxonomyListeners()
      }
      const questions = this.getStoredQuestions()
      this.saveQuestions(questions.map((q) => q.domain === dTrim && q.chapter === oldTrim ? { ...q, chapter: newTrim } : q))
      return
    }
    const tax = this.getTaxonomy()
    if (!tax[dTrim]) return
    const chap = tax[dTrim].chapters.find((c) => c.name.toLowerCase() === oldTrim.toLowerCase())
    if (!chap) return

    chap.name = newTrim
    if (code) chap.code = code
    _taxonomyCache = { ...tax }
    this._notifyTaxonomyListeners()

    const questions = this.getStoredQuestions()
    const updated = questions.map((q) =>
      q.domain === dTrim && q.chapter === oldTrim ? { ...q, chapter: newTrim } : q
    )
    this.saveQuestions(updated)

    if (isSupabaseConfigured) {
      try {
        await supabase.from('taxonomy').update({ chapter: newTrim, name: newTrim, code: code || chap.code }).ilike('domain', dTrim).ilike('chapter', oldTrim)
      } catch {}

      try {
        const catId = _supabaseDomainIdMap.get(dTrim.toLowerCase())
        if (catId) {
          const chapId = _supabaseChapterIdMap.get(`${catId}::${oldTrim.toLowerCase()}`)
          const updates: any = { name: newTrim }
          if (code) updates.description = code

          if (chapId) {
            await supabase.from('chapters').update(updates).eq('id', chapId)
            _supabaseChapterIdMap.delete(`${catId}::${oldTrim.toLowerCase()}`)
            _supabaseChapterIdMap.set(`${catId}::${newTrim.toLowerCase()}`, chapId)
          } else {
            await supabase.from('chapters').update(updates).eq('category_id', catId).ilike('name', oldTrim)
          }
        }
      } catch (err) {
        console.warn('[Supabase Taxonomy] Notice updating chapter:', err)
      }

      try {
        await supabase.from('curriculum_taxonomy').upsert({ id: 'current', data: JSON.stringify(_taxonomyCache) })
      } catch {}
    }
  },

  async moveChapter(fromDomain: string, toDomain: string, chapterName: string, newChapterName?: string, code?: string, taxonomyId?: string): Promise<void> {
    if (taxonomyId) {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
      const nodes = await fetchGenericTaxonomyNodes(taxonomyId)
      const src = nodes.find((n) => n.parentId === null && n.name.toLowerCase() === fromDomain.trim().toLowerCase())
      const dst = nodes.find((n) => n.parentId === null && n.name.toLowerCase() === toDomain.trim().toLowerCase())
      if (!src || !dst) throw new Error('The source or destination domain was not found in the selected taxonomy.')
      const node = nodes.find((n) => n.parentId === src.id && n.name.toLowerCase() === chapterName.trim().toLowerCase())
      if (!node) throw new Error(`The selected chapter "${chapterName.trim()}" was not found under the source domain.`)
      const finalName = newChapterName?.trim() || node.name
      const updates: any = { parent_id: dst.id, name: finalName }
      if (code !== undefined) updates.code = code || null
      const { error } = await supabase.from('taxonomy_nodes').update(updates).eq('id', node.id).eq('taxonomy_id', taxonomyId)
      if (error) throw error
      const tax = this.getTaxonomy()
      const srcDomain = tax[fromDomain]
      const dstDomain = tax[toDomain]
      const chap = srcDomain?.chapters.find((c) => c.name.toLowerCase() === chapterName.trim().toLowerCase())
      if (chap && srcDomain && dstDomain) {
        srcDomain.chapters = srcDomain.chapters.filter((c) => c !== chap)
        chap.name = finalName
        if (code !== undefined) chap.code = code || undefined
        dstDomain.chapters.push(chap)
        _taxonomyCache = { ...tax }
        this._notifyTaxonomyListeners()
      }
      const questions = this.getStoredQuestions()
      this.saveQuestions(questions.map((q) => q.domain === fromDomain && q.chapter === chapterName ? { ...q, domain: toDomain, chapter: finalName } : q))
      return
    }

    const tax = this.getTaxonomy()
    if (!tax[fromDomain] || !tax[toDomain]) return
    const chapIndex = tax[fromDomain].chapters.findIndex((c) => c.name.toLowerCase() === chapterName.toLowerCase())
    if (chapIndex === -1) return

    const [chap] = tax[fromDomain].chapters.splice(chapIndex, 1)
    const finalName = newChapterName?.trim() || chap.name
    chap.name = finalName
    if (code) chap.code = code
    else chap.code = `${tax[toDomain].code || 'CH'}.${tax[toDomain].chapters.length + 1}`

    tax[toDomain].chapters.push(chap)
    _taxonomyCache = { ...tax }
    this._notifyTaxonomyListeners()

    const questions = this.getStoredQuestions()
    const updated = questions.map((q) =>
      q.domain === fromDomain && q.chapter === chapterName
        ? { ...q, domain: toDomain, chapter: finalName }
        : q
    )
    this.saveQuestions(updated)

    if (isSupabaseConfigured) {
      try {
        await supabase.from('taxonomy').update({ domain: toDomain, chapter: finalName, name: finalName }).ilike('domain', fromDomain).ilike('chapter', chapterName)
      } catch {}

      try {
        const srcCatId = _supabaseDomainIdMap.get(fromDomain.toLowerCase())
        const dstCatId = _supabaseDomainIdMap.get(toDomain.toLowerCase())
        if (srcCatId && dstCatId) {
          const chapId = _supabaseChapterIdMap.get(`${srcCatId}::${chapterName.toLowerCase()}`)
          if (chapId) {
            await supabase.from('chapters').update({ category_id: dstCatId, name: finalName }).eq('id', chapId)
            _supabaseChapterIdMap.delete(`${srcCatId}::${chapterName.toLowerCase()}`)
            _supabaseChapterIdMap.set(`${dstCatId}::${finalName.toLowerCase()}`, chapId)
          }
        }
      } catch (err) {
        console.warn('[Supabase Taxonomy] Notice moving chapter in Supabase:', err)
      }

      try {
        await supabase.from('curriculum_taxonomy').upsert({ id: 'current', data: JSON.stringify(_taxonomyCache) })
      } catch {}
    }
  },

  async deleteChapter(domainName: string, chapterName: string, deleteLinkedQuestions: boolean = false): Promise<void> {
    const tax = this.getTaxonomy()
    const dTrim = domainName.trim()
    const cTrim = chapterName.trim()
    const matchDKey = Object.keys(tax).find((k) => k.trim().toLowerCase() === dTrim.toLowerCase()) || dTrim
    if (!tax[matchDKey]) return

    // Cascading delete: deleting chapter removes chapter and all its child lessons
    tax[matchDKey].chapters = tax[matchDKey].chapters.filter(
      (c) => (c.name || '').trim().toLowerCase() !== cTrim.toLowerCase()
    )
    _taxonomyCache = { ...tax }
    this._notifyTaxonomyListeners()

    // 1. Update in-memory questions cache according to user's question choice
    if (deleteLinkedQuestions) {
      _questionsCache = _questionsCache.filter(
        (q) =>
          !(
            (q.domain || '').trim().toLowerCase() === dTrim.toLowerCase() &&
            (q.chapter || '').trim().toLowerCase() === cTrim.toLowerCase()
          )
      )
    } else {
      _questionsCache = _questionsCache.map((q) =>
        (q.domain || '').trim().toLowerCase() === dTrim.toLowerCase() &&
        (q.chapter || '').trim().toLowerCase() === cTrim.toLowerCase()
          ? { ...q, chapter: '', lesson: '' }
          : q
      )
    }

    // Supabase cascading deletion
    if (isSupabaseConfigured) {
      try {
        await supabase.from('taxonomy').delete().ilike('domain', dTrim).ilike('chapter', cTrim)
      } catch {}

      try {
        const catId = _supabaseDomainIdMap.get(dTrim.toLowerCase())
        if (catId) {
          const chapId = _supabaseChapterIdMap.get(`${catId}::${cTrim.toLowerCase()}`)
          if (chapId) {
            await supabase.from('lessons').delete().eq('chapter_id', chapId)
            await supabase.from('chapters').delete().eq('id', chapId)
            _supabaseChapterIdMap.delete(`${catId}::${cTrim.toLowerCase()}`)
          } else {
            await supabase.from('chapters').delete().eq('category_id', catId).ilike('name', cTrim)
          }
        }
      } catch (err) {
        console.warn('[Supabase Taxonomy] Notice deleting chapter:', err)
      }

      try {
        await supabase.from('curriculum_taxonomy').upsert({ id: 'current', data: JSON.stringify(_taxonomyCache) })
      } catch {}

      try {
        if (deleteLinkedQuestions) {
          await supabase.from('questions').delete().ilike('domain', dTrim).ilike('chapter', cTrim)
        } else {
          await supabase.from('questions').update({ chapter: '', lesson: '' }).ilike('domain', dTrim).ilike('chapter', cTrim)
        }
      } catch {}
    }
  },

  async addLesson(domainName: string, chapterName: string, lessonName: string, taxonomyId?: string): Promise<void> {
    const dTrim = domainName.trim()
    const cTrim = chapterName.trim()
    const lTrim = lessonName.trim()
    if (!dTrim || !cTrim || !lTrim) return

    // Generic taxonomy path: create the lesson as a child taxonomy node.
    // The legacy registry below remains as a compatibility projection only.
    if (taxonomyId) {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase is not configured.')
      }

      const nodes = await fetchGenericTaxonomyNodes(taxonomyId)
      const domainNode = nodes.find(
        (node) => node.parentId === null && node.name.toLowerCase() === dTrim.toLowerCase()
      )

      if (!domainNode) {
        throw new Error(`The selected domain \"${dTrim}\" was not found in the selected taxonomy.`)
      }

      const chapterNode = nodes.find(
        (node) => node.parentId === domainNode.id && node.name.toLowerCase() === cTrim.toLowerCase()
      )

      if (!chapterNode) {
        throw new Error(`The selected chapter \"${cTrim}\" was not found under the selected domain.`)
      }

      await getOrCreateGenericTaxonomyNode(
        taxonomyId,
        lTrim,
        chapterNode.id,
        {
          sortOrder: nodes.filter((node) => node.parentId === chapterNode.id).length,
        }
      )

      // Keep the existing in-memory registry synchronized for legacy consumers.
      const tax = this.getTaxonomy()
      if (!tax[dTrim]) {
        tax[dTrim] = { unitLabel: `Unit: ${dTrim}`, code: getDomainCode(dTrim), chapters: [] }
      }
      let chap = tax[dTrim].chapters.find((c) => c.name.toLowerCase() === cTrim.toLowerCase())
      if (!chap) {
        chap = { name: cTrim, code: chapterNode.code || `${tax[dTrim].code || 'CH'}.1`, lessons: [] }
        tax[dTrim].chapters.push(chap)
      }
      if (!chap.lessons.some((lesson) => lesson.toLowerCase() === lTrim.toLowerCase())) {
        chap.lessons.push(lTrim)
      }
      _taxonomyCache = { ...tax }
      this._notifyTaxonomyListeners()
      return
    }

    const tax = this.getTaxonomy()
    if (!tax[dTrim]) {
      tax[dTrim] = { unitLabel: `Unit: ${dTrim}`, code: getDomainCode(dTrim), chapters: [] }
    }
    let chap = tax[dTrim].chapters.find((c) => c.name.toLowerCase() === cTrim.toLowerCase())
    if (!chap) {
      const chapCode = `${tax[dTrim].code || 'CH'}.${tax[dTrim].chapters.length + 1}`
      chap = { name: cTrim, code: chapCode, lessons: [] }
      tax[dTrim].chapters.push(chap)
    }
    if (chap.lessons.some((l) => l.toLowerCase() === lTrim.toLowerCase())) return

    chap.lessons.push(lTrim)
    _taxonomyCache = { ...tax }
    this._notifyTaxonomyListeners()

    if (isSupabaseConfigured) {
      // A. Write to 'taxonomy' table
      try {
        const catId = _supabaseDomainIdMap.get(dTrim.toLowerCase())
        const chapId = catId ? _supabaseChapterIdMap.get(`${catId}::${cTrim.toLowerCase()}`) : null
        await safeInsertTaxonomyTable('taxonomy', {
          domain: dTrim,
          chapter: cTrim,
          lesson: lTrim,
          name: lTrim,
          type: 'lesson',
          parent_id: chapId || null,
        })
      } catch {}

      // B. Write to 'lessons' table
      try {
        const catId = _supabaseDomainIdMap.get(dTrim.toLowerCase())
        if (catId) {
          const chapId = _supabaseChapterIdMap.get(`${catId}::${cTrim.toLowerCase()}`)
          if (chapId) {
            const { data: insLs } = await supabase
              .from('lessons')
              .insert({
                name: lTrim,
                chapter_id: chapId,
                is_active: true,
              })
              .select('id')
              .maybeSingle()

            if (insLs?.id) {
              _supabaseLessonIdMap.set(`${chapId}::${lTrim.toLowerCase()}`, insLs.id)
            }
          }
        }
      } catch (err) {
        console.warn('[Supabase Taxonomy] Notice inserting lesson:', err)
      }

      // C. Update curriculum_taxonomy
      try {
        await supabase.from('curriculum_taxonomy').upsert({ id: 'current', data: JSON.stringify(_taxonomyCache) })
      } catch {}
    }
  },

  async updateLesson(domainName: string, chapterName: string, oldLessonName: string, newLessonName: string, taxonomyId?: string): Promise<void> {
    const dTrim = domainName.trim()
    const cTrim = chapterName.trim()
    const oldTrim = oldLessonName.trim()
    const newTrim = newLessonName.trim()

    if (taxonomyId) {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
      const nodes = await fetchGenericTaxonomyNodes(taxonomyId)
      const domainNode = nodes.find((n) => n.parentId === null && n.name.toLowerCase() === dTrim.toLowerCase())
      if (!domainNode) throw new Error(`The selected domain "${dTrim}" was not found in the selected taxonomy.`)
      const chapterNode = nodes.find((n) => n.parentId === domainNode.id && n.name.toLowerCase() === cTrim.toLowerCase())
      if (!chapterNode) throw new Error(`The selected chapter "${cTrim}" was not found under the selected domain.`)
      const node = nodes.find((n) => n.parentId === chapterNode.id && n.name.toLowerCase() === oldTrim.toLowerCase())
      if (!node) throw new Error(`The selected lesson "${oldTrim}" was not found under the selected chapter.`)
      const { error } = await supabase.from('taxonomy_nodes').update({ name: newTrim }).eq('id', node.id).eq('taxonomy_id', taxonomyId)
      if (error) throw error
      const tax = this.getTaxonomy()
      const chap = tax[dTrim]?.chapters.find((c) => c.name.toLowerCase() === cTrim.toLowerCase())
      if (chap) {
        chap.lessons = chap.lessons.map((lesson) => lesson.toLowerCase() === oldTrim.toLowerCase() ? newTrim : lesson)
        _taxonomyCache = { ...tax }
        this._notifyTaxonomyListeners()
      }
      const questions = this.getStoredQuestions()
      this.saveQuestions(questions.map((q) => q.domain === dTrim && q.chapter === cTrim && q.lesson === oldTrim ? { ...q, lesson: newTrim } : q))
      return
    }
    const tax = this.getTaxonomy()
    if (!tax[dTrim]) return
    const chap = tax[dTrim].chapters.find((c) => c.name.toLowerCase() === cTrim.toLowerCase())
    if (!chap) return

    const idx = chap.lessons.findIndex((l) => l.toLowerCase() === oldTrim.toLowerCase())
    if (idx === -1) return
    chap.lessons[idx] = newTrim
    _taxonomyCache = { ...tax }
    this._notifyTaxonomyListeners()

    const questions = this.getStoredQuestions()
    const updated = questions.map((q) =>
      q.domain === dTrim && q.chapter === cTrim && q.lesson === oldTrim
        ? { ...q, lesson: newTrim }
        : q
    )
    this.saveQuestions(updated)

    if (isSupabaseConfigured) {
      try {
        await supabase.from('taxonomy').update({ lesson: newTrim, name: newTrim }).ilike('domain', dTrim).ilike('chapter', cTrim).ilike('lesson', oldTrim)
      } catch {}

      try {
        const catId = _supabaseDomainIdMap.get(dTrim.toLowerCase())
        if (catId) {
          const chapId = _supabaseChapterIdMap.get(`${catId}::${cTrim.toLowerCase()}`)
          if (chapId) {
            const lessonId = _supabaseLessonIdMap.get(`${chapId}::${oldTrim.toLowerCase()}`)
            if (lessonId) {
              await supabase.from('lessons').update({ name: newTrim }).eq('id', lessonId)
              _supabaseLessonIdMap.delete(`${chapId}::${oldTrim.toLowerCase()}`)
              _supabaseLessonIdMap.set(`${chapId}::${newTrim.toLowerCase()}`, lessonId)
            } else {
              await supabase.from('lessons').update({ name: newTrim }).eq('chapter_id', chapId).ilike('name', oldTrim)
            }
          }
        }
      } catch (err) {
        console.warn('[Supabase Taxonomy] Notice updating lesson:', err)
      }

      try {
        await supabase.from('curriculum_taxonomy').upsert({ id: 'current', data: JSON.stringify(_taxonomyCache) })
      } catch {}
    }
  },

  async moveLesson(fromDomain: string, fromChapter: string, toDomain: string, toChapter: string, oldLessonName: string, newLessonName?: string, taxonomyId?: string): Promise<void> {
    if (taxonomyId) {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
      const nodes = await fetchGenericTaxonomyNodes(taxonomyId)
      const srcDomain = nodes.find((n) => n.parentId === null && n.name.toLowerCase() === fromDomain.trim().toLowerCase())
      const dstDomain = nodes.find((n) => n.parentId === null && n.name.toLowerCase() === toDomain.trim().toLowerCase())
      if (!srcDomain || !dstDomain) throw new Error('The source or destination domain was not found in the selected taxonomy.')
      const srcChapter = nodes.find((n) => n.parentId === srcDomain.id && n.name.toLowerCase() === fromChapter.trim().toLowerCase())
      const dstChapter = nodes.find((n) => n.parentId === dstDomain.id && n.name.toLowerCase() === toChapter.trim().toLowerCase())
      if (!srcChapter || !dstChapter) throw new Error('The source or destination chapter was not found in the selected taxonomy.')
      const node = nodes.find((n) => n.parentId === srcChapter.id && n.name.toLowerCase() === oldLessonName.trim().toLowerCase())
      if (!node) throw new Error(`The selected lesson "${oldLessonName.trim()}" was not found under the source chapter.`)
      const finalName = newLessonName?.trim() || node.name
      const { error } = await supabase.from('taxonomy_nodes').update({ parent_id: dstChapter.id, name: finalName }).eq('id', node.id).eq('taxonomy_id', taxonomyId)
      if (error) throw error
      const tax = this.getTaxonomy()
      const src = tax[fromDomain]?.chapters.find((c) => c.name.toLowerCase() === fromChapter.trim().toLowerCase())
      const dst = tax[toDomain]?.chapters.find((c) => c.name.toLowerCase() === toChapter.trim().toLowerCase())
      if (src && dst) {
        src.lessons = src.lessons.filter((l) => l.toLowerCase() !== oldLessonName.trim().toLowerCase())
        if (!dst.lessons.some((l) => l.toLowerCase() === finalName.toLowerCase())) dst.lessons.push(finalName)
        _taxonomyCache = { ...tax }
        this._notifyTaxonomyListeners()
      }
      const questions = this.getStoredQuestions()
      this.saveQuestions(questions.map((q) => q.domain === fromDomain && q.chapter === fromChapter && q.lesson === oldLessonName ? { ...q, domain: toDomain, chapter: toChapter, lesson: finalName } : q))
      return
    }

    const tax = this.getTaxonomy()
    if (!tax[fromDomain] || !tax[toDomain]) return
    const srcChapter = tax[fromDomain].chapters.find((c) => c.name === fromChapter)
    const dstChapter = tax[toDomain].chapters.find((c) => c.name === toChapter)
    if (!srcChapter || !dstChapter) return

    srcChapter.lessons = srcChapter.lessons.filter((l) => l !== oldLessonName)
    const finalLesson = newLessonName?.trim() || oldLessonName
    if (!dstChapter.lessons.includes(finalLesson)) {
      dstChapter.lessons.push(finalLesson)
    }
    _taxonomyCache = { ...tax }
    this._notifyTaxonomyListeners()

    const questions = this.getStoredQuestions()
    const updated = questions.map((q) =>
      q.domain === fromDomain && q.chapter === fromChapter && q.lesson === oldLessonName
        ? { ...q, domain: toDomain, chapter: toChapter, lesson: finalLesson }
        : q
    )
    this.saveQuestions(updated)

    if (isSupabaseConfigured) {
      try {
        await supabase.from('taxonomy').update({ domain: toDomain, chapter: toChapter, lesson: finalLesson, name: finalLesson }).ilike('domain', fromDomain).ilike('chapter', fromChapter).ilike('lesson', oldLessonName)
      } catch {}

      try {
        const srcCatId = _supabaseDomainIdMap.get(fromDomain.toLowerCase())
        const dstCatId = _supabaseDomainIdMap.get(toDomain.toLowerCase())
        if (srcCatId && dstCatId) {
          const srcChapId = _supabaseChapterIdMap.get(`${srcCatId}::${fromChapter.toLowerCase()}`)
          const dstChapId = _supabaseChapterIdMap.get(`${dstCatId}::${toChapter.toLowerCase()}`)
          if (srcChapId && dstChapId) {
            await supabase
              .from('lessons')
              .update({ chapter_id: dstChapId, name: finalLesson })
              .eq('chapter_id', srcChapId)
              .ilike('name', oldLessonName)
          }
        }
      } catch (err) {
        console.warn('[Supabase Taxonomy] Exception moving lesson:', err)
      }

      try {
        await supabase.from('curriculum_taxonomy').upsert({ id: 'current', data: JSON.stringify(_taxonomyCache) })
      } catch {}
    }
  },

  async deleteLesson(domainName: string, chapterName: string, lessonName: string, deleteLinkedQuestions: boolean = false): Promise<void> {
    const tax = this.getTaxonomy()
    const dTrim = domainName.trim()
    const cTrim = chapterName.trim()
    const lTrim = lessonName.trim()

    const dKey = Object.keys(tax).find((k) => k.trim().toLowerCase() === dTrim.toLowerCase())
    if (!dKey) return
    const chapter = tax[dKey].chapters.find((c) => c.name.trim().toLowerCase() === cTrim.toLowerCase())
    if (!chapter) return
    chapter.lessons = chapter.lessons.filter((l) => l.trim().toLowerCase() !== lTrim.toLowerCase())
    _taxonomyCache = { ...tax }
    this._notifyTaxonomyListeners()

    // 1. Update in-memory questions cache according to user's question choice
    if (deleteLinkedQuestions) {
      _questionsCache = _questionsCache.filter(
        (q) =>
          !(
            (q.domain || '').trim().toLowerCase() === dTrim.toLowerCase() &&
            (q.chapter || '').trim().toLowerCase() === cTrim.toLowerCase() &&
            (q.lesson || '').trim().toLowerCase() === lTrim.toLowerCase()
          )
      )
    } else {
      _questionsCache = _questionsCache.map((q) =>
        (q.domain || '').trim().toLowerCase() === dTrim.toLowerCase() &&
        (q.chapter || '').trim().toLowerCase() === cTrim.toLowerCase() &&
        (q.lesson || '').trim().toLowerCase() === lTrim.toLowerCase()
          ? { ...q, lesson: '' }
          : q
      )
    }

    // Supabase deletion
    if (isSupabaseConfigured) {
      try {
        await supabase.from('taxonomy').delete().ilike('domain', dTrim).ilike('chapter', cTrim).ilike('lesson', lTrim)
      } catch {}

      try {
        const catId = _supabaseDomainIdMap.get(dTrim.toLowerCase())
        if (catId) {
          const chapId = _supabaseChapterIdMap.get(`${catId}::${cTrim.toLowerCase()}`)
          if (chapId) {
            await supabase.from('lessons').delete().eq('chapter_id', chapId).ilike('name', lTrim)
          }
        }
      } catch (err) {
        console.warn('[Supabase Taxonomy] Exception deleting lesson:', err)
      }

      try {
        await supabase.from('curriculum_taxonomy').upsert({ id: 'current', data: JSON.stringify(_taxonomyCache) })
      } catch {}

      try {
        if (deleteLinkedQuestions) {
          await supabase.from('questions').delete().ilike('domain', dTrim).ilike('chapter', cTrim).ilike('lesson', lTrim)
        } else {
          await supabase.from('questions').update({ lesson: '' }).ilike('domain', dTrim).ilike('chapter', cTrim).ilike('lesson', lTrim)
        }
      } catch {}
    }
  },

  /**
   * Bulk synchronizes all defined domains, chapters, and lessons from cache into Supabase tables
   */
  async syncAllTaxonomyToSupabase(): Promise<{ domainsCount: number; chaptersCount: number; lessonsCount: number }> {
    if (!isSupabaseConfigured) {
      return { domainsCount: 0, chaptersCount: 0, lessonsCount: 0 }
    }

    let domainsCount = 0
    let chaptersCount = 0
    let lessonsCount = 0

    try {
      const currentTax = _taxonomyCache || {}

      // 1. Sync directly to 'taxonomy' table in Supabase
      try {
        for (const domainName of Object.keys(currentTax)) {
          const dData = currentTax[domainName]
          const normDom = domainName.trim()
          const finalUnit = dData.unitLabel || `Unit: ${normDom}`
          const finalCode = dData.code || getDomainCode(normDom)

          if (dData.chapters && dData.chapters.length > 0) {
            for (const chap of dData.chapters) {
              const chapName = chap.name.trim()
              const chapCode = chap.code || `${finalCode}.1`

              if (chap.lessons && chap.lessons.length > 0) {
                for (const lName of chap.lessons) {
                  const lessonName = typeof lName === 'string' ? lName.trim() : (lName as any).name?.trim()
                  if (!lessonName) continue

                  await safeInsertTaxonomyTable('taxonomy', {
                    domain: normDom,
                    name: lessonName,
                    chapter: chapName,
                    lesson: lessonName,
                    unit_label: finalUnit,
                    code: chapCode,
                    type: 'lesson',
                  })
                  lessonsCount++
                }
              } else {
                await safeInsertTaxonomyTable('taxonomy', {
                  domain: normDom,
                  name: chapName,
                  chapter: chapName,
                  unit_label: finalUnit,
                  code: chapCode,
                  type: 'chapter',
                })
                chaptersCount++
              }
            }
          } else {
            await safeInsertTaxonomyTable('taxonomy', {
              domain: normDom,
              name: normDom,
              unit_label: finalUnit,
              code: finalCode,
              type: 'domain',
            })
          }
          domainsCount++
        }
      } catch (e) {
        console.warn('[Supabase Taxonomy] Notice syncing to taxonomy table:', e)
      }

      // 2. Sync to 'curriculum_taxonomy' document table
      try {
        await supabase.from('curriculum_taxonomy').upsert({ id: 'current', data: JSON.stringify(currentTax) })
      } catch {}

      // 3. Sync to relational categories, chapters, lessons tables
      try {
        let subjectId: string | null = null
        const { data: sub } = await supabase.from('subjects').select('id').limit(1).maybeSingle()
        if (sub?.id) subjectId = sub.id

        for (const domainName of Object.keys(currentTax)) {
          const dData = currentTax[domainName]
          const normDom = domainName.trim()

          let catId = _supabaseDomainIdMap.get(normDom.toLowerCase())
          if (!catId) {
            const { data: existingCat } = await supabase.from('categories').select('id').ilike('name', normDom).limit(1).maybeSingle()
            if (existingCat?.id) {
              catId = existingCat.id
            } else {
              const payload: any = {
                name: normDom,
                description: JSON.stringify({ unitLabel: dData.unitLabel || `Unit: ${normDom}`, code: dData.code || getDomainCode(normDom) }),
                is_active: true,
              }
              if (subjectId) payload.subject_id = subjectId
              const { data: insCat } = await supabase.from('categories').insert(payload).select('id').maybeSingle()
              if (insCat?.id) catId = insCat.id
            }
          }

          if (catId) {
            _supabaseDomainIdMap.set(normDom.toLowerCase(), catId)

            for (const chap of dData.chapters || []) {
              const chapName = chap.name.trim()
              let chapId = _supabaseChapterIdMap.get(`${catId}::${chapName.toLowerCase()}`)
              if (!chapId) {
                const { data: exChap } = await supabase.from('chapters').select('id').eq('category_id', catId).ilike('name', chapName).limit(1).maybeSingle()
                if (exChap?.id) {
                  chapId = exChap.id
                } else {
                  const { data: insChap } = await supabase.from('chapters').insert({
                    name: chapName,
                    category_id: catId,
                    description: chap.code || null,
                    is_active: true,
                  }).select('id').maybeSingle()
                  if (insChap?.id) chapId = insChap.id
                }
              }

              if (chapId) {
                _supabaseChapterIdMap.set(`${catId}::${chapName.toLowerCase()}`, chapId)

                for (const lName of chap.lessons || []) {
                  const lessonName = typeof lName === 'string' ? lName.trim() : (lName as any).name?.trim()
                  if (!lessonName) continue

                  let lessonId = _supabaseLessonIdMap.get(`${chapId}::${lessonName.toLowerCase()}`)
                  if (!lessonId) {
                    const { data: exLs } = await supabase.from('lessons').select('id').eq('chapter_id', chapId).ilike('name', lessonName).limit(1).maybeSingle()
                    if (exLs?.id) {
                      lessonId = exLs.id
                    } else {
                      const { data: insLs } = await supabase.from('lessons').insert({
                        name: lessonName,
                        chapter_id: chapId,
                        is_active: true,
                      }).select('id').maybeSingle()
                      if (insLs?.id) lessonId = insLs.id
                    }
                  }
                  if (lessonId) {
                    _supabaseLessonIdMap.set(`${chapId}::${lessonName.toLowerCase()}`, lessonId)
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('[Supabase Taxonomy] Notice syncing relational categories:', err)
      }
    } catch (err) {
      console.warn('[Supabase Taxonomy] Error in syncAllTaxonomyToSupabase:', err)
    }

    return { domainsCount, chaptersCount, lessonsCount }
  },
  getQuestionsForTaxonomy(domain?: string, chapter?: string, lesson?: string): QuestionBankItem[] {
    const questions = this.getStoredQuestions()
    return questions.filter((q) => {
      if (domain && q.domain !== domain) return false
      if (chapter && q.chapter !== chapter) return false
      if (lesson && q.lesson !== lesson) return false
      return true
    })
  },

  async fetchCollectionsFromDatabase(): Promise<QuestionCollection[]> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.')
    }

    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    const userId = authData.user?.id
    if (!userId) throw new Error('You must be signed in to load collections.')

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', userId)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile?.organization_id) throw new Error('Your account is not assigned to an organization.')
    if (!['admin', 'teacher'].includes(String(profile.role || '').toLowerCase())) {
      throw new Error('You do not have permission to manage question collections.')
    }

    const { data, error } = await supabase
      .from('question_bank_collections')
      .select('name_key, data, created_at, updated_at')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: true })
    if (error) throw error

    _collectionsCache = (data || []).map((row: any) => {
      const stored = row.data && typeof row.data === 'object' ? row.data : {}
      const name = String(stored.name || row.name_key || '').trim()
      return {
        ...stored,
        name,
        description: stored.description ?? '',
        targetExam: stored.targetExam ?? 'EST 1 / SAT Math',
        colorTag: stored.colorTag ?? 'blue',
        questionCount: Number(stored.questionCount ?? 0),
        parentName: typeof stored.parentName === 'string' ? stored.parentName : null,
        createdAt: stored.createdAt ?? row.created_at,
        updatedAt: stored.updatedAt ?? row.updated_at,
      } as QuestionCollection
    }).filter((collection: QuestionCollection) => collection.name.length > 0)

    _hasLoadedCollections = true
    return _collectionsCache
  },

  getStoredCollections(): QuestionCollection[] {
    if (!_hasLoadedCollections && typeof window !== 'undefined') {
      void this.fetchCollectionsFromDatabase().catch((error) => {
        console.error('Failed to fetch collections from Supabase:', error)
      })
    }
    return _collectionsCache
  },

  saveStoredCollections(collections: QuestionCollection[]): void {
    void this.persistCollections(collections).catch((error) => {
      console.error('Failed to save collections to Supabase:', error)
    })
  },

  async persistCollections(collections: QuestionCollection[], changedNames?: ReadonlySet<string>): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')

    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    const userId = authData.user?.id
    if (!userId) throw new Error('You must be signed in to save collections.')

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', userId)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile?.organization_id) throw new Error('Your account is not assigned to an organization.')
    if (!['admin', 'teacher'].includes(String(profile.role || '').toLowerCase())) {
      throw new Error('You do not have permission to manage question collections.')
    }

    // Upsert each supplied collection. Do not delete rows omitted from this array:
    // a stale client cache must never erase collections that already exist in Supabase.
    for (const collection of collections) {
      const name = String(collection.name || '').trim()
      if (changedNames && !changedNames.has(name.toLowerCase())) continue
      if (!name) throw new Error('Collection name cannot be empty.')
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('question_bank_collections')
        .upsert({
          organization_id: profile.organization_id,
          name_key: name.toLowerCase(),
          data: { ...collection, name, updatedAt: now },
          updated_at: now,
        }, { onConflict: 'organization_id,name_key' })
      if (error) throw error
    }

    _collectionsCache = collections
    _hasLoadedCollections = true
  },

  async createCollectionAndPersist(name: string, description: string = '', targetExam: string = 'EST 1 / SAT Math', colorTag: string = 'blue', parentName: string | null = null): Promise<{ success: boolean; error?: string; collection?: QuestionCollection }> {
    try {
      // Refresh the authoritative list before validating a parent chosen in the UI.
      // The explorer can also show virtual collections inferred from question data
      // (particularly "General Question Bank") before they have a collections row.
      await this.fetchCollectionsFromDatabase()
      const requestedParent = parentName?.trim() || null
      let resolvedParent = requestedParent
        ? _collectionsCache.find(c => c.name.toLowerCase() === requestedParent.toLowerCase()) || null
        : null
      if (requestedParent && !resolvedParent) {
        // Only materialize a virtual folder that is backed by actual questions;
        // never silently create an arbitrary stale or mistyped parent.
        const inferredParent = this.getCollectionsList().find(c =>
          c.name.toLowerCase() === requestedParent.toLowerCase() && c.id?.startsWith('col-auto-') === true
        )
        if (!inferredParent) {
          return { success: false, error: 'This parent folder is no longer available. Refresh Question Bank and choose another folder.' }
        }
        resolvedParent = {
          ...inferredParent,
          parentName: null,
          updatedAt: new Date().toISOString(),
        }
      }
      const result = this.createCollection(name, description, targetExam, colorTag)
      if (!result.success || !result.collection) return result
      result.collection.parentName = resolvedParent?.name || null
      // Persist the missing virtual parent and the new child together. This
      // retains the questions under their existing collection names.
      const updated = [
        ..._collectionsCache,
        ...(resolvedParent && !_collectionsCache.some(c => c.name.toLowerCase() === resolvedParent.name.toLowerCase()) ? [resolvedParent] : []),
        result.collection,
      ]
      await this.persistCollections(updated)
      return result
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to save collection to the database.' }
    }
  },

  async updateCollectionAndPersist(oldName: string, updatedData: { name: string; description?: string; targetExam?: string; colorTag?: string; parentName?: string | null }) {
    try {
      // Fetch fresh metadata before validating names; cached collections may
      // be stale when another tab/user created a folder after page load.
      await this.fetchCollectionsFromDatabase()
      const newName = updatedData.name.trim()
      if (!newName) return { success: false, error: 'Collection name cannot be empty.' }

      const currentCols = _collectionsCache
      // Include virtual collections backed by questions, not just persisted
      // collection metadata. This check is case-insensitive and trim-aware.
      const normalizedNew = newName.toLocaleLowerCase()
      const normalizedOld = oldName.trim().toLocaleLowerCase()
      const collision = this.getCollectionsList().find((c) =>
        c.name.trim().toLocaleLowerCase() === normalizedNew &&
        c.name.trim().toLocaleLowerCase() !== normalizedOld
      )
      if (collision) return { success: false, error: `A collection named "${newName}" already exists. Choose a different name.` }
      const persistedCollection = currentCols.find((c) => c.name.toLowerCase() === oldName.toLowerCase())
      // Imports from older versions can appear as virtual folders backed by
      // questions but have no question_bank_collections metadata row yet.
      const virtualCollection = !persistedCollection
        ? this.getCollectionsList().find((c) =>
            c.name.toLowerCase() === oldName.toLowerCase() && c.id?.startsWith('col-auto-')
          )
        : null
      const existing = persistedCollection || virtualCollection
      if (!existing) return { success: false, error: `Collection "${oldName}" was not found.` }
      const collectionsForUpdate = persistedCollection ? currentCols : [...currentCols, existing]

      const nextParent = updatedData.parentName === undefined ? (existing.parentName || null) : updatedData.parentName
      if (nextParent && !currentCols.some(c => c.name === nextParent)) return { success: false, error: 'Parent collection not found.' }
      let ancestor = nextParent
      const seen = new Set<string>()
      while (ancestor) {
        if (ancestor.toLowerCase() === oldName.toLowerCase() || seen.has(ancestor.toLowerCase())) return { success: false, error: 'A collection cannot be inside itself or one of its subcollections.' }
        seen.add(ancestor.toLowerCase())
        ancestor = currentCols.find(c => c.name === ancestor)?.parentName || null
      }
      const updatedCols = collectionsForUpdate.map((c) => c.name.toLowerCase() === oldName.toLowerCase()
        ? { ...c, name: newName, parentName: nextParent, description: updatedData.description ?? c.description, targetExam: updatedData.targetExam ?? c.targetExam, colorTag: updatedData.colorTag ?? c.colorTag, updatedAt: new Date().toISOString() }
        : c.parentName?.toLowerCase() === oldName.toLowerCase() ? { ...c, parentName: newName } : c)
      const renameRequired = newName !== oldName
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!authData.user?.id) throw new Error('Sign in before editing collections.')
      const { data: profile, error: profileError } = await supabase.from('profiles')
        .select('organization_id').eq('id', authData.user.id).single()
      if (profileError) throw profileError
      if (!profile?.organization_id) throw new Error('No organization is assigned to your account.')

      // Check question_sets even when the source folder has no questions/set.
      // A destination can exist independently of collection metadata, and must
      // never be silently merged or overwritten by a rename.
      if (renameRequired) {
        const { data: destinationSets, error: destinationError } = await supabase.from('question_sets')
          .select('id').eq('organization_id', profile.organization_id).ilike('title', newName).limit(1)
        if (destinationError) throw destinationError
        if ((destinationSets || []).length > 0) {
          return { success: false, error: `A collection named "${newName}" already exists. Choose a different name.` }
        }
      }

      // Membership lives in questions.question_set_id, not in the question
      // content. Renaming its question_sets.title updates the visible collection
      // for every linked question without touching questions, answers or taxonomy.
      let renamedSetIds: string[] = []
      if (renameRequired) {
        const { data: matchingSets, error: findError } = await supabase.from('question_sets')
          .select('id').eq('organization_id', profile.organization_id).eq('title', oldName)
        if (findError) throw findError
        renamedSetIds = (matchingSets || []).map((set) => String(set.id))
        if (renamedSetIds.length > 0) {
          const { data: collisionSets, error: collisionError } = await supabase.from('question_sets')
            .select('id').eq('organization_id', profile.organization_id).eq('title', newName).limit(1)
          if (collisionError) throw collisionError
          if ((collisionSets || []).some((set) => !renamedSetIds.includes(String(set.id)))) {
            throw new Error(`A question collection named "${newName}" already exists.`)
          }
          const { error: renameError } = await supabase.from('question_sets')
            .update({ title: newName }).eq('organization_id', profile.organization_id)
            .in('id', renamedSetIds)
          if (renameError) throw renameError
        }
      }

      // Write only this folder and children whose parent reference changed.
      const changedNames = new Set(updatedCols.filter((c) =>
        c.name.toLowerCase() === newName.toLowerCase() ||
        c.parentName?.toLowerCase() === newName.toLowerCase()
      ).map((c) => c.name.toLowerCase()))
      try {
        await this.persistCollections(updatedCols, changedNames)
        if (newName.toLowerCase() !== oldName.toLowerCase() && persistedCollection) {
          const { error: deleteError } = await supabase.from('question_bank_collections')
            .delete().eq('organization_id', profile.organization_id).eq('name_key', oldName.toLowerCase())
          if (deleteError) throw deleteError
        }
      } catch (error) {
        // Best-effort compensation for a metadata failure; no question content
        // has been rewritten. Surface the original error for manual review.
        if (renamedSetIds.length > 0) {
          const { error: revertError } = await supabase.from('question_sets')
            .update({ title: oldName }).eq('organization_id', profile.organization_id)
            .in('id', renamedSetIds)
          if (revertError) console.error('Question-set rename rollback failed:', revertError)
        }
        throw error
      }
      if (renameRequired) {
        _questionsCache = _questionsCache.map((q) =>
          q.collection?.toLowerCase() === oldName.toLowerCase() ? { ...q, collection: newName } : q
        )
      }
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to save collection changes to the database.' }
    }
  },

  async deleteCollectionAndPersist(collectionName: string, deleteQuestions: boolean = false) {
    try {
      if (!_hasLoadedCollections) await this.fetchCollectionsFromDatabase()
      const trimmed = collectionName.trim().toLowerCase()
      const existing = _collectionsCache.find((c) => c.name.trim().toLowerCase() === trimmed)
      if (!existing) return { success: false, error: `Collection "${collectionName}" was not found.` }

      const currentQuestions = this.getStoredQuestions()
      const updatedQuestions = deleteQuestions
        ? currentQuestions.filter((q) => (q.collection || '').trim().toLowerCase() !== trimmed)
        : currentQuestions.map((q) => (q.collection || '').trim().toLowerCase() === trimmed ? { ...q, collection: 'General Question Bank' } : q)

      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      const userId = authData.user?.id
      if (!userId) throw new Error('You must be signed in to delete collections.')
      const { data: profile, error: profileError } = await supabase.from('profiles').select('organization_id').eq('id', userId).maybeSingle()
      if (profileError) throw profileError
      if (!profile?.organization_id) throw new Error('Your account is not assigned to an organization.')

      if (deleteQuestions) await this.saveQuestions(updatedQuestions)
      else if (updatedQuestions.some((q, i) => q !== currentQuestions[i])) await this.saveQuestions(updatedQuestions)

      const { error: deleteError } = await supabase.from('question_bank_collections').delete().eq('organization_id', profile.organization_id).eq('name_key', trimmed)
      if (deleteError) throw deleteError
      const remaining = _collectionsCache.filter((c) => c.name.trim().toLowerCase() !== trimmed)
        .map(c => c.parentName?.toLowerCase() === trimmed ? { ...c, parentName: existing.parentName || null } : c)
      await this.persistCollections(remaining)
      _hasLoadedCollections = true
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to save collection deletion to the database.' }
    }
  },

  getCollectionsList(): QuestionCollection[] {
    const questions = this.getStoredQuestions()
    const storedCols = this.getStoredCollections()

    // Calculate live question count per collection
    const counts = new Map<string, number>()
    questions.forEach((q) => {
      const name = q.collection?.trim() || 'General Question Bank'
      counts.set(name, (counts.get(name) || 0) + 1)
    })

    const map = new Map<string, QuestionCollection>()
    // Add stored collections first (even empty ones)
    storedCols.forEach((col) => {
      map.set(col.name, {
        ...col,
        questionCount: counts.get(col.name) || 0,
      })
    })

    // Also include any collection names found in stored questions that weren't explicitly registered
    counts.forEach((count, name) => {
      if (!map.has(name)) {
        map.set(name, {
          id: `col-auto-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name,
          description: '',
          targetExam: 'EST 1 / SAT Math',
          colorTag: 'blue',
          questionCount: count,
          createdAt: new Date().toISOString(),
        })
      }
    })

    return Array.from(map.values())
  },

  createCollection(
    name: string,
    description: string = '',
    targetExam: string = 'EST 1 / SAT Math',
    colorTag: string = 'blue'
  ): { success: boolean; error?: string; collection?: QuestionCollection } {
    const trimmed = name.trim()
    if (!trimmed) {
      return { success: false, error: 'Collection name cannot be empty.' }
    }

    const currentList = this.getStoredCollections()
    const existing = currentList.find((c) => c.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      return { success: false, error: `A collection named "${trimmed}" already exists.` }
    }

    const newCollection: QuestionCollection = {
      id: `col-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: trimmed,
      description: description.trim(),
      targetExam,
      colorTag,
      questionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Persistence is handled by createCollectionAndPersist so callers can await
    // the database write and report failures accurately.
    return {
      success: true,
      collection: newCollection,
    }
  },

  updateCollection(
    oldName: string,
    updatedData: { name: string; description?: string; targetExam?: string; colorTag?: string }
  ): { success: boolean; error?: string } {
    const newName = updatedData.name.trim()
    if (!newName) {
      return { success: false, error: 'Collection name cannot be empty.' }
    }

    const currentCols = this.getStoredCollections()
    if (newName.toLowerCase() !== oldName.toLowerCase()) {
      const collision = currentCols.find((c) => c.name.toLowerCase() === newName.toLowerCase())
      if (collision) {
        return { success: false, error: `A collection named "${newName}" already exists.` }
      }
    }

    const updatedCols = currentCols.map((c) => {
      if (c.name === oldName) {
        return {
          ...c,
          name: newName,
          description: updatedData.description !== undefined ? updatedData.description : c.description,
          targetExam: updatedData.targetExam !== undefined ? updatedData.targetExam : c.targetExam,
          colorTag: updatedData.colorTag !== undefined ? updatedData.colorTag : c.colorTag,
          updatedAt: new Date().toISOString(),
        }
      }
      return c
    })
    this.saveStoredCollections(updatedCols)

    // Update questions referencing the old name
    if (newName !== oldName) {
      const questions = this.getStoredQuestions()
      const updatedQuestions = questions.map((q) => {
        if (q.collection === oldName) {
          return { ...q, collection: newName }
        }
        return q
      })
      this.saveQuestions(updatedQuestions)
    }

    return { success: true }
  },

  assignQuestionsToCollection(questionIds: string[], targetCollection: string): void {
    const idsSet = new Set(questionIds)
    const current = this.getStoredQuestions()
    const updated = current.map((q) => {
      if (idsSet.has(q.id)) {
        return { ...q, collection: targetCollection }
      }
      return q
    })
    this.saveQuestions(updated)
  },

  /**
   * Imports a JSON object or array into the question bank as a collection.
   * Gracefully supports:
   * - { collection_name: "...", description: "...", questions: [...] }
   * - { collectionName: "...", questions: [...] }
   * - { questions: [...] }
   * - Raw array of questions: [ { ... }, { ... } ]
   */
  async importQuestionCollection(
    rawJson: any,
    fallbackCollectionName?: string
  ): Promise<{ success: boolean; count: number; collectionName: string; errors?: string[] }> {
    const errors: string[] = []
    let targetCollection =
      fallbackCollectionName?.trim() ||
      rawJson.collection_name ||
      rawJson.collectionName ||
      rawJson.collection ||
      'Imported Collection'

    let rawQuestionsList: any[] = []

    if (Array.isArray(rawJson)) {
      rawQuestionsList = rawJson
    } else if (rawJson && typeof rawJson === 'object') {
      if (Array.isArray(rawJson.questions)) {
        rawQuestionsList = rawJson.questions
      } else if (Array.isArray(rawJson.items)) {
        rawQuestionsList = rawJson.items
      } else {
        // Single question object
        rawQuestionsList = [rawJson]
      }
    } else {
      return {
        success: false,
        count: 0,
        collectionName: targetCollection,
        errors: ['Invalid JSON format: Expected a collection object or an array of questions.'],
      }
    }

    if (rawQuestionsList.length === 0) {
      return {
        success: false,
        count: 0,
        collectionName: targetCollection,
        errors: ['No questions found in the imported file.'],
      }
    }

    const importedQuestions: QuestionBankItem[] = []
    const now = new Date().toISOString()

    rawQuestionsList.forEach((item: any, idx: number) => {
      if (!item || typeof item !== 'object') {
        errors.push(`Item #${idx + 1} is not a valid question object.`)
        return
      }

      const prompt = (
        item.prompt ||
        item.stem ||
        item.question ||
        item.text ||
        item.title ||
        `Imported Question #${idx + 1}`
      ).toString().trim()

      const domain = (item.domain || item.category || 'Unassigned').toString().trim() || 'Unassigned'
      const chapter = (item.chapter || item.cluster || item.unit || '').toString().trim()
      const lesson = (item.lesson || item.standard || item.competency || '').toString().trim()
      const difficulty = ['easy', 'medium', 'hard'].includes(item.difficulty?.toLowerCase())
        ? (item.difficulty.toLowerCase() as 'easy' | 'medium' | 'hard')
        : 'medium'

      const questionType = ['multiple_choice', 'multi_select', 'grid_in'].includes(item.questionType || item.type)
        ? (item.questionType || item.type)
        : 'multiple_choice'

      // Normalize choices
      let choices: QuestionChoice[] = []
      if (Array.isArray(item.choices)) {
        choices = item.choices.map((c: any, cIdx: number) => ({
          id: c.id || `c-${idx}-${cIdx}-${Date.now()}`,
          text: typeof c === 'string' ? c : c.text || c.label || `Option ${cIdx + 1}`,
          isCorrect: Boolean(c.isCorrect || c.correct || c.is_correct),
          rationale: c.rationale || c.explanation || '',
        }))
      } else if (Array.isArray(item.options)) {
        choices = item.options.map((opt: any, cIdx: number) => {
          const isCorrect =
            item.correct === cIdx ||
            item.correctIndex === cIdx ||
            item.correctAnswer === opt ||
            (typeof opt === 'object' && Boolean(opt.isCorrect))

          return {
            id: `c-${idx}-${cIdx}-${Date.now()}`,
            text: typeof opt === 'string' ? opt : opt.text || opt.label || `Option ${cIdx + 1}`,
            isCorrect,
            rationale: typeof opt === 'object' ? opt.rationale : '',
          }
        })
      }

      // If multiple choice but no choice marked correct, default first choice
      if (questionType !== 'grid_in' && choices.length > 0 && !choices.some((c) => c.isCorrect)) {
        choices[0].isCorrect = true
      }

      const questionItem: QuestionBankItem = {
        id: item.id ? String(item.id).trim() : `qb-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
        // The collection name selected in the import dialog is authoritative.
        collection: targetCollection,
        domain,
        chapter,
        lesson,
        difficulty,
        questionType,
        calculatorAllowed: Boolean(item.calculatorAllowed ?? item.calculator),
        estimatedSeconds: Math.max(10, Number(item.estimatedSeconds || item.timeLimit) || 90),
        targetExam: item.targetExam || item.exam || 'EST 1 / SAT Math',
        prompt,
        imageUrl: item.imageUrl || item.image || item.diagram || '',
        imageCaption: item.imageCaption || item.caption || '',
        choices,
        numericAnswer: String(item.numericAnswer || item.correct_answer || item.answer || ''),
        numericTolerance: String(item.numericTolerance || '0'),
        explanation: item.explanation || item.solution || item.derivation || '',
        commonMisconception: item.commonMisconception || item.trap || item.misconception || '',
        createdAt: item.createdAt || now,
        updatedAt: now,
      }

      importedQuestions.push(questionItem)
    })

    if (importedQuestions.length === 0) {
      return {
        success: false,
        count: 0,
        collectionName: targetCollection,
        errors: errors.length > 0 ? errors : ['Failed to extract any valid questions.'],
      }
    }

    // Only persist imported/updated items. Re-saving the entire bank performs
    // costly destructive replacement of every question's choices/taxonomy links.
    // Keep concurrency bounded to avoid overwhelming Supabase with large pools.
    try {
      const context = await buildImportSyncContext()
      const concurrency = 4
      for (let offset = 0; offset < importedQuestions.length; offset += concurrency) {
        await Promise.all(importedQuestions.slice(offset, offset + concurrency)
          .map((question) => this.syncQuestionToDatabase(question, context)))
      }
    } catch (error: any) {
      console.error('Question pool import failed:', error)
      // A batch may have committed earlier questions; no silent success. The
      // importer must remain idempotent when retried with the same UUIDs.
      return {
        success: false,
        count: 0,
        collectionName: targetCollection,
        errors: [error?.message || 'Failed to save imported questions to Supabase.', 'Do not retry blindly: some questions may have been saved before this error.'],
      }
    }

    const existing = this.getStoredQuestions()
    const importedIds = new Set(importedQuestions.map((q) => q.id))
    _questionsCache = [...importedQuestions, ...existing.filter((q) => !importedIds.has(q.id))]
    _hasLoadedQuestions = true

    // Ensure collection is registered in stored collections
    const storedCols = this.getStoredCollections()
    if (!storedCols.some((c) => c.name.toLowerCase() === targetCollection.toLowerCase())) {
      // Await metadata persistence before showing import success. Otherwise
      // immediate edits can race against a missing collection row.
      await this.persistCollections([
        ...storedCols,
        {
          id: `col-import-${Date.now()}`,
          name: targetCollection,
          description: rawJson.description || 'Imported collection',
          targetExam: 'EST 1 / SAT Math',
          colorTag: 'blue',
          questionCount: importedQuestions.length,
          createdAt: new Date().toISOString(),
        },
      ], new Set([targetCollection.toLowerCase()]))
    }

    return {
      success: true,
      count: importedQuestions.length,
      collectionName: targetCollection,
      errors: errors.length > 0 ? errors : undefined,
    }
  },

  exportCollectionAsJson(collectionName?: string): string {
    const questions = this.getStoredQuestions()
    const exportList = collectionName
      ? questions.filter((q) => (q.collection || 'General Question Bank') === collectionName)
      : questions

    const output = {
      collection_name: collectionName || 'All Math Diagnostic Question Bank',
      exported_at: new Date().toISOString(),
      version: '2.0',
      question_count: exportList.length,
      questions: exportList,
    }

    return JSON.stringify(output, null, 2)
  },

  getSampleCollectionTemplate(): object {
    return {
      collection_name: 'EST 1 Math Diagnostic - Specimen Collection',
      description: 'Curriculum-aligned questions with domains, chapters, lessons and KaTeX support',
      version: '2.0',
      questions: [
        {
          id: 'specimen-01',
          domain: 'Algebra & Functions',
          chapter: 'Quadratic & Polynomial Equations',
          lesson: 'Quadratic Formula & Discriminant Analysis',
          difficulty: 'medium',
          questionType: 'multiple_choice',
          calculatorAllowed: false,
          estimatedSeconds: 90,
          targetExam: 'EST 1 / SAT Math',
          prompt:
            'For the quadratic equation $2x^2 - 4x + k = 0$, what value of $k$ gives exactly one real distinct root?',
          imageUrl: '',
          imageCaption: '',
          choices: [
            {
              id: 'c1',
              text: '$k = 2$',
              isCorrect: true,
              rationale: 'Discriminant 16 - 8k = 0 implies k = 2.',
            },
            {
              id: 'c2',
              text: '$k = 4$',
              isCorrect: false,
              rationale: 'Yields negative discriminant and complex roots.',
            },
            {
              id: 'c3',
              text: '$k = -2$',
              isCorrect: false,
              rationale: 'Sign error on -4ac.',
            },
            {
              id: 'c4',
              text: '$k = 0$',
              isCorrect: false,
              rationale: 'Yields two distinct roots: 0 and 2.',
            },
          ],
          explanation:
            'For exactly one distinct real root, the discriminant must be zero: $\\Delta = b^2 - 4ac = 0$. Here $(-4)^2 - 4(2)(k) = 0 \\implies 16 - 8k = 0 \\implies k = 2$.',
          commonMisconception:
            'Students frequently confuse the condition for two roots ($\\Delta > 0$) with one root ($\\Delta = 0$).',
        },
        {
          id: 'specimen-02',
          domain: 'Geometry & Measurement',
          chapter: 'Circles & Coordinate Geometry',
          lesson: 'Arc Length & Sector Area Calculations',
          difficulty: 'easy',
          questionType: 'grid_in',
          calculatorAllowed: true,
          estimatedSeconds: 60,
          targetExam: 'EST 1 / SAT Math',
          prompt:
            'A circle has a radius of $10$. What is the area of a $90^\\circ$ sector divided by $\\pi$?',
          imageUrl: '',
          imageCaption: '',
          choices: [],
          numericAnswer: '25',
          numericTolerance: '0',
          explanation:
            'The area of the circle is $\\pi r^2 = 100\\pi$. A $90^\\circ$ sector is $90/360 = 1/4$ of the circle, so the area is $25\\pi$. Dividing by $\\pi$ gives $25$.',
          commonMisconception:
            'Dividing by diameter rather than squaring radius.',
        },
      ],
    }
  },
}
