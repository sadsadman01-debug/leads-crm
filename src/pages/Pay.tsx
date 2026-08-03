import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, AlertCircle, ArrowLeft, Copy, Check, Smartphone, Landmark, Bitcoin, Wallet } from 'lucide-react'
import { paymentAccountsApi, signupRequestsApi, renewalPaymentsApi } from '@/lib/api'
import { usePlatformBranding } from '@/hooks/usePlatformBranding'
import { PAYOUT_METHOD_LABELS, type MfsDetails, type BankAccountDetails, type CryptoDetails } from '@/types/affiliate'
import type { PublicPaymentAccount, PaymentAccountMethodType } from '@/types/paymentAccount'
import { CopyButton } from '@/components/TempPasswordResult'

/** Prominently displayed at the top of the page (above the payment method
 * list) whether this is a signup or renewal payment — the reference code and
 * the warning beneath it look and behave identically in both contexts. */
function ReferenceCodeCard({ code }: { code: string }) {
  return (
    <div className="mb-6 rounded-xl border border-accent-500/40 bg-base-850 p-5 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-base-400">Your Payment Reference Code</p>
      <p className="mt-1 select-all font-mono text-3xl font-bold tracking-widest text-accent-400">{code}</p>
      <div className="mt-3 flex justify-center">
        <CopyButton text={code} label="Copy Reference Code" />
      </div>
      <p className="mt-4 text-xs text-warn">
        ⚠️ IMPORTANT: You MUST include this exact reference code when sending your payment (e.g., in the "Reference," "Note," or "Remarks" field of your
        bKash, Nagad, Rocket, or bank transfer). Payments received without this reference code cannot be matched to your account and may cause delays or
        rejection of your application/renewal.
      </p>
    </div>
  )
}

const METHOD_ICON: Record<PaymentAccountMethodType, typeof Smartphone> = {
  mfs: Smartphone,
  bank_account: Landmark,
  crypto: Bitcoin,
}

/** A compact, selectable row — full details are shown separately by
 * SelectedAccountDetails once picked, not dumped inline here. */
function PaymentAccountOption({
  account,
  selected,
  onSelect,
}: {
  account: PublicPaymentAccount
  selected: boolean
  onSelect: () => void
}) {
  const Icon = METHOD_ICON[account.method_type]
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
        selected ? 'border-accent-500 bg-accent-500/10' : 'border-base-700/60 bg-base-850 hover:bg-base-800'
      }`}
    >
      <input type="radio" name="payment-account" className="h-4 w-4 shrink-0 accent-accent-500" checked={selected} readOnly />
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
        <Icon size={16} />
      </span>
      <span className="text-sm font-medium text-base-100">{account.label}</span>
    </button>
  )
}

/** A single small "Copy" icon-button next to one field value. */
function CopyIconButton({ label, active, onCopy }: { label: string; active: boolean; onCopy: () => void }) {
  return (
    <button type="button" className="btn-ghost shrink-0 px-2 text-xs" onClick={onCopy} aria-label={`Copy ${label}`}>
      {active ? <Check size={13} className="text-success" /> : <Copy size={13} />}
    </button>
  )
}

/** Type-specific formatting for whichever account is currently selected —
 * MFS gets a large, easy-to-dial number; Bank gets per-field copy plus a
 * "copy all" block; Crypto gets a monospace address, a copy button, and a
 * scannable QR code (via the free, keyless api.qrserver.com image endpoint —
 * no npm dependency needed for a one-off image). */
function SelectedAccountDetails({ account }: { account: PublicPaymentAccount }) {
  const [copiedField, setCopiedField] = useState<string | null>(null)

  async function copy(field: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1800)
    } catch {
      // Clipboard access can be denied by the browser — the details are
      // already visible on-screen either way, so this is a soft failure.
    }
  }

  if (account.method_type === 'mfs') {
    const d = account.details as MfsDetails
    return (
      <div className="rounded-xl border border-accent-500/40 bg-base-850 p-5 text-center">
        <p className="text-xs uppercase tracking-wide text-base-400">Provider</p>
        <p className="text-lg font-semibold text-base-100">{d.provider}</p>
        <p className="mt-4 text-xs uppercase tracking-wide text-base-400">Number</p>
        <p className="text-3xl font-bold tracking-wide text-base-100">{d.account_number}</p>
        {d.account_holder_name && <p className="mt-2 text-xs text-base-500">Account Holder: {d.account_holder_name}</p>}
        <button type="button" className="btn-secondary mt-4" onClick={() => copy('number', d.account_number)}>
          {copiedField === 'number' ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          {copiedField === 'number' ? 'Copied' : 'Copy Number'}
        </button>
      </div>
    )
  }

  if (account.method_type === 'bank_account') {
    const d = account.details as BankAccountDetails
    const fields: Array<[string, string]> = [
      ['Account Holder Name', d.account_holder_name],
      ['Bank Name', d.bank_name],
      ['Branch Name', d.branch_name],
      ['Account Number', d.account_number],
      ['Routing Number', d.routing_number],
    ]
    const allText = fields.map(([label, value]) => `${label}: ${value}`).join('\n')
    return (
      <div className="rounded-xl border border-accent-500/40 bg-base-850 p-5">
        <div className="space-y-3">
          {fields.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-base-500">{label}</p>
                <p className="truncate font-mono text-sm text-base-100">{value}</p>
              </div>
              <CopyIconButton label={label} active={copiedField === label} onCopy={() => copy(label, value)} />
            </div>
          ))}
        </div>
        <button type="button" className="btn-secondary mt-4 w-full" onClick={() => copy('all', allText)}>
          {copiedField === 'all' ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          {copiedField === 'all' ? 'Copied' : 'Copy All Bank Details'}
        </button>
      </div>
    )
  }

  const d = account.details as CryptoDetails
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(d.wallet_address)}`
  return (
    <div className="rounded-xl border border-accent-500/40 bg-base-850 p-5">
      <p className="text-xs uppercase tracking-wide text-base-400">Network</p>
      <p className="text-lg font-semibold text-base-100">{d.network}</p>
      <p className="mb-1 mt-4 text-xs uppercase tracking-wide text-base-400">Wallet Address</p>
      <p className="break-all font-mono text-sm text-base-100">{d.wallet_address}</p>
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <img src={qrUrl} alt="Wallet address QR code" width={160} height={160} className="h-[160px] w-[160px] shrink-0 rounded-lg bg-white p-2" />
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <button type="button" className="btn-secondary" onClick={() => copy('wallet', d.wallet_address)}>
            {copiedField === 'wallet' ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            {copiedField === 'wallet' ? 'Copied' : 'Copy Wallet Address'}
          </button>
          <p className="text-xs text-warn">Double-check the network before sending — the wrong network can lose funds.</p>
        </div>
      </div>
    </div>
  )
}

