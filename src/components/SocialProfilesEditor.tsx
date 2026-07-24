import { Plus, Trash2 } from 'lucide-react'
import type { SocialProfile } from '@/types/lead'

const SUGGESTED_PLATFORMS = ['Facebook', 'X/Twitter', 'LinkedIn', 'Instagram', 'YouTube', 'TikTok']

export function SocialProfilesEditor({
  value,
  onChange,
}: {
  value: SocialProfile[]
  onChange: (profiles: SocialProfile[]) => void
}) {
  function update(index: number, patch: Partial<SocialProfile>) {
    onChange(value.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  function add() {
    onChange([...value, { platform: '', url: '' }])
  }

  return (
    <div className="space-y-2">
      {value.map((profile, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <select
            className="input w-full sm:w-40"
            value={SUGGESTED_PLATFORMS.includes(profile.platform) ? profile.platform : 'Other'}
            onChange={(e) => update(i, { platform: e.target.value === 'Other' ? '' : e.target.value })}
          >
            {SUGGESTED_PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
            <option value="Other">Other…</option>
          </select>
          {!SUGGESTED_PLATFORMS.includes(profile.platform) && (
            <input
              className="input w-full sm:w-32"
              placeholder="Platform"
              value={profile.platform}
              onChange={(e) => update(i, { platform: e.target.value })}
            />
          )}
          <input
            className="input min-w-0 flex-1"
            placeholder="https://…"
            value={profile.url}
            onChange={(e) => update(i, { url: e.target.value })}
          />
          <button type="button" className="btn-ghost shrink-0 px-2" onClick={() => remove(i)}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={add}>
        <Plus size={16} />
        Add Social Profile
      </button>
    </div>
  )
}
