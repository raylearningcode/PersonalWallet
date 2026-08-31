import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, TrendingDown, TrendingUp, Plus } from 'lucide-react'
import { useMoney } from '@/lib/currency'
import type { AllocationItem } from '@/types'
import { parseNumberInput } from '@/lib/numberInput'

interface RebalancingHelperProps {
  allocations: AllocationItem[]
  totalValue: number
}

export function RebalancingHelper({ allocations, totalValue }: RebalancingHelperProps) {
  const money = useMoney()
  const [showTarget, setShowTarget] = useState(false)
  const [targetAllocations, setTargetAllocations] = useState<Record<string, number>>(
    Object.fromEntries(allocations.map(a => [a.name.toLowerCase(), a.pct]))
  )

  if (allocations.length === 0) return null

  const calculateDrift = () => {
    const drifts: Array<{ name: string; current: number; target: number; drift: number; amountBase: number; color: string }> = []

    allocations.forEach(alloc => {
      const target = targetAllocations[alloc.name.toLowerCase()] ?? alloc.pct
      const drift = alloc.pct - target
      const amountBase = (drift / 100) * totalValue

      drifts.push({
        name: alloc.name,
        current: alloc.pct,
        target,
        drift,
        amountBase,
        color: alloc.color,
      })
    })

    return drifts.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
  }

  const drifts = calculateDrift()
  const maxDrift = Math.max(...drifts.map(d => Math.abs(d.drift)))
  const needsRebalance = maxDrift > 5 // Rebalance if any asset drifts >5%

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg">Rebalancing helper</CardTitle>
          {needsRebalance && (
            <div className="flex items-center gap-1.5 rounded-lg bg-[#FFCF73]/10 px-2 py-1">
              <AlertTriangle className="h-3.5 w-3.5 text-[#FFCF73]" />
              <span className="text-xs font-bold text-[#FFCF73]">Out of balance</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current vs Target */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Asset type</span>
            <div className="flex gap-5">
              <span>Current</span>
              <span>Target</span>
              <span>Action</span>
            </div>
          </div>

          {drifts.map(drift => (
            <div key={drift.name} className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: drift.color }} />
                <span className="text-sm font-medium">{drift.name}</span>
              </div>
              <div className="flex items-center gap-5">
                <span className="w-12 text-right text-sm font-bold">{drift.current}%</span>
                <span className="w-12 text-right text-sm text-muted-foreground">{drift.target}%</span>
                <div className="w-24">
                  {Math.abs(drift.drift) > 1 ? (
                    <div className="flex items-center gap-1">
                      {drift.amountBase > 0 ? (
                        <>
                          <TrendingUp className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs text-primary font-bold">+{money.formatDisplay(drift.amountBase)}</span>
                        </>
                      ) : (
                        <>
                          <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                          <span className="text-xs text-destructive font-bold">{money.formatDisplay(drift.amountBase)}</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Target allocation editor */}
        {showTarget ? (
          <div className="space-y-3 rounded-lg border border-primary/30 bg-secondary p-3">
            <p className="text-sm font-bold">Set target allocation</p>
            {allocations.map(alloc => (
              <div key={alloc.name} className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground w-20">{alloc.name}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={targetAllocations[alloc.name.toLowerCase()] ?? alloc.pct}
                  onChange={e => {
                    const val = parseNumberInput(e.target.value)
                    setTargetAllocations(prev => ({
                      ...prev,
                      [alloc.name.toLowerCase()]: val,
                    }))
                  }}
                  className="h-8 w-16 text-sm"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={() => setShowTarget(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => setShowTarget(true)}>
            <Plus className="mr-1 h-3 w-3" /> Set target allocation
          </Button>
        )}

        {/* Info text */}
        <p className="text-xs text-muted-foreground">
          {needsRebalance
            ? `Your ${drifts.filter(d => Math.abs(d.drift) > 5).map(d => d.name.toLowerCase()).join(', ')} allocation${drifts.filter(d => Math.abs(d.drift) > 5).length !== 1 ? 's' : ''} ${drifts.some(d => d.drift > 0) ? 'exceed' : 'below'} target by more than 5%.`
            : 'Your portfolio is well-balanced. No rebalancing needed.'
          }
        </p>
      </CardContent>
    </Card>
  )
}
