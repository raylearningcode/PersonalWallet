import type { RecurringFrequency, RecurringRule } from '@/types'

function parseDateParts(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function compareDate(a: string, b: string) {
  return a.localeCompare(b)
}

export function addRecurringInterval(date: string, frequency: RecurringFrequency) {
  const { year, month, day } = parseDateParts(date)
  if (frequency === 'daily') {
    const next = new Date(Date.UTC(year, month - 1, day + 1))
    return formatDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
  }
  if (frequency === 'weekly') {
    const next = new Date(Date.UTC(year, month - 1, day + 7))
    return formatDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
  }
  if (frequency === 'yearly') {
    const nextYear = year + 1
    return formatDate(nextYear, month, Math.min(day, daysInMonth(nextYear, month)))
  }

  const totalMonths = year * 12 + month
  const nextYear = Math.floor(totalMonths / 12)
  const nextMonth = (totalMonths % 12) + 1
  return formatDate(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)))
}

export function getDueRecurringOccurrences(rule: RecurringRule, today = new Date().toISOString().slice(0, 10)) {
  if (!rule.active) return []
  const occurrences: string[] = []
  let dueDate = rule.next_due_date
  let paid = rule.installment_paid ?? 0

  while (compareDate(dueDate, today) <= 0) {
    if (rule.end_date && compareDate(dueDate, rule.end_date) > 0) break
    if (rule.installment_total && paid >= rule.installment_total) break
    occurrences.push(dueDate)
    paid += 1
    dueDate = addRecurringInterval(dueDate, rule.frequency)
  }

  return occurrences
}

export function getNextRecurringState(rule: RecurringRule, generatedCount: number) {
  let nextDueDate = rule.next_due_date
  for (let index = 0; index < generatedCount; index += 1) {
    nextDueDate = addRecurringInterval(nextDueDate, rule.frequency)
  }

  const installmentPaid = (rule.installment_paid ?? 0) + generatedCount
  const installmentComplete = Boolean(rule.installment_total && installmentPaid >= rule.installment_total)
  const dateComplete = Boolean(rule.end_date && compareDate(nextDueDate, rule.end_date) > 0)

  return {
    next_due_date: nextDueDate,
    installment_paid: installmentPaid,
    active: generatedCount > 0 ? !(installmentComplete || dateComplete) : rule.active,
  }
}
