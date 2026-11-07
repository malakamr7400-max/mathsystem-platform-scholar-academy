
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  LayoutTemplate,
  BookOpenText,
  ClipboardList,
  GraduationCap,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Settings2,
  Sparkles,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { recordNavigation, navigateBack } from '../lib/navigationHistory'

interface AdminLayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
  actions?: ReactNode
  showBackButton?: boolean
  backButtonPath?: string
}

interface NavItem {
  label: string
  path: string
  icon: LucideIcon
}

const navigation: { title: string; items: NavItem[] }[] = [
  {
    title: 'Workspace',
    items: [
      { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
      { label: 'Assessments', path: '/admin/assessments', icon: ClipboardList },
      { label: 'Question Bank', path: '/admin/questions', icon: BookOpenText },
    ],
  },
  {
    title: 'Teaching',
    items: [
      { label: 'Topics & Skills', path: '/admin/taxonomy', icon: Network },
      { label: 'Levels & Courses', path: '/admin/levels', icon: GraduationCap },
      { label: 'Evaluation Settings', path: '/admin/evaluation-profiles', icon: Layers3 },
    ],
  },
  {
    title: 'Reports & plans',
    items: [
      { label: 'Student Surveys', path: '/admin/survey-action-plans', icon: Sparkles },
      { label: 'Learning Plans', path: '/admin/action-plans', icon: Workflow },
      { label: 'Report Studio', path: '/admin/report-studio', icon: LayoutTemplate },
      { label: 'Scoring & Criteria', path: '/admin/report-settings', icon: BarChart3 },
    ],
  },
  {
    title: 'Settings',
    items: [{ label: 'Workspace Settings', path: '/admin/settings', icon: Settings2 }],
  },
]

function isNavActive(current: string, target: string): boolean {
  if (target === '/admin') return current === target
  if (target === '/admin/action-plans') return current === target
  return current === target || current.startsWith(`${target}/`)
}

export default function AdminLayout({
  children,
  title,
  subtitle,
  actions,
  showBackButton,
  backButtonPath,
}: AdminLayoutProps) {
  const { profile, session, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    recordNavigation(location.pathname)
    setMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileMenuOpen])

  // Keep keyboard focus inside the open mobile navigation and restore it on close.
  useEffect(() => {
    if (!mobileMenuOpen) return
    const dialog = document.getElementById('mobile-workspace-navigation')
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
    focusable()[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [mobileMenuOpen])

  const shouldShowBack = showBackButton ?? location.pathname !== '/admin'
  const userDisplayName = profile?.full_name || session?.user?.email?.split('@')[0] || 'Staff member'
  const userRole = profile?.role?.trim() || 'Staff'
  const userInitial = userDisplayName.charAt(0).toUpperCase()

  const handleBack = () => navigateBack(navigate, location.pathname, backButtonPath)

  const navigationContent = (mobile: boolean) => (
    <nav aria-label={mobile ? 'Mobile workspace navigation' : 'Workspace navigation'} className="ms-sidebar-nav min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {navigation.map((group) => (
        <div key={group.title}>
          <p className="ms-sidebar-section mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em]">{group.title}</p>
          <div className="space-y-0.5">
            {group.items.map(({ label, path, icon: Icon }) => {
              const active = isNavActive(location.pathname, path)
              return (
                <Link
                  key={path}
                  to={path}
                  aria-current={active ? 'page' : undefined}
                  onClick={mobile ? () => setMobileMenuOpen(false) : undefined}
                  className={`ms-sidebar-link group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${active ? 'ms-sidebar-link-active font-semibold' : ''}`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {active && <span className="ms-active-marker h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden="true" />}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )

  const accountContent = () => (
    <div className="ms-sidebar-account border-t p-4">
      <div className="ms-sidebar-account-inner flex items-center gap-3 rounded-xl px-3 py-3">
        <div className="ms-sidebar-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold" aria-hidden="true">{userInitial}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white" title={userDisplayName}>{userDisplayName}</p>
          <p className="ms-sidebar-role mt-0.5 text-[11px] capitalize">{userRole}</p>
        </div>
        <button
          type="button"
          onClick={() => { void signOut() }}
          title="Sign out"
          aria-label="Sign out of the workspace"
          className="ms-sidebar-signout rounded-lg p-2 transition"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

  const brandContent = () => (
    <Link to="/admin" className="ms-sidebar-brand flex items-center gap-3 border-b px-5 py-6" aria-label="MathSystem teacher dashboard">
      <div className="ms-sidebar-logo flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-white">
        <GraduationCap className="h-6 w-6" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[16px] font-bold tracking-[-0.025em] text-white">MathSystem</p>
        <p className="ms-sidebar-brand-caption mt-0.5 text-[11px] font-medium">Educator platform</p>
      </div>
    </Link>
  )

  return (
    <div className="ms-admin-shell relative flex min-h-screen font-sans text-slate-900">
      <a href="#workspace-content" className="ms-skip-link">Skip to main content</a>
      <aside className="ms-admin-sidebar sticky top-0 z-30 hidden h-screen w-[280px] shrink-0 flex-col lg:flex">
        {brandContent()}
        {navigationContent(false)}
        {accountContent()}
      </aside>

      <div className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white"><GraduationCap className="h-5 w-5" /></div>
          <div>
            <p className="text-sm font-extrabold tracking-tight text-slate-950">MathSystem</p>
            <p className="text-[10px] text-slate-500">Teacher workspace</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-controls="mobile-workspace-navigation"
          aria-expanded={mobileMenuOpen}
          className="rounded-xl border border-slate-200 p-2.5 text-slate-700 hover:bg-slate-50"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex bg-slate-950/45 lg:hidden">
          <button type="button" className="absolute inset-0 cursor-default" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation overlay" />
          <aside id="mobile-workspace-navigation" role="dialog" aria-modal="true" aria-label="Workspace navigation" className="ms-admin-sidebar relative flex h-full w-[min(85vw,310px)] flex-col shadow-2xl">
            <div className="ms-sidebar-mobile-head flex items-center justify-between border-b">
              {brandContent()}
              <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" className="ms-sidebar-signout mr-3 rounded-lg p-2"><X className="h-5 w-5" /></button>
            </div>
            {navigationContent(true)}
            {accountContent()}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col pt-16 lg:pt-0">
        {(title || actions || shouldShowBack) && (
          <header className="ms-admin-header sticky top-16 z-20 flex min-w-0 flex-col gap-3 border-b bg-white/95 px-4 py-5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:top-0">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {shouldShowBack && (
                <button
                  type="button"
                  onClick={handleBack}
                  aria-label="Go back"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span>
                </button>
              )}
              <div className="min-w-0 flex-1">
                {title && <h1 className="truncate text-xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-[23px]">{title}</h1>}
                {subtitle && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{subtitle}</p>}
              </div>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </header>
        )}
        <main id="workspace-content" tabIndex={-1} className="ms-workspace-main mx-auto w-full max-w-[1460px] min-w-0 flex-1 px-4 py-7 sm:px-8 sm:py-9 xl:px-11 xl:py-10">
          {children}
        </main>
      </div>
    </div>
  )
}
