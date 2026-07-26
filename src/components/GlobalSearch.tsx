import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Loader2, X } from 'lucide-react'
import { searchApi, pipelineStagesApi, dealStagesApi } from '@/lib/api'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatMaskedCurrency } from '@/lib/currency'
import { Badge } from '@/components/ui/Badge'
import { RoleBadge } from '@/components/ui/RoleBadge'
import type { SearchDealResult, SearchLeadResult, SearchTeamMemberResult } from '@/types/search'

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent)

type FlatItem =
  | { kind: 'lead'; item: SearchLeadResult }
  | { kind: 'deal'; item: SearchDealResult }
  | { kind: 'team'; item: SearchTeamMemberResult }

export function GlobalSearch() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const desktopInputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [showSpinner, setShowSpinner] = useState(false)

  const debounced = useDebouncedValue(query, 250)
  const trimmed = debounced.trim()
  const enabled = trimmed.length >= 2

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', trimmed],
    queryFn: () => searchApi.query(trimmed),
    enabled,
    staleTime: 10_000,
  })

  const { data: stagesData } = useQuery({ queryKey: ['pipeline-stages'], queryFn: pipelineStagesApi.list, enabled: panelOpen || mobileOpen })
  const stageNameById = new Map((stagesData?.stages ?? []).map((s) => [s.id, s.name]))
  const { data: dealStagesData } = useQuery({ queryKey: ['deal-stages'], queryFn: dealStagesApi.list, enabled: panelOpen || mobileOpen })
  const dealStageNameById = new Map((dealStagesData?.stages ?? []).map((s) => [s.id, s.name]))

  const leads = data?.leads.results ?? []
  const deals = data?.deals.results ?? []
  const team = data?.teamMembers.results ?? []
  const flat: FlatItem[] = [
    ...leads.map((item): FlatItem => ({ kind: 'lead', item })),
    ...deals.map((item): FlatItem => ({ kind: 'deal', item })),
    ...team.map((item): FlatItem => ({ kind: 'team', item })),
  ]
  const hasAnyResults = flat.length > 0

  useEffect(() => setHighlighted(0), [trimmed])

  useEffect(() => {
    if (!isFetching) {
      setShowSpinner(false)
      return
    }
    const timer = setTimeout(() => setShowSpinner(true), 300)
    return () => clearTimeout(timer)
  }, [isFetching])

  function openAndFocus() {
    setPanelOpen(true)
    setMobileOpen(true)
    requestAnimationFrame(() => {
      desktopInputRef.current?.focus()
      mobileInputRef.current?.focus()
    })
  }

  function closeAndReset() {
    setPanelOpen(false)
    setMobileOpen(false)
    setQuery('')
  }

  // Global Cmd+K / Ctrl+K shortcut — works from anywhere in the app.
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openAndFocus()
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Same outside-click/Escape-to-close pattern established for the Notification panel.
  useEffect(() => {
    if (!panelOpen && !mobileOpen) return
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
        setMobileOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPanelOpen(false)
        setMobileOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [panelOpen, mobileOpen])

  function selectItem(flatItem: FlatItem) {
    if (flatItem.kind === 'lead') navigate(`/leads/${flatItem.item.id}`)
    else if (flatItem.kind === 'deal') navigate('/deals', { state: { openDealId: flatItem.item.id } })
    else navigate('/team', { state: { highlightMemberId: flatItem.item.id } })
    closeAndReset()
  }

  function seeAllLeads() {
    navigate('/leads', { state: { prefillSearch: trimmed } })
    closeAndReset()
  }
  function seeAllDeals() {
    navigate('/deals')
    closeAndReset()
  }
  function seeAllTeam() {
    navigate('/team')
    closeAndReset()
  }

  function handleInputKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, Math.max(flat.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flat[highlighted]) selectItem(flat[highlighted])
    }
  }

  const showPanel = (panelOpen || mobileOpen) && enabled

  function resultsBody() {
    if (!data) return null
    if (showSpinner) {
      return (
        <div className="flex items-center justify-center gap-2 p-8 text-sm text-base-400">
          <Loader2 size={16} className="animate-spin" />
          Searching…
        </div>
      )
    }
    if (!hasAnyResults) {
      return <p className="p-8 text-center text-sm text-base-400">No results found for "{trimmed}"</p>
    }

    let cursor = 0
    return (
      <div className="max-h-[70vh] overflow-y-auto py-2">
        {leads.length > 0 && (
          <ResultSection title="Leads">
            {leads.map((lead) => {
              const index = cursor++
              return (
                <LeadResultRow
                  key={lead.id}
                  lead={lead}
                  stageName={lead.stage_id ? stageNameById.get(lead.stage_id) : undefined}
                  highlighted={highlighted === index}
                  onClick={() => selectItem({ kind: 'lead', item: lead })}
                />
              )
            })}
            {data.leads.total > leads.length && (
              <SeeAllLink count={data.leads.total} onClick={seeAllLeads} />
            )}
          </ResultSection>
        )}

        {deals.length > 0 && (
          <ResultSection title="Deals">
            {deals.map((deal) => {
              const index = cursor++
              return (
                <DealResultRow
                  key={deal.id}
                  deal={deal}
                  stageName={deal.stage_id ? dealStageNameById.get(deal.stage_id) : undefined}
                  highlighted={highlighted === index}
                  onClick={() => selectItem({ kind: 'deal', item: deal })}
                />
              )
            })}
            {data.deals.total > deals.length && (
              <SeeAllLink count={data.deals.total} onClick={seeAllDeals} />
            )}
          </ResultSection>
        )}

        {team.length > 0 && (
          <ResultSection title="Team Members">
            {team.map((member) => {
              const index = cursor++
              return (
                <TeamResultRow
                  key={member.id}
                  member={member}
                  highlighted={highlighted === index}
                  onClick={() => selectItem({ kind: 'team', item: member })}
                />
              )
            })}
            {data.teamMembers.total > team.length && (
              <SeeAllLink count={data.teamMembers.total} onClick={seeAllTeam} />
            )}
          </ResultSection>
        )}
      </div>
    )
  }

  return (
    <div className="relative flex min-w-0 flex-1 items-center justify-center" ref={containerRef}>
      {/* Desktop/tablet — always-visible input */}
      <div className="relative hidden w-full max-w-md md:block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-400" />
        <input
          ref={desktopInputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPanelOpen(true)
          }}
          onFocus={() => setPanelOpen(true)}
          onKeyDown={handleInputKeyDown}
          placeholder="Search leads, deals, team…"
          className="input pl-9 pr-16 text-sm"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-base-600 bg-base-800 px-1.5 py-0.5 text-[10px] font-medium text-base-400">
          {IS_MAC ? '⌘K' : 'Ctrl K'}
        </kbd>

        {showPanel && (
          <div className="absolute left-0 top-full z-50 mt-2 w-full min-w-[420px] rounded-xl border border-base-700/60 bg-base-900 shadow-lg animate-fadeIn">
            {resultsBody()}
          </div>
        )}
      </div>

      {/* Mobile — icon trigger */}
      <button onClick={openAndFocus} className="btn-ghost h-11 w-11 px-0 md:hidden" aria-label="Search">
        <Search size={20} />
      </button>

      {/* Mobile — full-screen overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-base-900 md:hidden">
          <div className="flex shrink-0 items-center gap-2 border-b border-base-700/60 p-3">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-400" />
              <input
                ref={mobileInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Search leads, deals, team…"
                className="input pl-9"
              />
            </div>
            <button onClick={closeAndReset} className="btn-ghost h-11 w-11 px-0" aria-label="Close search">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {enabled ? resultsBody() : <p className="p-8 text-center text-sm text-base-400">Type at least 2 characters to search.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function ResultSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-1 last:mb-0">
      <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-base-500">{title}</p>
      {children}
    </div>
  )
}

function SeeAllLink({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center px-4 py-2 text-left text-xs font-medium text-accent-400 hover:bg-base-850"
    >
      See all {count} results
    </button>
  )
}

function ResultRowShell({
  highlighted,
  onClick,
  children,
}: {
  highlighted: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
        highlighted ? 'bg-base-850' : 'hover:bg-base-850'
      }`}
    >
      {children}
    </button>
  )
}

function LeadResultRow({
  lead,
  stageName,
  highlighted,
  onClick,
}: {
  lead: SearchLeadResult
  stageName: string | undefined
  highlighted: boolean
  onClick: () => void
}) {
  return (
    <ResultRowShell highlighted={highlighted} onClick={onClick}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-base-100">{lead.company_name}</p>
        <p className="truncate text-xs text-base-400">{lead.contact_name || lead.email || lead.phone || '—'}</p>
      </div>
      {stageName && <Badge tone="neutral">{stageName}</Badge>}
    </ResultRowShell>
  )
}

function DealResultRow({
  deal,
  stageName,
  highlighted,
  onClick,
}: {
  deal: SearchDealResult
  stageName: string | undefined
  highlighted: boolean
  onClick: () => void
}) {
  return (
    <ResultRowShell highlighted={highlighted} onClick={onClick}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-base-100">{deal.name}</p>
        <p className="truncate text-xs text-base-400">{deal.lead?.company_name ?? '—'}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs font-semibold text-accent-400">{formatMaskedCurrency(deal.value, deal.currency)}</span>
        {stageName && <Badge tone="neutral">{stageName}</Badge>}
      </div>
    </ResultRowShell>
  )
}

function TeamResultRow({
  member,
  highlighted,
  onClick,
}: {
  member: SearchTeamMemberResult
  highlighted: boolean
  onClick: () => void
}) {
  return (
    <ResultRowShell highlighted={highlighted} onClick={onClick}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-base-100">{member.nickname || member.email}</p>
        <p className="truncate text-xs text-base-400">{member.email}</p>
      </div>
      <RoleBadge role={member.role} />
    </ResultRowShell>
  )
}
