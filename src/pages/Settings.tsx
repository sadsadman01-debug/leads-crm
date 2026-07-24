import { Settings as SettingsIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export function Settings() {
  const { session } = useAuth()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-base-100">Settings</h1>

      <div className="card mb-6 p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-base-300">Account</h2>
        <p className="text-sm text-base-200">{session?.user.email}</p>
        <p className="text-xs text-base-400">Single-admin account</p>
      </div>

      <div className="card flex flex-col items-center gap-3 p-16 text-center">
        <SettingsIcon size={32} className="text-base-500" />
        <p className="text-base-300">
          Notification preferences, outreach templates, and team management are coming in a future phase.
        </p>
      </div>
    </div>
  )
}
