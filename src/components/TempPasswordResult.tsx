import { useState } from 'react'
import { Copy, Check, ShieldAlert } from 'lucide-react'

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn-secondary shrink-0"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? 'Copied' : label}
    </button>
  )
}

/** One-time credentials screen shared by the Signup Request approve flow and
 * every password-reset path (forgot-password resolve, and the direct "Reset
 * Password" button in Team Management) — this app never sends email
 * automatically, so this is always the hand-off point to the resolver's own
 * personal email client. */
export function TempPasswordResult({
  email,
  temporaryPassword,
  draft,
  onDraftChange,
}: {
  email: string
  temporaryPassword: string
  draft: string
  onDraftChange: (value: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn">
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        <p>
          This app does <strong>not</strong> send any email automatically. Copy the credentials or the message below
          and send it yourself from your own email client.
        </p>
      </div>

      <div>
        <label className="label">Email</label>
        <div className="flex gap-2">
          <input readOnly className="input" value={email} />
          <CopyButton text={email} />
        </div>
      </div>

      <div>
        <label className="label">Temporary Password</label>
        <div className="flex gap-2">
          <input readOnly className="input font-mono" value={temporaryPassword} />
          <CopyButton text={temporaryPassword} />
        </div>
      </div>

      <div>
        <label className="label">Message (editable)</label>
        <textarea
          className="input min-h-[180px] resize-y font-mono text-xs"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <CopyButton text={draft} label="Copy Message" />
        </div>
      </div>
    </div>
  )
}
