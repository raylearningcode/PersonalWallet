import { useState } from 'react'
import { useTransactions, useDeleteTransaction, useMarkReviewed } from '@/lib/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/stats'
import { Trash2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

type Filter = 'all' | 'income' | 'expense' | 'recurring' | 'needs_review'

export function Transactions() {
  const [filter, setFilter] = useState<Filter>('all')
  const { data: transactions = [], isLoading } = useTransactions(filter)
  const del = useDeleteTransaction()
  const review = useMarkReviewed()

  const moneyIn = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const moneyOut = transactions.filter(t => t.type !== 'income').reduce((s, t) => s + t.amount, 0)
  const needsReview = transactions.filter(t => t.needs_review).length

  const typeColors: Record<string, string> = {
    income: 'bg-green-500/20 text-green-400 hover:bg-green-500/20 border-0',
    expense: 'bg-red-500/20 text-red-400 hover:bg-red-500/20 border-0',
    recurring: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/20 border-0',
  }

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="Track every cashflow with clean filters, category tagging, and recurring payments."
      />
      <Tabs value={filter} onValueChange={v => setFilter(v as Filter)} className="mb-6">
        <TabsList className="bg-card border border-border">
          {(['all', 'income', 'expense', 'recurring', 'needs_review'] as Filter[]).map(f => (
            <TabsTrigger key={f} value={f} className="capitalize">
              {f.replace('_', ' ')}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex gap-4 mb-6">
        {[
          { label: 'Money in', value: formatCurrency(moneyIn), color: 'text-green-400', sub: 'Income received' },
          { label: 'Money out', value: formatCurrency(moneyOut), color: 'text-red-400', sub: `${transactions.length} transactions` },
          { label: 'Uncategorized', value: `${needsReview} items`, color: 'text-yellow-400', sub: 'Needs manual review' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-card border border-border rounded-lg px-4 py-3 min-w-36">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-lg font-bold ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map(tx => (
                <TableRow key={tx.id} className="border-border hover:bg-muted/10">
                  <TableCell className="text-muted-foreground text-sm">{tx.date}</TableCell>
                  <TableCell className="text-foreground">{tx.description}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs border-border">{tx.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${typeColors[tx.type]}`}>{tx.type}</Badge>
                  </TableCell>
                  <TableCell className={`text-right font-medium ${tx.type === 'income' ? 'text-green-400' : 'text-foreground'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {tx.needs_review && (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                          onClick={() => { review.mutate(tx.id); toast.success('Marked as reviewed') }}
                        >
                          <CheckCircle size={14} />
                        </Button>
                      )}
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => { del.mutate(tx.id); toast.success('Transaction deleted') }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
