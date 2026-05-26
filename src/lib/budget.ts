export type RiskLevel = 'Low' | 'Medium' | 'High'

export function getOverspendRisk(remaining: number, total: number): RiskLevel {
  const pct = remaining / total
  if (pct > 0.4) return 'Low'
  if (pct > 0.2) return 'Medium'
  return 'High'
}

export function getCategoryUsedPct(spent: number, allocated: number): number {
  if (allocated === 0) return 0
  return Math.min(100, Math.round((spent / allocated) * 100))
}
