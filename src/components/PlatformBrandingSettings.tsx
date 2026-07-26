import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Image as ImageIcon, RotateCcw, Target, Upload } from 'lucide-react'
import { platformBrandingApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { BRAND_PALETTE, findBrandColor } from '@/lib/brandColors'

const STORAGE_BUCKET = 'org-logos'
const MAX_FILE_BYTES = 2 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml']

export function PlatformBrandingSettings() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const { data } = useQuery({ queryKey: ['platform-branding'], queryFn: platformBrandingApi.get })

  const [accentColor, setAccentColor] = useState<string | null>(null)
  const [platformName, setPlatformName] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [pendingLogoPath, setPendingLogoPath] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!data) return
    setAccentColor(data.accent_color)
    setPlatformName(data.platform_name ?? '')
    setLogoUrl(data.logo_url)
    setPendingLogoPath(undefined)
  }, [data])

  const dirty =
    Boolean(data) &&
    (accentColor !== data!.accent_color ||
      platformName.trim() !== (data!.platform_name ?? '') ||
      pendingLogoPath !== undefined)

  const saveMutation = useMutation({
    mutationFn: () =>
      platformBrandingApi.update({
        accent_color: accentColor,
        platform_name: platformName.trim() || null,
        ...(pendingLogoPath !== undefined ? { logo_storage_path: pendingLogoPath } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-branding'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => platformBrandingApi.reset(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-branding'] }),
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
      const { token, storage_path } = await platformBrandingApi.createLogoSignedUpload(file.name)
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
    setPlatformName('')
    setLogoUrl(null)
    setPendingLogoPath(undefined)
    resetMutation.mutate()
  }

  const previewShades = findBrandColor(accentColor)
  const previewName = platformName.trim() || 'Leads CRM'
  const previewVars = {
    '--accent-400': hexToRgbTriplet(previewShades[400]),
    '--accent-500': hexToRgbTriplet(previewShades[500]),
    '--accent-600': hexToRgbTriplet(previewShades[600]),
  } as React.CSSProperties

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Platform Branding</h2>
      <p className="mb-5 text-xs text-base-400">
        Sets the app's default logo, accent color, and name — shown on the Login/Request Access/Forgot Password
        pages, in your own platform-level views, and in any organization's workspace that hasn't set its own
        branding. An organization's own Branding settings always take priority over this.
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
            <label className="label">Platform Name</label>
            <input
              className="input"
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
              placeholder="Optional — e.g. Navigant CRM (default: Leads CRM)"
              maxLength={80}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-base-700/60 pt-4">
            <button className="btn-primary" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn-secondary" disabled={resetMutation.isPending} onClick={handleReset}>
              <RotateCcw size={15} />
              Reset to Original App Defaults
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-success">
                <CheckCircle2 size={16} />
                Saved
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Login Page Preview</label>
            <div className="overflow-hidden rounded-xl2 border border-base-700/60 bg-base-900/95 p-5" style={previewVars}>
              <div className="flex flex-col items-center text-center">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo preview" className="mb-3 h-10 w-10 rounded-xl object-cover" />
                ) : (
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500 shadow-glow">
                    <Target size={20} className="text-white" />
                  </div>
                )}
                <span className="text-sm font-semibold text-base-100">{previewName}</span>
                <span className="mt-1 text-[11px] text-base-400">Sign in to manage your sales pipeline</span>
                <button type="button" className="btn-primary mt-3 w-full cursor-default text-xs" tabIndex={-1}>
                  Sign In
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Default Sidebar Preview</label>
            <div className="overflow-hidden rounded-xl2 border border-base-700/60 bg-base-900/95" style={previewVars}>
              <div className="px-4 py-4">
                <div className="flex items-center gap-2.5">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo preview" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-500 shadow-glow">
                      <Target size={18} className="text-white" />
                    </div>
                  )}
                  <span className="text-base font-semibold tracking-tight text-base-100">{previewName}</span>
                </div>
                <button type="button" className="btn-primary mt-4 w-full cursor-default text-xs" tabIndex={-1}>
                  Primary Button
                </button>
              </div>
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
