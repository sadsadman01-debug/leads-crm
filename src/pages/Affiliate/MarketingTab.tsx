import { useQuery } from '@tanstack/react-query'
import { Facebook, Mail, Sparkles } from 'lucide-react'
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
          <Sparkles size={15} /> AI Image Prompt
        </h2>
        <p className="mb-3 text-sm text-base-400">
          Paste this into Gemini, ChatGPT, or any AI image generator to create a professional, click-worthy promotional
          image for your referral link.
        </p>
        <div className="whitespace-pre-wrap rounded-lg bg-base-850 p-4 text-sm text-base-200">{materials.image_prompt}</div>
        <div className="mt-3 flex justify-end">
          <CopyButton text={materials.image_prompt} label="Copy Prompt" />
        </div>
      </div>
    </div>
  )
}
