import { LayoutDashboard } from 'lucide-react'

export function Dashboard() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-base-100">Dashboard</h1>
      <div className="card flex flex-col items-center gap-3 p-16 text-center">
        <LayoutDashboard size={32} className="text-base-500" />
        <p className="text-base-300">
          Pipeline analytics, conversion funnels, and activity charts are coming in a future phase.
        </p>
      </div>
    </div>
  )
}
