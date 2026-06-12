export const FREQ_MONTHS: Record<string, number> = {
  daily: 30,
  weekly: 4.33,
  monthly: 1,
  yearly: 1 / 12,
}

export function getMonthlyImpact(amount: number, frequency: string): number {
  return amount * (FREQ_MONTHS[frequency] ?? 1)
}

export function getYearlyImpact(amount: number, frequency: string): number {
  return getMonthlyImpact(amount, frequency) * 12
}
