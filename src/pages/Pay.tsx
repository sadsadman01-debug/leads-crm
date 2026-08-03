import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, AlertCircle, ArrowLeft, Copy, Check, Smartphone, Landmark, Bitcoin, Wallet } from 'lucide-react'
import { paymentAccountsApi, signupRequestsApi } from '@/lib/api'
import { usePlatformBranding } from '@/hooks/usePlatformBranding'
import { PAYOUT_METHOD_LABELS, type MfsDetails, type BankAccountDetails, type CryptoDetails } from '@/types/affiliate'
import type { PublicPaymentAccount, PaymentAccountMethodType } from '@/types/paymentAccount'

const METHOD_ICON: Record<PaymentAccountMethodType, typeof Smartphone> = {
  mfs: Smartphone,
  bank_account: Landmark,
  crypto: Bitcoin,
}

function detailLines(methodType: PaymentAccountMethodType, details: Record<string, any>): Array<[string, string]> {
  if (methodType === 'mfs') {
    const d = details as MfsDetails
    const lines: Array<[string, string]> = [['Provider', d.provider], ['Account/Phone Number', d.account_number]]
    if (d.account_holder_name) lines.push(['Account Holder Name', d.account_holder_name])
    return lines
  }
  if (methodType === 'bank_account') {
    const d = details as BankAccountDetails
    return [
      ['Account Holder Name', d.account_holder_name],
      ['Bank Name', d.bank_name],
      ['Branch Name', d.branch_name],
      ['Account Number', d.account_number],
      ['Routing Number', d.routing_number],
    ]
  }
  const d = details as CryptoDetails
  return [['Network', d.network], ['Wallet Address', d.wallet_address]]
}

function PaymentAccountCard({
  account,
  selected,
  onSelect,
}: {
  account: PublicPaymentAccount
  selected: boolean
  onSelect: (() => void) | null
}) {
  const [copied, setCopied] = useState(false)
  const Icon = METHOD_ICON[account.method_type]
  const lines = detailLines(account.method_type, account.details)

  async function handleCopy() {
    const text = lines.map(([label, value]) => `${label}: ${value}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard access can be denied by the browser — the details are
      // already visible on-screen either way, so this is a soft failure.
    }
  }

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        selected ? 'border-accent-500 bg-accent-500/10' : 'border-base-700/60 bg-base-850'
      }`}
    >
      <div className="flex items-start gap-3">
        {onSelect && (
          <input
            type="radio"
            name="payment-account"
            className="mt-1 h-4 w-4 accent-accent-500"
            checked={selected}
            onChange={onSelect}
          />
        )}
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-base-100">{account.label}</p>
          <div className="mt-2 space-y-1 text-sm">
            {lines.map(([label, value]) => (
              <p key={label}>
                <span className="text-base-500">{label}:</span>{' '}
                <span className="break-all font-mono text-base-200">{value}</span>
              </p>
            ))}
          </div>
          <button type="button" className="btn-ghost mt-3 px-2 text-xs" onClick={handleCopy}>
            {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy Details'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Pay() {
  usePlatformBranding()
  const [searchParams] = useSearchParams()
  const requestId = searchParams.get('request')?.trim() || null
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['public-payment-accounts'],
    queryFn: paymentAccountsApi.getPublicList,
  })
  const accounts = accountsData?.accounts ?? []

  const { data: request, isLoading: requestLoading } = useQuery({
    queryKey: ['public-signup-request', requestId],
    queryFn: () => signupRequestsApi.getPublicForPayment(requestId!),
    enabled: Boolean(requestId),
  })

  const mutation = useMutation({
    mutationFn: () => signupRequestsApi.submitPaymentMethod(requestId!, selectedAccountId!),
  })

  const grouped = (['mfs', 'bank_account', 'crypto'] as PaymentAccountMethodType[])
    .map((type) => ({ type, accounts: accounts.filter((a) => a.method_type === type) }))
    .filter((g) => g.accounts.length > 0)

  const canSubmitSelection = Boolean(requestId) && request?.status === 'pending'

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base-950 px-4 py-8 animate-fadeIn">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse 60% 50% at 50% 40%, black 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 60% 50% at 50% 40%, black 20%, transparent 75%)',
          }}
        />
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/10 blur-[120px]" />
      </div>

      <div className="card relative w-full max-w-xl p-8 animate-slideUp">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500 shadow-glow">
            <Wallet size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold text-base-100">Complete Your Payment</h1>
          <p className="mt-1 text-sm text-base-400">Send your payment using any method below, then confirm which one you used.</p>
        </div>

        {requestId && requestLoading && <p className="text-center text-sm text-base-400">Loading your request…</p>}

        {requestId && !requestLoading && request && (
          <div className="mb-6 rounded-xl border border-accent-500/40 bg-gradient-to-br from-accent-500/15 to-accent-500/5 p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-base-400">Amount to Pay</p>
            <p className="mt-1 text-2xl font-semibold text-base-100">
              {request.final_price_bdt != null ? `৳${request.final_price_bdt}` : '—'}
              {request.billing_cycle === 'annual' && <span className="ml-1 text-sm font-normal text-base-400">/year</span>}
              {request.billing_cycle === 'monthly' && <span className="ml-1 text-sm font-normal text-base-400">/month</span>}
            </p>
            <p className="mt-1 text-xs text-base-500">For {request.organization_name}</p>
            {request.status !== 'pending' && (
              <p className="mt-2 text-xs text-warn">
                {request.status === 'approved'
                  ? 'This request has already been approved — no further action needed here.'
                  : 'This request was not approved. Please contact us if you believe this is a mistake.'}
              </p>
            )}
          </div>
        )}

        {accountsLoading ? (
          <p className="text-center text-sm text-base-400">Loading payment methods…</p>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-base-700/60 bg-base-850 p-8 text-center">
            <AlertCircle size={24} className="text-base-500" />
            <p className="text-sm text-base-300">No payment methods are currently available. Please contact us directly.</p>
          </div>
        ) : mutation.isSuccess ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-success/40 bg-success-bg p-6 text-center">
            <CheckCircle2 size={28} className="text-success" />
            <p className="text-sm text-base-100">
              Thanks! We've noted your payment method. Our team will verify and activate your account shortly.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <div key={group.type}>
                <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-base-400">
                  {PAYOUT_METHOD_LABELS[group.type]}
                </h2>
                <div className="space-y-3">
                  {group.accounts.map((account) => (
                    <PaymentAccountCard
                      key={account.id}
                      account={account}
                      selected={selectedAccountId === account.id}
                      onSelect={canSubmitSelection ? () => setSelectedAccountId(account.id) : null}
                    />
                  ))}
                </div>
              </div>
            ))}

            {canSubmitSelection && (
              <div className="border-t border-base-700/60 pt-5">
                <p className="mb-3 text-sm font-medium text-base-200">Select the method you used to pay, then confirm below.</p>
                {mutation.isError && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
                    <AlertCircle size={16} className="shrink-0" />
                    {(mutation.error as Error).message}
                  </div>
                )}
                <button
                  className="btn-primary w-full"
                  disabled={!selectedAccountId || mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending ? 'Submitting…' : "I've Completed My Payment"}
                </button>
              </div>
            )}
          </div>
        )}

        <Link to="/login" className="btn-ghost mt-6 w-full justify-center">
          <ArrowLeft size={16} />
          Back to Sign In
        </Link>
      </div>
    </div>
  )
}
