import { useEffect, useMemo, useState } from 'react'
import { useInvestmentConfig, useSaveInvestmentConfig } from '@/lib/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calculateInvestmentPlan, generateGrowthData } from '@/lib/investing'
import { CURRENCIES, useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { AllocationEditor } from '@/components/investing/AllocationEditor'
import { toast } from 'sonner'
import type { AllocationItem } from '@/types'

type SimulatorValues = {
  monthlyContribution: number
  targetPortfolio: number
  annualReturnRate: number
  durationYears: number
  initialCapital: number
}

const DEFAULT_ALLOCATION: AllocationItem[] = [
  { name: 'ETF', pct: 60, color: '#A9F5C7' },
  { name: 'Bonds', pct: 20, color: '#93C5FD' },
  { name: 'Cash', pct: 10, color: '#C4AEFF' },
  { name: 'Learning', pct: 10, color: '#FFD276' },
]

const parseRate = (value: string) => {
  const parsed = Number(value.replace(/[^\d.,]/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

const parseMoney = (value: string) => {
  return parseNumberInput(value)
}

export function Investing() {
  const money = useMoney()
  const { data: investConfig } = useInvestmentConfig()
  const saveInvestmentConfig = useSaveInvestmentConfig()
  const savedContributionCurrency = investConfig?.contribution_currency ?? money.displayCurrency
  const savedTargetCurrency = investConfig?.target_currency ?? money.displayCurrency

  const emptySimulator: SimulatorValues = useMemo(() => ({
    monthlyContribution: money.fromBase(investConfig?.monthly_contribution ?? 0, savedContributionCurrency),
    targetPortfolio: money.fromBase(investConfig?.target_portfolio ?? 0, savedTargetCurrency),
    annualReturnRate: investConfig?.return_rate ?? 0,
    durationYears: investConfig?.duration_years ?? 0,
    initialCapital: investConfig?.current_value ?? 0,
  }), [investConfig, money.baseCurrency, money.displayCurrency, money.rates, savedContributionCurrency, savedTargetCurrency])

  const [draft, setDraft] = useState<SimulatorValues>({
    monthlyContribution: 0, targetPortfolio: 0, annualReturnRate: 0, durationYears: 0, initialCapital: 0,
  })
  const [simulator, setSimulator] = useState<SimulatorValues>({
    monthlyContribution: 0, targetPortfolio: 0, annualReturnRate: 0, durationYears: 0, initialCapital: 0,
  })
  const [contributionCurrency, setContributionCurrency] = useState(savedContributionCurrency)
  const [targetCurrency, setTargetCurrency] = useState(savedTargetCurrency)
  const [allocation, setAllocation] = useState<AllocationItem[]>(DEFAULT_ALLOCATION)

  useEffect(() => {
    setDraft(emptySimulator)
    setSimulator(emptySimulator)
    setContributionCurrency(savedContributionCurrency)
    setTargetCurrency(savedTargetCurrency)
  }, [emptySimulator, savedContributionCurrency, savedTargetCurrency])

  useEffect(() => {
    if (investConfig?.allocations && investConfig.allocations.length > 0) {
      setAllocation(investConfig.allocations)
    }
  }, [investConfig])

  const draftBase = useMemo(() => ({
    ...draft,
    monthlyContribution: money.toBase(draft.monthlyContribution, contributionCurrency),
    targetPortfolio: money.toBase(draft.targetPortfolio, targetCurrency),
  }), [contributionCurrency, draft, money.baseCurrency, money.displayCurrency, money.rates, targetCurrency])
  const simulatorBase = useMemo(() => ({
    ...simulator,
    monthlyContribution: money.toBase(simulator.monthlyContribution, contributionCurrency),
    targetPortfolio: money.toBase(simulator.targetPortfolio, targetCurrency),
  }), [contributionCurrency, money.baseCurrency, money.displayCurrency, money.rates, simulator, targetCurrency])

  const plan = useMemo(() => calculateInvestmentPlan(simulatorBase), [simulatorBase])
  const targetGap = Math.max(0, simulatorBase.targetPortfolio - plan.projectedPortfolio)
  const targetProgress = simulatorBase.targetPortfolio > 0
    ? Math.min(100, Math.round((plan.projectedPortfolio / simulatorBase.targetPortfolio) * 100))
    : 0
  const growthData = useMemo(
    () => generateGrowthData(
      simulatorBase.monthlyContribution,
      simulator.annualReturnRate,
      Math.max(0, simulator.durationYears)
    ).map(point => ({
      ...point,
      value: point.value + simulator.initialCapital * Math.pow(1 + simulator.annualReturnRate / 100 / 12, point.year * 12),
    })),
    [simulator, simulatorBase.monthlyContribution]
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

  const runSimulator = () => setSimulator(draft)

  const saveSimulator = async () => {
    try {
      await saveInvestmentConfig.mutateAsync({
        id: investConfig?.id,
        monthly_contribution: draftBase.monthlyContribution,
        contribution_currency: contributionCurrency,
        target_portfolio: draftBase.targetPortfolio,
        target_currency: targetCurrency,
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
        monthly_contribution: simulatorBase.monthlyContribution,
        contribution_currency: contributionCurrency,
        target_portfolio: simulatorBase.targetPortfolio,
        target_currency: targetCurrency,
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
        subtitle="Simulate contribution plans, expected return, portfolio mix, and long-term compound growth."
      />
      <Card className="mb-6 overflow-hidden">
        <CardContent className="relative flex min-h-[170px] flex-col gap-6 px-5 py-5 sm:px-8 sm:py-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(169,245,199,0.14),transparent_62%)]" />
          <div className="relative">
            <p className="text-sm font-extrabold text-primary">Portfolio simulator</p>
            <p className="mt-2 break-words text-4xl font-extrabold leading-none text-foreground sm:text-[2.45rem]">
              {money.formatDisplay(plan.projectedPortfolio)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">Projected in {money.displayCurrency}</span>
              <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">Base value {money.formatBase(plan.projectedPortfolio)}</span>
              <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">{money.format(simulator.monthlyContribution, contributionCurrency)}/month</span>
              {simulatorBase.targetPortfolio > 0 && (
                <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">Target gap {money.formatDisplay(targetGap)}</span>
              )}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Estimated in {simulator.durationYears} years at {simulator.annualReturnRate}% annual return.
            </p>
          </div>
          <div className="relative flex flex-col gap-3 sm:flex-row lg:shrink-0">
            <Button className="px-9" onClick={event => { runSimulator(); event.currentTarget.blur() }}>
              Run ROI sim
            </Button>
            <Button variant="secondary" className="px-8" onClick={saveSimulator} disabled={saveInvestmentConfig.isPending}>
              Save simulator
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Growth simulation</CardTitle>
            <p className="text-sm text-muted-foreground">Tap a bar to change the investment horizon.</p>
          </CardHeader>
          <CardContent className="flex h-[230px] items-end justify-between gap-4 px-6 pb-8 sm:h-[266px] sm:justify-center sm:gap-10 sm:px-8 lg:gap-12">
            {growthData.map((point) => (
              <button
                key={point.year}
                className={`w-5 rounded-full transition-colors ${point.year === simulator.durationYears ? 'bg-primary' : 'bg-muted'}`}
                style={{ height: `${Math.max(32, (point.value / maxValue) * 230)}px` }}
                onClick={() => setDuration(point.year)}
                aria-label={`Use ${point.year} year duration`}
                title={`${point.year} years: ${money.formatDisplay(point.value)}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card className="relative z-10">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-xl">Investment ROI simulator</CardTitle>
            <p className="text-xs leading-4 text-muted-foreground">
              Choose the input currency first, then model return, horizon, and starting capital.
            </p>
          </CardHeader>
          <CardContent className="space-y-2.5 px-6 pb-5">
            <div className="rounded-2xl bg-[#164629] p-3">
              <p className="text-xs font-bold text-primary">Projected portfolio</p>
              <p className="mt-1 text-2xl font-extrabold text-primary">{money.formatDisplay(plan.projectedPortfolio)}</p>
              <p className="mt-1 text-xs text-primary/80">Base value {money.formatBase(plan.projectedPortfolio)}</p>
              <p className="mt-1 text-xs text-primary/80">
                Gain {money.formatDisplay(plan.projectedGain)} · Invested {money.formatDisplay(plan.totalInvested)}
              </p>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Contribution currency</Label>
              <select
                aria-label="Contribution currency"
                className="mt-1 h-8 w-full rounded-xl border border-input bg-secondary px-3 text-sm font-extrabold text-foreground outline-none"
                value={contributionCurrency}
                onChange={event => setContributionCurrency(event.target.value)}
              >
                {CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </div>
            <div className="rounded-2xl border border-border bg-secondary p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-muted-foreground">Target portfolio</p>
                <p className="text-xs font-extrabold text-primary">{targetProgress}%</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${targetProgress}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Target gap {money.formatDisplay(targetGap)}</p>
            </div>
            {([
              [`Monthly contribution (${contributionCurrency})`, 'monthlyContribution', formatNumberInput(draft.monthlyContribution)],
              [`Target portfolio (${targetCurrency})`, 'targetPortfolio', formatNumberInput(draft.targetPortfolio)],
              ['Expected return / year', 'annualReturnRate', String(draft.annualReturnRate)],
              ['Duration (years)', 'durationYears', String(draft.durationYears)],
              [`Initial capital (${money.baseCurrency})`, 'initialCapital', formatNumberInput(draft.initialCapital)],
            ] as [string, keyof SimulatorValues, string][]).map(([label, key, value]) => (
              <div key={key}>
                <Label className="text-[11px] text-muted-foreground">{label}</Label>
                <Input
                  aria-label={key === 'monthlyContribution' ? 'Monthly contribution' : key === 'targetPortfolio' ? 'Target portfolio' : key === 'initialCapital' ? 'Initial capital' : label}
                  className="mt-1 h-8 rounded-xl bg-secondary text-sm font-extrabold"
                  value={value}
                  onChange={event => updateDraft(key, event.target.value)}
                />
              </div>
            ))}
            <div>
              <Label className="text-[11px] text-muted-foreground">Target portfolio currency</Label>
              <select
                aria-label="Target portfolio currency"
                className="mt-1 h-8 w-full rounded-xl border border-input bg-secondary px-3 text-sm font-extrabold text-foreground outline-none"
                value={targetCurrency}
                onChange={event => setTargetCurrency(event.target.value)}
              >
                {CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-xl">Portfolio allocation</CardTitle></CardHeader>
        <CardContent className="px-5 pb-6 sm:px-8">
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
