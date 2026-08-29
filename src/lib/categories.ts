import type { BudgetCategory } from '@/types'

export const DEFAULT_BUDGET_CATEGORIES: Array<Omit<BudgetCategory, 'id' | 'created_at'>> = [
  { name: 'Housing', yearly_allocated: 0, budget_period: 'monthly', color: '#A9F5C7', icon: '🏠' },
  { name: 'Food', yearly_allocated: 0, budget_period: 'monthly', color: '#FFD276', icon: '🍜' },
  { name: 'Transport', yearly_allocated: 0, budget_period: 'monthly', color: '#93C5FD', icon: '🚌' },
  { name: 'Learning', yearly_allocated: 0, budget_period: 'monthly', color: '#C4AEFF', icon: '📚' },
  { name: 'Entertainment', yearly_allocated: 0, budget_period: 'monthly', color: '#FF8388', icon: '🎬' },
  { name: 'Investing', yearly_allocated: 0, budget_period: 'monthly', color: '#8B5CF6', icon: '📈' },
  { name: 'Income', yearly_allocated: 0, budget_period: 'monthly', color: '#64748B', icon: '💰' },
  { name: 'Balancing', yearly_allocated: 0, budget_period: 'monthly', color: '#64748B', icon: '⚖️' },
]
