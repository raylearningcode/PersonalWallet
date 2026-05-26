export function calculateSavingsRate(totalIncome: number, totalExpenses: number): number {
  if (totalIncome === 0) return 0
  const rate = (totalIncome - totalExpenses) / totalIncome * 100
  return Math.max(0, Math.round(rate * 10) / 10)
}