export function Pay() {
  usePlatformBranding()
  const [searchParams] = useSearchParams()
  // The ?token= value is a dedicated non-guessable payment_token, never the
  // signup request's real database id — see migrations 045/046. ?renewal_token=
  // is the equivalent for a renewal_payment_requests row — the two are
  // mutually exclusive on any given /pay link.
  const paymentToken = searchParams.get('token')?.trim() || null
  const renewalToken = searchParams.get('renewal_token')?.trim() || null
  const isRenewal = Boolean(renewalToken)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['public-payment-accounts'],
    queryFn: paymentAccountsApi.getPublicList,
  })
  const accounts = accountsData?.accounts ?? []
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null

  const {
    data: request,
    isLoading: requestLoading,
    isError: requestIsError,
  } = useQuery({
    queryKey: ['public-signup-request', paymentToken],
    queryFn: () => signupRequestsApi.getPublicForPayment(paymentToken!),
    enabled: Boolean(paymentToken),
    retry: false,
  })

  const {
    data: renewal,
    isLoading: renewalLoading,
    isError: renewalIsError,
  } = useQuery({
    queryKey: ['public-renewal-payment', renewalToken],
    queryFn: () => renewalPaymentsApi.getPublicForPayment(renewalToken!),
    enabled: Boolean(renewalToken),
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: () => signupRequestsApi.submitPaymentMethod(paymentToken!, selectedAccountId!),
  })

  const grouped = (['mfs', 'bank_account', 'crypto'] as PaymentAccountMethodType[])
    .map((type) => ({ type, accounts: accounts.filter((a) => a.method_type === type) }))
    .filter((g) => g.accounts.length > 0)

  // Two legitimate, distinct in-progress states now that requests start as
  // "awaiting_payment" and only become "pending" once a method is confirmed
  // — a fresh token is awaiting_payment (the confirm flow below applies),
  // while pending means they already confirmed once (nothing left to do here
  // but reassure them). Only a missing/invalid token or a truly final
  // approved/rejected status shows the generic "no longer valid" message.
  const isAwaitingPayment = request?.status === 'awaiting_payment'
  const isAlreadyConfirmed = request?.status === 'pending'
  const isResolvedOrInvalid =
    !isRenewal &&
    Boolean(paymentToken) &&
    !requestLoading &&
    (requestIsError || (request && (request.status === 'approved' || request.status === 'rejected')))
  const isRenewalAlreadyConfirmed = isRenewal && renewal?.status === 'confirmed'
  const isRenewalInvalid = isRenewal && !renewalLoading && renewalIsError
  const showAmount = isRenewal ? Boolean(renewal) && !isRenewalAlreadyConfirmed : Boolean(request) && (isAwaitingPayment || isAlreadyConfirmed)
  const canSubmitSelection = !isRenewal && Boolean(paymentToken) && isAwaitingPayment
  const referenceCode = isRenewal ? renewal?.payment_reference_code : request?.payment_reference_code

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

        {paymentToken && requestLoading && <p className="text-center text-sm text-base-400">Loading your request…</p>}
        {renewalToken && renewalLoading && <p className="text-center text-sm text-base-400">Loading your renewal…</p>}

        {referenceCode && !isResolvedOrInvalid && !isRenewalInvalid && <ReferenceCodeCard code={referenceCode} />}

        {showAmount && !isRenewal && request && (
          <div className="mb-6 rounded-xl border border-accent-500/40 bg-gradient-to-br from-accent-500/15 to-accent-500/5 p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-base-400">Amount to Pay</p>
            <p className="mt-1 text-2xl font-semibold text-base-100">
              {request.final_price_bdt != null ? `৳${request.final_price_bdt}` : '—'}
              {request.billing_cycle === 'annual' && <span className="ml-1 text-sm font-normal text-base-400">/year</span>}
              {request.billing_cycle === 'monthly' && <span className="ml-1 text-sm font-normal text-base-400">/month</span>}
            </p>
            <p className="mt-1 text-xs text-base-500">For {request.organization_name}</p>
          </div>
        )}

        {showAmount && isRenewal && renewal && (
          <div className="mb-6 rounded-xl border border-accent-500/40 bg-gradient-to-br from-accent-500/15 to-accent-500/5 p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-base-400">Amount to Pay</p>
            <p className="mt-1 text-2xl font-semibold text-base-100">৳{renewal.amount_bdt}</p>
            {renewal.organization_name && <p className="mt-1 text-xs text-base-500">For {renewal.organization_name}</p>}
          </div>
        )}

        {isRenewal ? (
          isRenewalInvalid ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-base-700/60 bg-base-850 p-8 text-center">
              <AlertCircle size={24} className="text-base-500" />
              <p className="text-sm text-base-300">This payment link is no longer valid.</p>
            </div>
          ) : isRenewalAlreadyConfirmed ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-success/40 bg-success-bg p-6 text-center">
              <CheckCircle2 size={28} className="text-success" />
              <p className="text-sm text-base-100">This renewal has already been confirmed. Thanks!</p>
            </div>
          ) : accountsLoading ? (
            <p className="text-center text-sm text-base-400">Loading payment methods…</p>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-base-700/60 bg-base-850 p-8 text-center">
              <AlertCircle size={24} className="text-base-500" />
              <p className="text-sm text-base-300">No payment methods are currently available. Please contact us directly.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.type}>
                  <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-base-400">
                    {PAYOUT_METHOD_LABELS[group.type]}
                  </h2>
                  <div className="space-y-2">
                    {group.accounts.map((account) => (
                      <PaymentAccountOption
                        key={account.id}
                        account={account}
                        selected={selectedAccountId === account.id}
                        onSelect={() => setSelectedAccountId(account.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {selectedAccount && <SelectedAccountDetails account={selectedAccount} />}
            </div>
          )
        ) : isResolvedOrInvalid ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-base-700/60 bg-base-850 p-8 text-center">
            <AlertCircle size={24} className="text-base-500" />
            <p className="text-sm text-base-300">This payment link is no longer valid or has already been processed.</p>
          </div>
        ) : isAlreadyConfirmed ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-success/40 bg-success-bg p-6 text-center">
            <CheckCircle2 size={28} className="text-success" />
            <p className="text-sm text-base-100">
              You've already confirmed your payment method for this request. Our team will verify and activate your account shortly.
            </p>
          </div>
        ) : accountsLoading ? (
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
                <div className="space-y-2">
                  {group.accounts.map((account) => (
                    <PaymentAccountOption
                      key={account.id}
                      account={account}
                      selected={selectedAccountId === account.id}
                      onSelect={() => setSelectedAccountId(account.id)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {selectedAccount && <SelectedAccountDetails account={selectedAccount} />}

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
