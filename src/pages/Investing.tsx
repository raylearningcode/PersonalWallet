import { useEffect, useMemo, useState } from 'react'
import { useInvestmentConfig, useSaveInvestmentConfig } from '@/lib/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calculateInvestmentPlan, generateGrowthData } from '@/lib/investing'
import { useCurrency } from '@/lib/currency'
import { AllocationEditor } from '@/components/investing/AllocationEditor'
import { toast } from 'sonner'
import type { AllocationItem } from '@/types'

type SimulatorValues = {
  monthlyContribution: number
  annualReturnRate: number
  durationYears: number
  initialCapital: number
}

const DEFAULT_ALLOCATION: AllocationItem[] = [
  { name: 'ETF', pct: 60, color: '#6c63ff' },
  { name: 'Bonds', pct: 20, color: '#22c55e' },
  { name: 'Cash', pct: 10, color: '#f59e0b' },
  { name: 'Learning', pct: 10, color: '#60a5fa' },
]

const parseRate = (value: string) => {
  const parsed = Number(value.replace(/[^\d.,]/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

const parseMoney = (value: string) => {
  const parsed = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function Investing() {
  const fmt = useCurrency()
  const { data: investConfig } = useInvestmentConfig()
  const saveInvestmentConfig = useSaveInvestmentConfig()

  const emptySimulator: SimulatorValues = useMemo(() => ({
    monthlyContribution: investConfig?.monthly_contribution ?? 0,
    annualReturnRate: investConfig?.return_rate ?? 0,
    durationYears: investConfig?.duration_years ?? 0,
    initialCapital: investConfig?.current_value ?? 0,
  }), [investConfig])

  const [draft, setDraft] = useState<SimulatorValues>({
    monthlyContribution: 0, annualReturnRate: 0, durationYears: 0, initialCapital: 0,
  })
  const [simulator, setSimulator] = useState<SimulatorValues>({
    monthlyContribution: 0, annualReturnRate: 0, durationYears: 0, initialCapital: 0,
  })
  const [allocation, setAllocation] = useState<AllocationItem[]>(DEFAULT_ALLOCATION)

  useEffect(() => {
    setDraft(emptySimulator)
    setSimulator(emptySimulator)
  }, [emptySimulator])

  useEffect(() => {
    if (investConfig?.allocations && investConfig.allocations.length > 0) {
      setAllocation(investConfig.allocations)
    }
  }, [investConfig])

  const plan = useMemo(() => calculateInvestmentPlan(simulator), [simulator])
  const growthData = useMemo(
    () => generateGrowthData(
      simulator.monthlyContribution,
      simulator.annualReturnRate,
      Math.max(0, simulator.durationYears)
    ).map(point => ({
      ...point,
      value: point.value + simulator.initialCapital * Math.pow(1 + simulator.annualReturnRate / 100 / 12, point.year * 12),
    })),
    [simulator]
  )
  const maxValue = Math.max(...growthData.map(row => row.value), 1)

  const updateDraft = (key: keyof SimulatorValues, value: string) => {
    const parser = key === 'annualReturnRate' ? parseRate : parseMoney
    setDraft(current => ({ ...current, [key]: parser(value) }))
  }

  const setDuration = (durationYears: number) => {
    setDraft(current => ({ ...current, durationYears }))
    setSimulator(current => ({ ...current, durationYears }))
  }

  const saveSimulator = async () => {
    try {
      await saveInvestmentConfig.mutateAsync({
        id: investConfig?.id,
        monthly_contribution: draft.monthlyContribution,
        return_rate: draft.annualReturnRate,
        duration_years: draft.durationYears,
        current_value: draft.initialCapital,
        allocations: allocation,
      })
      setSimulator(draft)
      toast.success('Investment simulator saved')
    } catch {
      toast.error('Failed to save simulator')
    }
  }

  const saveAllocation = async () => {
    try {
      await saveInvestmentConfig.mutateAsync({
        id: investConfig?.id,
        monthly_contribution: simulator.monthlyContribution,
        return_rate: simulator.annualReturnRate,
        duration_years: simulator.durationYears,
        current_value: simulator.initialCapital,
        allocations: allocation,
      })
      toast.success('Allocation saved')
    } catch {
      toast.error('Failed to save allocation')
    }
  }

  return (
    <div>
      <PageHeader
        title="Investing"
        subtitle="Simulate monthly contributions, expected returns, and long-term compound growth."
      />
      <Card className="mb-6">
        <CardContent className="flex min-h-[146px] flex-col gap-6 px-8 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-extrabold text-primary">
              Purpose: track real investments and simulate expected ROI before committing money.
            </p>
            <p className="mt-3 text-xs font-bold text-primary">Projected portfolio</p>
            <p className="mt-2 text-[2.25rem] font-extrabold leading-none text-foreground">
              {fmt(plan.projectedPortfolio)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Estimated in {simulator.durationYears} years with {fmt(simulator.monthlyContribution)}/month and {simulator.annualReturnRate}% annual return.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              className="px-9"
              onClick={event => { setSimulator(draft); event.currentTarget.blur() }}
            >
              Run ROI sim
            </Button>
            <Button variant="secondary" className="px-8" onClick={saveSimulator} disabled={saveInvestmentConfig.isPending}>
              Save simulator
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <Card>
          <CardHeader><CardTitle className="text-xl">Growth simulation</CardTitle></CardHeader>
          <CardContent className="flex h-[266px] items-end justify-center gap-12 px-8 pb-8">
            {growthData.map((point) => (
              <button
                key={point.year}
                className={`w-5 rounded-full transition-colors ${point.year === simulator.durationYears ? 'bg-primary' : 'bg-muted'}`}
                style={{ height: `${Math.max(32, (point.value / maxValue) * 230)}px` }}
                onClick={() => setDuration(point.year)}
                aria-label={`Use ${point.year} year duration`}
              />
            ))}
          </CardContent>
        </Card>

        <Card className="relative z-10">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-xl">Investment ROI simulator</CardTitle>
            <p className="text-xs leading-4 text-muted-foreground">
              Try different monthly contribution, return rate, and duration.
            </p>
          </CardHeader>
          <CardContent className="space-y-2.5 px-6 pb-5">
            <div className="rounded-2xl bg-[#164629] p-3">
              <p className="text-xs font-bold text-primary">Projected portfolio</p>
              <p className="mt-1 text-2xl font-extrabold text-primary">{fmt(plan.projectedPortfolio)}</p>
              <p className="mt-1 text-xs text-primary/80">
                Gain: {fmt(plan.projectedGain)} · Invested: {fmt(plan.totalInvested)}
              </p>
            </div>
            {([
              ['Monthly contribution', 'monthlyContribution', String(draft.monthlyContribution)],
              ['Expected return / year', 'annualReturnRate', String(draft.annualReturnRate)],
              ['Duration (years)', 'durationYears', String(draft.durationYears)],
              ['Initial capital', 'initialCapital', String(draft.initialCapital)],
            ] as [string, keyof SimulatorValues, string][]).map(([label, key, value]) => (
              <div key={key}>
                <Label className="text-[11px] text-muted-foreground">{label}</Label>
                <Input
                  aria-label={label}
                  className="mt-1 h-8 rounded-xl bg-secondary text-sm font-extrabold"
                  value={value}
                  onChange={event => updateDraft(key, event.target.value)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-xl">Portfolio allocation</CardTitle></CardHeader>
        <CardContent className="px-8 pb-6">
          <AllocationEditor
            value={allocation}
            onChange={setAllocation}
            onSave={saveAllocation}
            isSaving={saveInvestmentConfig.isPending}
          />
        </CardContent>
      </Card>
    </div>
  )
}
