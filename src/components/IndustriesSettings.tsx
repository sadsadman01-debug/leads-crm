import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Plus, Trash2 } from 'lucide-react'
import { industriesApi } from '@/lib/api'
import type { Industry } from '@/types/lead'

function IndustryRow({
  industry,
  onRename,
  onDelete,
}: {
  industry: Industry
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}) {
  const [name, setName] = useState(industry.name)
  useEffect(() => setName(industry.name), [industry.name])

  return (
    <div className="flex items-center gap-2 rounded-lg border border-base-700/60 bg-base-850 px-3 py-2.5">
      <input
        className="input flex-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const trimmed = name.trim()
          if (trimmed && trimmed !== industry.name) onRename(industry.id, trimmed)
          else setName(industry.name)
        }}
      />
      <button className="btn-ghost px-2 hover:text-danger" onClick={() => onDelete(industry.id)} title="Delete industry">
        <Trash2 size={16} />
      </button>
    </div>
  )
}

export function IndustriesSettings() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['industries'], queryFn: industriesApi.list })
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['industries'] })
  }

  const createMutation = useMutation({
    mutationFn: (name: string) => industriesApi.create(name),
    onSuccess: () => {
      invalidate()
      setNewName('')
      setError(null)
    },
    onError: (e: any) => setError(e?.message ?? 'Could not create industry'),
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => industriesApi.rename(id, name),
    onSuccess: invalidate,
    onError: (e: any) => setError(e?.message ?? 'Could not rename industry'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => industriesApi.remove(id),
    onSuccess: invalidate,
    onError: (e: any) => setError(e?.message ?? 'Could not delete industry'),
  })

  const industries = data?.industries ?? []

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Industries</h2>
      <p className="mb-4 text-xs text-base-400">
        Structured industry categories for segmenting leads — used for filtering the Leads page and Dashboard, and
        for CSV/Sheets import mapping.
      </p>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-danger-bg px-3 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-base-400">Loading industries…</p>
      ) : (
        <div className="space-y-2">
          {industries.map((industry) => (
            <IndustryRow
              key={industry.id}
              industry={industry}
              onRename={(id, name) => {
                setError(null)
                renameMutation.mutate({ id, name })
              }}
              onDelete={(id) => {
                setError(null)
                deleteMutation.mutate(id)
              }}
            />
          ))}
        </div>
      )}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (newName.trim()) createMutation.mutate(newName.trim())
        }}
      >
        <input
          className="input flex-1"
          placeholder="New industry, e.g. Law Firms"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn-secondary" disabled={!newName.trim() || createMutation.isPending}>
          <Plus size={16} />
          Add Industry
        </button>
      </form>
    </div>
  )
}
