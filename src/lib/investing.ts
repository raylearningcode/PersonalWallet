export function calculateProjectedValue(
  monthlyContribution: number,
  annualReturnRate: number,
  durationYears: number
): number {
  if (monthlyContribution === 0) return 0
  const r = annualReturnRate / 100 / 12
  const n = durationYears * 12
  if (r === 0) return monthlyContribution * n
  return monthlyContribution * ((Math.pow(1 + r, n) - 1) / r)
}

export function generateGrowthData(
  monthlyContribution: number,
  annualReturnRate: number,
  durationYears: number
): { year: number; value: number; contributed: number }[] {
  return Array.from({ length: durationYears + 1 }, (_, i) => ({
    year: i,
    value: Math.round(calculateProjectedValue(monthlyContribution, annualReturnRate, i)),
    contributed: monthlyContribution * i * 12,
  }))
}
