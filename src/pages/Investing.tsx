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

const RISK_PROFILES: { label: string; description: string; allocation: AllocationItem[] }[] = [
  {
    label: 'Conservative',
    description: 'Capital preservation — majority in bonds and cash',
    allocation: [
      { name: 'Bonds', pct: 60, color: '#93C5FD' },
      { name: 'ETF', pct: 30, color: '#A9F5C7' },
      { name: 'Cash', pct: 10, color: '#C4AEFF' },
    ],
  },
  {
    label: 'Moderate',
    description: 'Balanced growth with downside protection',
    allocation: [
      { name: 'ETF', pct: 60, color: '#A9F5C7' },
      { name: 'Bonds', pct: 25, color: '#93C5FD' },
      { name: 'Cash', pct: 15, color: '#C4AEFF' },
    ],
  },
  {
    label: 'Aggressive',
    description: 'Maximum growth — higher risk, higher reward',
    allocation: [
      { name: 'ETF', pct: 65, color: '#A9F5C7' },
      { name: 'Crypto', pct: 25, color: '#FFD276' },
      { name: 'Cash', pct: 10, color: '#C4AEFF' },
    ],
  },
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
  const [contributionCurrency, setContributionCurrency] = useState(savedContributionCurrency)
  const [targetCurrency, setTargetCurrency] = useState(savedTargetCurrency)
  const [allocation, setAllocation] = useState<AllocationItem[]>(DEFAULT_ALLOCATION)

  useEffect(() => {
    setDraft(emptySimulator)
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

  const plan = useMemo(() => calculateInvestmentPlan(draftBase), [draftBase])
  const targetGap = Math.max(0, draftBase.targetPortfolio - plan.projectedPortfolio)
  const targetProgress = draftBase.targetPortfolio > 0
    ? Math.min(100, Math.round((plan.projectedPortfolio / draftBase.targetPortfolio) * 100))
    : 0
  const growthData = useMemo(
    () => generateGrowthData(
      draftBase.monthlyContribution,
      draft.annualReturnRate,
      Math.max(draft.durationYears, 10)
    ).map(point => ({
      ...point,
      value: point.value + draft.initialCapital * Math.pow(1 + draft.annualReturnRate / 100 / 12, point.year * 12),
    })),
    [draft, draftBase.monthlyContribution]
  )
  const maxValue = Math.max(...growthData.map(row => row.value), 1)

  const updateDraft = (key: keyof SimulatorValues, value: string) => {
    const parser = key === 'annualReturnRate' ? parseRate : parseMoney
    setDraft(current => ({ ...current, [key]: parser(value) }))
  }

  const setDuration = (durationYears: number) => {
    setDraft(current => ({ ...current, durationYears }))
  }

  const runSimulator = () => {
    if (draft.durationYears <= 0 || draft.monthlyContribution <= 0) {
      toast.error('Set a monthly contribution and duration to run the simulation')
      return
    }
    toast.success(`${draft.durationYears}yr projection: ${money.formatDisplay(plan.projectedPortfolio)} · gain ${money.formatDisplay(plan.projectedGain)}`)
  }

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
      toast.success('Investment simulator saved')
    } catch {
      toast.error('Failed to save simulator')
    }
  }

  const saveAllocation = async () => {
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
              <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">{money.format(draft.monthlyContribution, contributionCurrency)}/month</span>
              {draftBase.targetPortfolio > 0 && (
                <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">Target gap {money.formatDisplay(targetGap)}</span>
              )}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Estimated in {draft.durationYears} years at {draft.annualReturnRate}% annual return.
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
          <CardContent className="px-6 pb-6 sm:px-8">
            <div className="flex items-end justify-between gap-1 sm:justify-center sm:gap-8 lg:gap-10" style={{ height: '220px' }}>
              {growthData.map((point) => (
                <div key={point.year} className="flex flex-col items-center gap-1.5">
                  <button
                    type="button"
                    className={`w-4 rounded-full transition-colors sm:w-5 ${point.year === draft.durationYears ? 'bg-primary' : 'bg-muted hover:bg-muted/60'}`}
                    style={{ height: `${Math.max(20, (point.value / maxValue) * 190)}px` }}
                    onClick={() => setDuration(point.year)}
                    aria-label={`Use ${point.year} year duration`}
                    title={`${point.year} years: ${money.formatDisplay(point.value)}`}
                  />
                  <span className={`text-[9px] font-bold leading-none sm:text-[10px] ${point.year === draft.durationYears ? 'text-primary' : 'text-muted-foreground'}`}>{point.year}y</span>
                </div>
              ))}
            </div>
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
        <CardHeader>
          <CardTitle className="text-xl">Portfolio allocation</CardTitle>
          <p className="text-sm text-muted-foreground">Apply a risk profile as a starting point, then customise the percentages below.</p>
        </CardHeader>
        <CardContent className="px-5 pb-6 sm:px-8">
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {RISK_PROFILES.map(profile => (
              <button
                key={profile.label}
                className="rounded-2xl border border-border bg-secondary p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                onClick={() => {
                  setAllocation(profile.allocation)
                  toast.success(`${profile.label} profile applied`)
                }}
              >
                <p className="font-extrabold text-foreground">{profile.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{profile.description}</p>
                <div className="mt-3 flex gap-1">
                  {profile.allocation.map(item => (
                    <div
                      key={item.name}
                      className="flex-1 overflow-hidden rounded-full"
                      style={{ background: item.color, height: 4, minWidth: 0 }}
                      title={`${item.name} ${item.pct}%`}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {profile.allocation.map(i => `${i.name} ${i.pct}%`).join(' · ')}
                </p>
              </button>
            ))}
          </div>
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
