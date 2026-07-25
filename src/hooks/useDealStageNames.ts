import { useQuery } from '@tanstack/react-query'
import { dealStagesApi } from '@/lib/api'

export function useDealStageNames(): Map<string, string> {
  const { data } = useQuery({ queryKey: ['deal-stages'], queryFn: dealStagesApi.list })
  return new Map((data?.stages ?? []).map((s) => [s.id, s.name]))
}
