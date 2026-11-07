import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpenCheck, GraduationCap, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginFormData = z.infer<typeof loginSchema>

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(data: LoginFormData) {
    setServerError(null)
    const { error } = await signIn(data.email, data.password)
    if (error) {
      setServerError(error)
    } else {
      navigate('/admin')
    }
  }

  return (
    <main className="ms-login-shell flex items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
      <div className="grid w-full max-w-[1080px] overflow-hidden rounded-[28px] border border-[#e2e8e6] bg-white shadow-[0_30px_100px_rgba(19,37,59,0.10)] lg:min-h-[640px] lg:grid-cols-[1fr_1fr]">
        <section className="ms-login-panel relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex" aria-label="About MathSystem">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full border-[60px] border-white/5" aria-hidden="true" />
          <div className="relative flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><GraduationCap className="h-7 w-7" aria-hidden="true" /></span>
            <div><p className="text-xl font-extrabold tracking-tight">MathSystem</p><p className="text-xs text-blue-100">Your teaching workspace</p></div>
          </div>
          <div className="relative max-w-sm space-y-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold"><BookOpenCheck className="h-4 w-4" aria-hidden="true" /> Built for educators</span>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">Make space for better learning.</h1>
            <p className="text-base leading-relaxed text-blue-100">One thoughtfully designed place to prepare assessments, understand progress, and support every learner.</p>
          </div>
          <div className="relative flex items-center gap-2 text-sm text-blue-100"><ShieldCheck className="h-5 w-5" aria-hidden="true" /> Secure access for teachers and administrators</div>
        </section>

        <section className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-14">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-700 text-white"><GraduationCap className="h-6 w-6" aria-hidden="true" /></span>
            <div><p className="text-lg font-extrabold text-slate-900">MathSystem</p><p className="text-xs text-slate-500">Teacher workspace</p></div>
          </div>
          <span className="ms-eyebrow">YOUR EDUCATOR WORKSPACE</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0f2747]">Welcome back.</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">Sign in with the email and password provided by your school to continue your work.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-9 space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-800">Email address</label>
              <input id="email" type="email" autoComplete="username" placeholder="name@school.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} {...register('email')} className="ms-login-input" />
              {errors.email && <p id="email-error" role="alert" className="mt-1.5 text-xs text-red-700">{errors.email.message}</p>}
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-800">Password</label>
              <input id="password" type="password" autoComplete="current-password" placeholder="Enter your password" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} {...register('password')} className="ms-login-input" />
              {errors.password && <p id="password-error" role="alert" className="mt-1.5 text-xs text-red-700">{errors.password.message}</p>}
            </div>
            {serverError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">We couldn't sign you in. {serverError}</div>}
            <button type="submit" disabled={isSubmitting} className="ms-login-submit flex items-center justify-center gap-2">
              {isSubmitting ? 'Signing you in…' : 'Sign in'}
              {!isSubmitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </button>
          </form>
          <p className="mt-7 flex items-start gap-2 text-xs leading-relaxed text-slate-500"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" /> If you don't have sign-in details, please contact your school administrator.</p>
        </section>
      </div>
    </main>
  )
}

export { LoginPage }
