import type { RecurringRule } from '@/types'
import { addRecurringInterval } from './recurring'

// RFC 5545 requires CRLF line endings.
const CRLF = '\r\n'

// Add one day with UTC-safe math: build from the YYYY-MM-DD parts, shift by ms, read
// back UTC parts — never parses a local-time string that could drift across DST.
function addUtcDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * 86400000)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

export function generateICalEvent(rule: RecurringRule, currency: string): string {
  const id = `finpath-${rule.id}@finpath.app`
  const created = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const dtstamp = created

  // Generate recurring events (up to 1 year from start date)
  const events: string[] = []
  let currentDateStr = rule.next_due_date
  const endDateStr = addUtcDays(rule.next_due_date, 365)

  // Limit to 12 occurrences for preview
  let count = 0
  while (currentDateStr <= endDateStr && count < 12) {
    const dtstart = currentDateStr.replace(/-/g, '')
    const nextDate = addUtcDays(currentDateStr, 1).replace(/-/g, '')
    const description = `${rule.description} (${currency} ${rule.amount})`

    events.push([
      'BEGIN:VEVENT',
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${nextDate}`,
      `DTSTAMP:${dtstamp}`,
      `UID:${id}-${currentDateStr}`,
      `SUMMARY:${escapeICalValue(rule.description)}`,
      `DESCRIPTION:${escapeICalValue(description)}`,
      'LOCATION:FinPath',
      'CATEGORIES:Financial',
      'STATUS:CONFIRMED',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    ].join(CRLF))

    currentDateStr = addRecurringInterval(currentDateStr, rule.frequency)
    count++
  }

  return events.join(CRLF)
}

export function exportRulesToICal(rules: RecurringRule[], currency: string): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const calId = 'finpath-calendar@finpath.app'

  const events = rules
    .filter(r => r.active && r.type !== 'income')
    .map(rule => generateICalEvent(rule, currency))
    .join(CRLF)

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FinPath//FinPath Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:FinPath Recurring Bills',
    'X-WR-TIMEZONE:UTC',
    'X-WR-CALDESC:Your recurring bills and subscriptions from FinPath',
    `DTSTAMP:${now}`,
    `UID:${calId}`,
    events,
    'END:VCALENDAR',
  ].join(CRLF)
}

function escapeICalValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export function downloadICal(ical: string, filename: string = 'finpath-recurring-bills.ics'): void {
  const blob = new Blob([ical], { type: 'text/calendar;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

export function copyICalToClipboard(ical: string): Promise<void> {
  return navigator.clipboard.writeText(ical)
}
