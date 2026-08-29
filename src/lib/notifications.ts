import type { Transaction, BudgetCategory, RecurringRule, Goal } from '@/types/index'
import { LocalNotifications } from '@capacitor/local-notifications'
import { safeGet, toLocalDateStr } from './utils'

export type NotificationSeverity = 'critical' | 'warning' | 'info'

export type AppNotification = {
  id: string
  type: 'budget_over' | 'budget_warning' | 'bill_today' | 'bill_soon' | 'goal_stalled'
  title: string
  message: string
  severity: NotificationSeverity
}

/** Build a Date from 'YYYY-MM-DD' using LOCAL date parts (never UTC). */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = parseLocalDate(dateStr)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

/** Stable notification id derived from a rule id, so deleted rules cancel cleanly. */
export function ruleNotificationId(ruleId: string, kind: string): number {
  let h = 0
  for (const ch of `${kind}:${ruleId}`) h = (h * 31 + ch.charCodeAt(0)) | 0
  return 9000 + (Math.abs(h) % 90000)
}

const SCHEDULED_NOTIF_IDS_KEY = 'finpath_notif_ids'

function getScheduledNotificationIds(): number[] {
  const raw = safeGet(SCHEDULED_NOTIF_IDS_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : []
  } catch {
    return []
  }
}

function setScheduledNotificationIds(ids: number[]) {
  try {
    localStorage.setItem(SCHEDULED_NOTIF_IDS_KEY, JSON.stringify(ids))
  } catch {
    // Storage unavailable — ids will be re-derived on the next schedule
  }
}

export function computeNotifications(
  transactions: Transaction[],
  categories: BudgetCategory[],
  recurringRules: RecurringRule[],
  goals: Goal[],
  fmt: (n: number) => string,
): AppNotification[] {
  const notes: AppNotification[] = []
  const now = new Date()
  const monthStart = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1))

  // Budget alerts
  for (const cat of categories) {
    if (!cat.yearly_allocated || cat.yearly_allocated <= 0) continue
    const spent = transactions
      .filter(t => t.type !== 'income' && t.type !== 'transfer' && t.category === cat.name && t.date >= monthStart)
      .reduce((s, t) => s + t.amount, 0)
    // Yearly budgets are compared against their monthly-equivalent limit
    // (mirrors financeOs.getCategoryInsights semantics).
    const limit = cat.budget_period === 'yearly' ? cat.yearly_allocated / 12 : cat.yearly_allocated
    const pct = (spent / limit) * 100
    if (pct >= 100) {
      notes.push({
        id: `budget_over_${cat.id}`,
        type: 'budget_over',
        title: `${cat.name} budget exceeded`,
        message: `Spent ${fmt(spent)} — ${Math.round(pct - 100)}% over the ${fmt(limit)} limit.`,
        severity: 'critical',
      })
    } else if (pct >= 80) {
      notes.push({
        id: `budget_warn_${cat.id}`,
        type: 'budget_warning',
        title: `${cat.name} at ${Math.round(pct)}%`,
        message: `${fmt(limit - spent)} remaining this period.`,
        severity: 'warning',
      })
    }
  }

  // Upcoming bills
  for (const rule of recurringRules) {
    if (!rule.active || rule.type === 'income') continue
    const days = daysUntil(rule.next_due_date)
    if (days === 0) {
      notes.push({
        id: `bill_today_${rule.id}`,
        type: 'bill_today',
        title: `${rule.description} due today`,
        message: `${fmt(rule.amount)} payment is due today.`,
        severity: 'critical',
      })
    } else if (days > 0 && days <= 3) {
      notes.push({
        id: `bill_soon_${rule.id}`,
        type: 'bill_soon',
        title: `${rule.description} in ${days} day${days === 1 ? '' : 's'}`,
        message: `${fmt(rule.amount)} due on ${rule.next_due_date}.`,
        severity: 'warning',
      })
    }
  }

  // Goal stalled (>10% progress and created 60+ days ago with no recent contributions would require TX links)
  // Simple heuristic: goal has < 5% progress and was created 30+ days ago
  const thirtyDaysAgo = toLocalDateStr(new Date(Date.now() - 30 * 86400000))
  for (const goal of goals) {
    if (goal.current_amount >= goal.target_amount) continue
    const pct = goal.target_amount > 0 ? goal.current_amount / goal.target_amount : 0
    if (pct < 0.05 && goal.created_at && goal.created_at < thirtyDaysAgo) {
      notes.push({
        id: `goal_stalled_${goal.id}`,
        type: 'goal_stalled',
        title: `${goal.name} needs a contribution`,
        message: `Less than 5% funded — ${fmt(goal.target_amount - goal.current_amount)} still to go.`,
        severity: 'info',
      })
    }
  }

  const order: Record<NotificationSeverity, number> = { critical: 0, warning: 1, info: 2 }
  return notes.sort((a, b) => order[a.severity] - order[b.severity])
}

export async function scheduleUpcomingBillNotifications(
  recurringRules: RecurringRule[],
  fmt: (n: number) => string,
) {
  try {
    const { display } = await LocalNotifications.checkPermissions()
    let permission = display
    if (permission !== 'granted') {
      const result = await LocalNotifications.requestPermissions()
      permission = result.display
    }
    if (permission !== 'granted') return

    // Cancel every previously scheduled id first (registry-based) so rules that were
    // deleted or moved out of the reminder window are cleaned up cleanly.
    const previousIds = getScheduledNotificationIds()
    if (previousIds.length > 0) {
      await LocalNotifications.cancel({ notifications: previousIds.map(id => ({ id })) }).catch(() => undefined)
    }

    const notifications = recurringRules
      .filter(r => r.active && r.type !== 'income')
      .flatMap(rule => {
        const days = daysUntil(rule.next_due_date)
        if (days <= 0 || days > 3) return []
        const at = parseLocalDate(rule.next_due_date)
        at.setDate(at.getDate() - 1)
        at.setHours(9, 0, 0, 0)
        if (at <= new Date()) return []
        return [{
          id: ruleNotificationId(rule.id, 'bill'),
          title: days === 1 ? `${rule.description} due tomorrow` : `${rule.description} in ${days} days`,
          body: `${fmt(rule.amount)} payment coming up`,
          schedule: { at },
          sound: undefined as undefined,
          attachments: undefined as undefined,
          actionTypeId: '',
          extra: null,
        }]
      })

    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications })
    }
    setScheduledNotificationIds(notifications.map(n => n.id))
  } catch {
    // Not native or notifications unavailable
  }
}
