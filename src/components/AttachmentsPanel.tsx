import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Paperclip, Download, Trash2, Upload } from 'lucide-react'
import { attachmentsApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Attachment } from '@/types/lead'

const STORAGE_BUCKET = 'lead-attachments'

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentsPanel({ leadId, attachments }: { leadId: string; attachments: Attachment[] }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const { signedUrl, token, storage_path } = await attachmentsApi.createSignedUpload(leadId, file.name)
      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .uploadToSignedUrl(storage_path, token, file)
      if (uploadErr) throw uploadErr

      await attachmentsApi.saveMetadata({
        lead_id: leadId,
        file_name: file.name,
        storage_path,
        content_type: file.type,
        size_bytes: file.size,
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead', leadId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => attachmentsApi.remove(attachmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead', leadId] }),
  })

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        await uploadMutation.mutateAsync(file)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDownload(attachment: Attachment) {
    const { url } = await attachmentsApi.getDownloadUrl(attachment.id)
    window.open(url, '_blank')
  }

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Attachments</h2>
        <button className="btn-secondary" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <Upload size={16} />
          {uploading ? 'Uploading…' : 'Upload File'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {attachments.length === 0 ? (
        <p className="text-sm text-base-400">No files attached yet.</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-lg border border-base-700/60 bg-base-850 px-4 py-2.5"
            >
              <div className="flex items-center gap-2.5 truncate">
                <Paperclip size={16} className="shrink-0 text-base-400" />
                <div className="truncate">
                  <p className="truncate text-sm text-base-100">{a.file_name}</p>
                  <p className="text-xs text-base-400">{formatSize(a.size_bytes)}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button className="btn-ghost px-2" onClick={() => handleDownload(a)} title="Download">
                  <Download size={16} />
                </button>
                <button
                  className="btn-ghost px-2 hover:text-danger"
                  onClick={() => deleteMutation.mutate(a.id)}
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
