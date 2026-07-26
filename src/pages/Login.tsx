import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, Link } from 'react-router-dom'
import { Target, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePlatformBranding } from '@/hooks/usePlatformBranding'

export function Login() {
  const { session, signIn } = useAuth()
  const location = useLocation()
  const platformBranding = usePlatformBranding()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (session) {
    const from = (location.state as any)?.from?.pathname ?? '/leads'
    return <Navigate to={from} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) setError(error)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base-950 px-4 py-8 animate-fadeIn">
      {/* Decorative background — kept minimal: one soft accent glow + a faint dot grid */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse 60% 50% at 50% 40%, black 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 60% 50% at 50% 40%, black 20%, transparent 75%)',
          }}
        />
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 h-[300px] w-[300px] rounded-full bg-accent-500/5 blur-[100px]" />
      </div>

      <div className="card relative w-full max-w-sm p-8 animate-slideUp">
        <div className="mb-8 flex flex-col items-center text-center">
          {platformBranding?.logo_url ? (
            <img
              src={platformBranding.logo_url}
              alt={platformBranding?.platform_name || 'Leads CRM'}
              className="mb-4 h-12 w-12 rounded-xl object-cover"
            />
          ) : (
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500 shadow-glow">
              <Target size={24} className="text-white" />
            </div>
          )}
          <h1 className="text-xl font-semibold text-base-100">{platformBranding?.platform_name || 'Leads CRM'}</h1>
          <p className="mt-1 text-sm text-base-400">Sign in to manage your sales pipeline</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              autoComplete="username"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="password">Password</label>
              <Link to="/forgot-password" className="text-xs font-medium text-accent-400 hover:underline">
                Forgot Password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                className="input pr-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-base-400 transition-colors hover:text-base-100 focus-visible:text-base-100 focus-visible:outline-none"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger animate-fadeIn">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full hover:scale-[1.01] active:scale-[0.98]"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-base-400">
          Don't have an account?{' '}
          <Link to="/request-access" className="font-medium text-accent-400 hover:underline">
            Request Access
          </Link>
        </p>
      </div>
    </div>
  )
}
