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

/** Adjust a future value for inflation to get today's purchasing power */
export function adjustForInflation(futureValue: number, years: number, inflationRate = 3): number {
  return futureValue / Math.pow(1 + inflationRate / 100, years)
}

/** Calculate projected value with inflation adjustment */
export function calculateProjectedValueReal(
  monthlyContribution: number,
  annualReturnRate: number,
  durationYears: number,
  inflationRate = 3
): number {
  const nominal = calculateProjectedValue(monthlyContribution, annualReturnRate, durationYears)
  return adjustForInflation(nominal, durationYears, inflationRate)
}

/** Generate growth data with both nominal and real (inflation-adjusted) values */
export function generateGrowthDataWithInflation(
  monthlyContribution: number,
  annualReturnRate: number,
  durationYears: number,
  inflationRate = 3
): { year: number; value: number; realValue: number; contributed: number }[] {
  return Array.from({ length: durationYears + 1 }, (_, i) => ({
    year: i,
    value: Math.round(calculateProjectedValue(monthlyContribution, annualReturnRate, i)),
    realValue: Math.round(calculateProjectedValueReal(monthlyContribution, annualReturnRate, i, inflationRate)),
    contributed: monthlyContribution * i * 12,
  }))
}
