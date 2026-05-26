import { useState } from 'react'
import { useTransactions, useDeleteTransaction, useMarkReviewed, useAddTransaction, useBudgetCategories } from '@/lib/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrency } from '@/lib/currency'

type Filter = 'all' | 'income' | 'expense' | 'recurring' | 'needs_review'

export function Transactions() {
  const fmt = useCurrency()
  const [filter, setFilter] = useState<Filter>('all')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [type, setType] = useState<'income' | 'expense' | 'recurring'>('expense')
  const { data: transactions = [] } = useTransactions(filter)
  const { data: categories = [] } = useBudgetCategories()
  const addTransaction = useAddTransaction()
  const del = useDeleteTransaction()
  const review = useMarkReviewed()

  const moneyIn = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const moneyOut = transactions.filter(t => t.type !== 'income').reduce((s, t) => s + t.amount, 0)
  const needsReview = transactions.filter(t => t.needs_review).length

  const handleAddTransaction = async () => {
    const parsedAmount = Number(amount.replace(/[^\d.]/g, ''))
    if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return
    await addTransaction.mutateAsync({
      description: description.trim(),
      amount: parsedAmount,
      type,
      category: category.trim() || 'Uncategorized',
      date: new Date().toISOString().slice(0, 10),
      needs_review: false,
    })
    setDescription('')
    setAmount('')
    setCategory('')
    toast.success('Transaction added')
  }

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="Track every cashflow with clean filters, category tagging, and recurring payments."
      />
      <Tabs value={filter} onValueChange={v => setFilter(v as Filter)} className="mb-8 rounded-[1.4rem] border border-border bg-card p-7">
        <TabsList className="gap-5 bg-transparent p-0">
          {(['all', 'income', 'expense', 'recurring', 'needs_review'] as Filter[]).map(f => (
            <TabsTrigger
              key={f}
              value={f}
              className="h-10 min-w-28 rounded-full border border-border bg-transparent px-6 text-sm font-bold capitalize text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {f.replace('_', ' ')}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="mb-9 grid grid-cols-3 gap-6">
        {[
          { label: 'Money in', value: fmt(moneyIn), dot: 'bg-primary', sub: 'Income received' },
          { label: 'Money out', value: fmt(moneyOut), dot: 'bg-[#FF8388]', sub: `Across ${transactions.length} transactions` },
          { label: 'Uncategorized', value: `${needsReview} items`, dot: 'bg-[#FFD276]', sub: 'Needs manual review' },
        ].map(({ label, value, dot, sub }) => (
          <div key={label} className="relative rounded-[1.4rem] border border-border bg-card px-6 py-5">
            <span className={`absolute right-7 top-7 h-4 w-4 rounded-full ${dot}`} />
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-4 text-[2rem] font-extrabold leading-none text-foreground">{value}</p>
            <p className="mt-6 text-sm text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>
      <Card className="mb-8">
        <CardHeader className="pb-0">
          <CardTitle className="text-xl">Add transaction</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-[1.2fr_0.8fr_0.9fr_0.9fr_auto] items-end gap-4 p-6">
          <div>
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Input aria-label="Description" className="mt-2 bg-secondary" value={description} onChange={event => setDescription(event.target.value)} placeholder="Lunch, salary, rent" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Amount</Label>
            <Input aria-label="Amount" className="mt-2 bg-secondary" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Input aria-label="Category" className="mt-2 bg-secondary" list="transaction-categories" value={category} onChange={event => setCategory(event.target.value)} placeholder="Uncategorized" />
            <datalist id="transaction-categories">
              {categories.map(item => <option key={item.id} value={item.name} />)}
            </datalist>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            <select
              aria-label="Transaction type"
              className="mt-2 h-10 w-full rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
              value={type}
              onChange={event => setType(event.target.value as 'income' | 'expense' | 'recurring')}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="recurring">Recurring</option>
            </select>
          </div>
          <Button onClick={handleAddTransaction} disabled={addTransaction.isPending}>
            Add transaction
          </Button>
        </CardContent>
      </Card>
      <div className="overflow-hidden rounded-[1.4rem] border border-border bg-card px-6 py-6">
          <h2 className="mb-4 text-xl font-extrabold text-foreground">Recent activity</h2>
          <Table>
            <TableBody>
              {transactions.map(tx => (
                <TableRow key={tx.id} className="border-border hover:bg-muted/10">
                  <TableCell className="w-1/4 py-3 text-foreground">{tx.description}</TableCell>
                  <TableCell className="text-muted-foreground">{tx.category}</TableCell>
                  <TableCell className={`text-right font-bold ${tx.type === 'income' ? 'text-primary' : 'text-[#FF8388]'}`}>
                    {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                  </TableCell>
                  <TableCell className="w-[86px]">
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
              {transactions.length === 0 && (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    No transactions yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
    </div>
  )
}
