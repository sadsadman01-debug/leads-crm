import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Image as ImageIcon, RotateCcw, Target, Upload } from 'lucide-react'
import { brandingApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { BRAND_PALETTE, findBrandColor } from '@/lib/brandColors'

const STORAGE_BUCKET = 'org-logos'
const MAX_FILE_BYTES = 2 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml']

export function BrandingSettings() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const { data } = useQuery({ queryKey: ['org-branding'], queryFn: brandingApi.get })

  const [accentColor, setAccentColor] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [pendingLogoPath, setPendingLogoPath] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!data) return
    setAccentColor(data.accent_color)
    setDisplayName(data.display_name ?? '')
    setLogoUrl(data.logo_url)
    setPendingLogoPath(undefined)
  }, [data])

  const dirty =
    Boolean(data) &&
    (accentColor !== data!.accent_color ||
      displayName.trim() !== (data!.display_name ?? '') ||
      pendingLogoPath !== undefined)

  const saveMutation = useMutation({
    mutationFn: () =>
      brandingApi.update({
        accent_color: accentColor,
        display_name: displayName.trim() || null,
        ...(pendingLogoPath !== undefined ? { logo_storage_path: pendingLogoPath } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-branding'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => brandingApi.reset(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org-branding'] }),
  })

  async function handleFileSelect(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setError(null)

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Logo must be a PNG, JPG, or SVG file.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Logo must be 2MB or smaller.')
      return
    }

    setUploading(true)
    try {
      const { token, storage_path } = await brandingApi.createLogoSignedUpload(file.name)
      const { error: uploadErr } = await supabase.storage.from(STORAGE_BUCKET).uploadToSignedUrl(storage_path, token, file)
      if (uploadErr) throw uploadErr

      setLogoUrl(URL.createObjectURL(file))
      setPendingLogoPath(storage_path)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload logo.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function clearLogo() {
    setLogoUrl(null)
    setPendingLogoPath(null)
  }

  function handleReset() {
    setAccentColor(null)
    setDisplayName('')
    setLogoUrl(null)
    setPendingLogoPath(undefined)
    resetMutation.mutate()
  }

  const previewShades = findBrandColor(accentColor)

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Branding</h2>
      <p className="mb-5 text-xs text-base-400">
        Customize how your organization's workspace looks for everyone in it — your logo, accent color, and
        display name. This only affects your own organization.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-5">
          <div>
            <label className="label">Logo</label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-base-800">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo preview" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon size={20} className="text-base-500" />
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
              <button type="button" className="btn-secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>
                <Upload size={15} />
                {uploading ? 'Uploading…' : 'Upload Logo'}
              </button>
              {logoUrl && (
                <button type="button" className="btn-ghost" onClick={clearLogo}>
                  Remove
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-base-500">PNG, JPG, or SVG. Max 2MB.</p>
            {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
          </div>

          <div>
            <label className="label">Accent Color</label>
            <div className="flex flex-wrap gap-2">
              {BRAND_PALETTE.map((c) => {
                const isSelected = accentColor === c[500] || (!accentColor && c.id === 'indigo')
                return (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    aria-label={c.label}
                    onClick={() => setAccentColor(c[500])}
                    className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-base-900 transition-transform ${
                      isSelected ? 'ring-2 ring-base-100' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c[500] }}
                  />
                )
              })}
            </div>
          </div>

          <div>
            <label className="label">Display Name</label>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Optional — shown instead of your organization's registered name"
              maxLength={80}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-base-700/60 pt-4">
            <button className="btn-primary" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? 'Saving…' : 'Save Branding'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={resetMutation.isPending}
              onClick={handleReset}
            >
              <RotateCcw size={15} />
              Reset to Default
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-success">
                <CheckCircle2 size={16} />
                Saved
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="label">Live Preview</label>
          <div
            className="overflow-hidden rounded-xl2 border border-base-700/60 bg-base-900/95"
            style={
              {
                '--accent-400': hexToRgbTriplet(previewShades[400]),
                '--accent-500': hexToRgbTriplet(previewShades[500]),
                '--accent-600': hexToRgbTriplet(previewShades[600]),
              } as React.CSSProperties
            }
          >
            <div className="px-4 py-4">
              <div className="flex items-center gap-2.5">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo preview" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-500 shadow-glow">
                    <Target size={18} className="text-white" />
                  </div>
                )}
                <span className="text-base font-semibold tracking-tight text-base-100">Leads CRM</span>
              </div>
              {displayName.trim() && (
                <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-base-800/60 px-2.5 py-1.5 text-xs text-base-300">
                  <span className="truncate">{displayName.trim()}</span>
                </div>
              )}
              <button type="button" className="btn-primary mt-4 w-full cursor-default text-xs" tabIndex={-1}>
                Primary Button
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r} ${g} ${b}`
}
