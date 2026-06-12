export type StreakData = { current: number; longest: number }

export function computeStreak(transactionDates: string[]): StreakData {
  if (transactionDates.length === 0) return { current: 0, longest: 0 }

  const unique = [...new Set(transactionDates)].sort().reverse() // newest first
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  // Current streak: consecutive days ending today or yesterday
  let current = 0
  if (unique[0] === today || unique[0] === yesterday) {
    current = 1
    for (let i = 1; i < unique.length; i++) {
      const msA = new Date(unique[i - 1]).getTime()
      const msB = new Date(unique[i]).getTime()
      if (Math.round((msA - msB) / 86400000) === 1) current++
      else break
    }
  }

  // Longest streak across all history
  let longest = current
  let run = 1
  for (let i = 1; i < unique.length; i++) {
    const msA = new Date(unique[i - 1]).getTime()
    const msB = new Date(unique[i]).getTime()
    if (Math.round((msA - msB) / 86400000) === 1) {
      run++
      if (run > longest) longest = run
    } else {
      run = 1
    }
  }

  return { current, longest }
}
