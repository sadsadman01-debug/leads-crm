import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { tagsApi } from '@/lib/api'

export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('')
  const { data } = useQuery({ queryKey: ['tags'], queryFn: tagsApi.list })

  const suggestions = (data?.tags ?? [])
    .map((t) => t.name)
    .filter((name) => !value.includes(name) && name.toLowerCase().includes(input.toLowerCase()))
    .slice(0, 6)

  function addTag(name: string) {
    const clean = name.trim()
    if (clean && !value.includes(clean)) onChange([...value, clean])
    setInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div>
      <div className="input flex flex-wrap items-center gap-1.5 py-1.5">
        {value.map((tag) => (
          <span key={tag} className="pill bg-accent-500/15 text-accent-400">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          className="min-w-[120px] flex-1 bg-transparent py-1 text-sm text-base-100 outline-none placeholder:text-base-400"
          placeholder={value.length === 0 ? 'e.g. SaaS, US-East, Referral Partner…' : ''}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {input && suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="pill bg-base-800 text-base-300 hover:bg-base-700"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
