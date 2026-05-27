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

interface InvestmentPlanInput {
  monthlyContribution: number
  annualReturnRate: number
  durationYears: number
  initialCapital: number
}

export function calculateInvestmentPlan({
  monthlyContribution,
  annualReturnRate,
  durationYears,
  initialCapital,
}: InvestmentPlanInput): {
  projectedPortfolio: number
  totalContributed: number
  totalInvested: number
  projectedGain: number
} {
  const r = annualReturnRate / 100 / 12
  const n = durationYears * 12
  const principalGrowth = r === 0 ? initialCapital : initialCapital * Math.pow(1 + r, n)
  const contributionGrowth = calculateProjectedValue(monthlyContribution, annualReturnRate, durationYears)
  const projectedPortfolio = principalGrowth + contributionGrowth
  const totalContributed = monthlyContribution * n
  const totalInvested = initialCapital + totalContributed

  return {
    projectedPortfolio,
    totalContributed,
    totalInvested,
    projectedGain: projectedPortfolio - totalInvested,
  }
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
