import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Facebook, Mail, ImageIcon, Download } from 'lucide-react'
import { affiliatesApi, affiliateMarketingApi } from '@/lib/api'
import { CopyButton } from '@/components/TempPasswordResult'

export function MarketingTab() {
  const { data: affiliate } = useQuery({ queryKey: ['affiliate-me'], queryFn: affiliatesApi.getMe })
  const referralLink = affiliate ? `${window.location.origin}/request-access?ref=${affiliate.referral_code}` : ''

  const { data: materials } = useQuery({
    queryKey: ['affiliate-marketing', referralLink],
    queryFn: () => affiliateMarketingApi.get(referralLink),
    enabled: Boolean(referralLink),
  })

  const [imgError, setImgError] = useState(false)
  const imageUrl = affiliate ? `/api/affiliate-promo-image/${affiliate.referral_code}` : ''

  if (!materials) return <p className="text-sm text-base-400">Loading…</p>

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-base-300">
          <Facebook size={15} /> Facebook Post
        </h2>
        <div className="whitespace-pre-wrap rounded-lg bg-base-850 p-4 text-sm text-base-200">
          {materials.facebook_post || <span className="text-base-500">No Facebook post template configured yet.</span>}
        </div>
        {materials.facebook_post && (
          <div className="mt-3 flex justify-end">
            <CopyButton text={materials.facebook_post} label="Copy Post Text" />
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-base-300">
          <Mail size={15} /> Email
        </h2>
        <div className="rounded-lg bg-base-850 p-4 text-sm">
          <p className="mb-2 font-medium text-base-100">{materials.email_subject || <span className="text-base-500">No subject configured.</span>}</p>
          <p className="whitespace-pre-wrap text-base-300">{materials.email_body || <span className="text-base-500">No email body configured.</span>}</p>
        </div>
        {(materials.email_subject || materials.email_body) && (
          <div className="mt-3 flex justify-end">
            <CopyButton text={`${materials.email_subject}\n\n${materials.email_body}`} label="Copy Email" />
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-base-300">
          <ImageIcon size={15} /> Promotional Image
        </h2>
        {!imgError ? (
          <img
            src={imageUrl}
            alt="Promotional graphic with your referral link and QR code"
            className="w-full max-w-lg rounded-lg border border-base-700/60"
            onError={() => setImgError(true)}
          />
        ) : (
          <p className="text-sm text-base-500">Image could not be loaded.</p>
        )}
        <div className="mt-3">
          <a href={imageUrl} download={`referral-${affiliate?.referral_code}.png`} className="btn-secondary inline-flex">
            <Download size={14} /> Download Image
          </a>
        </div>
      </div>
    </div>
  )
}
