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
import { BookOpen, ChevronDown, Monitor } from 'lucide-react'
import type { AllocationItem } from '@/types'
import { useIsDesktop } from '@/hooks/useIsDesktop'

const GLOSSARY_DISMISSED_KEY = 'finpath_investing_glossary_dismissed'

const GLOSSARY_ITEMS = [
  {
    term: 'ETF',
    color: '#A9F5C7',
    definition: 'Exchange-Traded Fund — a basket of stocks (or bonds) you buy as one unit. Low cost, diversified, and traded like a stock. A global index ETF (e.g. VT, VWRA) gives you ownership in thousands of companies at once.',
  },
  {
    term: 'Bonds',
    color: '#93C5FD',
    definition: 'Loans you give to governments or companies in exchange for regular interest payments. Lower potential return than stocks, but less volatile. Good for stability and capital preservation.',
  },
  {
    term: 'Risk',
    color: '#FFD276',
    definition: 'The chance your investment goes up OR down. Higher expected return = higher risk. Aggressive portfolios can drop 30–50% in a crash but recover over time. Conservative portfolios drop less but grow slower.',
  },
  {
    term: 'Compound growth',
    color: '#C4AEFF',
    definition: 'Earnings on your earnings. If you earn 8%/year, next year you earn 8% on a larger base. Over 20+ years this compounds dramatically — the chart above shows this curve.',
  },
]

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

const SCENARIO_RETURNS = [5, 8, 12] // annual % for conservative, moderate, aggressive

type ContributionFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'
const FREQ_TO_MONTHLY: Record<ContributionFrequency, number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
}
const FREQ_LABELS: Record<ContributionFrequency, string> = {
  weekly: 'week',
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
}

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
  const isDesktop = useIsDesktop()
  const { data: investConfig } = useInvestmentConfig()
  const saveInvestmentConfig = useSaveInvestmentConfig()
  const savedContributionCurrency = investConfig?.contribution_currency ?? money.baseCurrency
  const savedTargetCurrency = investConfig?.target_currency ?? money.baseCurrency

  const emptySimulator: SimulatorValues = useMemo(() => ({
    monthlyContribution: money.fromBase(investConfig?.monthly_contribution ?? 0, savedContributionCurrency),
    targetPortfolio: money.fromBase(investConfig?.target_portfolio ?? 0, savedTargetCurrency),
    annualReturnRate: investConfig?.return_rate ?? 8,
    durationYears: investConfig?.duration_years ?? 10,
    initialCapital: investConfig?.current_value ?? 0,
  }), [investConfig, money.baseCurrency, money.rates, savedContributionCurrency, savedTargetCurrency])

  const [draft, setDraft] = useState<SimulatorValues>({
    monthlyContribution: 0, targetPortfolio: 0, annualReturnRate: 0, durationYears: 0, initialCapital: 0,
  })
  const [glossaryDismissed, setGlossaryDismissed] = useState(() => localStorage.getItem(GLOSSARY_DISMISSED_KEY) === '1')
  const [glossaryOpen, setGlossaryOpen] = useState(false)
  const [contributionFrequency, setContributionFrequency] = useState<ContributionFrequency>('monthly')
  const [contributionCurrency, setContributionCurrency] = useState(savedContributionCurrency)
  const [targetCurrency, setTargetCurrency] = useState(savedTargetCurrency)
  const [allocation, setAllocation] = useState<AllocationItem[]>(DEFAULT_ALLOCATION)
  // chartMax tracks the bar range independently — clicking a bar updates draft.durationYears
  // but NOT chartMax, so the chart scale doesn't collapse when a shorter bar is clicked.
  const [chartMax, setChartMax] = useState(() => Math.min(30, Math.max(investConfig?.duration_years ?? 0, 10)))

  useEffect(() => {
    setDraft(emptySimulator)
    setContributionCurrency(savedContributionCurrency)
    setTargetCurrency(savedTargetCurrency)
    setChartMax(Math.min(30, Math.max(emptySimulator.durationYears, 10)))
  }, [emptySimulator, savedContributionCurrency, savedTargetCurrency])

  useEffect(() => {
    if (investConfig?.allocations && investConfig.allocations.length > 0) {
      setAllocation(investConfig.allocations)
    }
  }, [investConfig])

  const draftBase = useMemo(() => ({
    ...draft,
    monthlyContribution: money.toBase(draft.monthlyContribution, contributionCurrency) * FREQ_TO_MONTHLY[contributionFrequency],
    targetPortfolio: money.toBase(draft.targetPortfolio, targetCurrency),
  }), [contributionCurrency, contributionFrequency, draft, money.baseCurrency, money.rates, targetCurrency])

  const plan = useMemo(() => calculateInvestmentPlan(draftBase), [draftBase])
  const targetGap = Math.max(0, draftBase.targetPortfolio - plan.projectedPortfolio)
  const targetProgress = draftBase.targetPortfolio > 0
    ? Math.min(100, Math.round((plan.projectedPortfolio / draftBase.targetPortfolio) * 100))
    : 0
  const chartStep = Math.ceil(chartMax / 10)
  const growthData = useMemo(
    () => generateGrowthData(
      draftBase.monthlyContribution,
      draft.annualReturnRate,
      chartMax
    ).map(point => ({
      ...point,
      value: point.value + draft.initialCapital * Math.pow(1 + draft.annualReturnRate / 100 / 12, point.year * 12),
    })),
    [draft.annualReturnRate, draft.initialCapital, draftBase.monthlyContribution, chartMax]
  )
  const chartData = useMemo(
    () => growthData.filter(p => p.year % chartStep === 0 || p.year === chartMax),
    [growthData, chartStep, chartMax]
  )
  const maxValue = Math.max(...chartData.map(row => row.value), 1)

  const updateDraft = (key: keyof SimulatorValues, value: string) => {
    const parser = key === 'annualReturnRate' ? parseRate : parseMoney
    const parsed = parser(value)
    if (key === 'annualReturnRate') {
      if (parsed > 50) { toast.error('Return rate cannot exceed 50%'); return }
      if (parsed > 15) toast.warning('Returns above 15%/yr are historically rare — verify this assumption')
      setDraft(current => ({ ...current, annualReturnRate: Math.max(0, parsed) }))
      return
    }
    const clamped = key === 'durationYears' ? Math.min(60, parsed) : parsed
    setDraft(current => ({ ...current, [key]: clamped }))
    if (key === 'durationYears') {
      setChartMax(Math.min(60, Math.max(Math.round(clamped), 10)))
    }
  }

  // Clicking a bar updates the selected duration for ROI but not the chart scale
  const setDuration = (durationYears: number) => {
    setDraft(current => ({ ...current, durationYears }))
  }

  const saveSimulator = async () => {
    if (draft.durationYears <= 0 || draft.monthlyContribution <= 0) {
      toast.error('Set a monthly contribution and duration to save')
      return
    }
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
      toast.success(`Saved · ${draft.durationYears}yr projection: ${money.formatDisplay(plan.projectedPortfolio)} · gain ${money.formatDisplay(plan.projectedGain)}`)
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
      {!isDesktop && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
          <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-bold text-primary">Best on desktop</p>
            <p className="mt-0.5 text-sm text-muted-foreground">This tool is easier to use on a larger screen. Open FinPath on desktop for the full investing planner.</p>
          </div>
        </div>
      )}
      <Card className="mb-6 overflow-hidden">
        <CardContent className="relative flex min-h-[170px] flex-col gap-6 px-5 py-5 sm:px-8 sm:py-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(169,245,199,0.14),transparent_62%)]" />
          <div className="relative">
            <p className="text-sm font-extrabold text-primary">Portfolio simulator</p>
            <p className="mt-2 break-words text-4xl font-extrabold leading-none text-foreground sm:text-[2.45rem]">
              {money.formatDisplay(plan.projectedPortfolio)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">Projected in {money.baseCurrency}</span>
              <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">Base value {money.formatBase(plan.projectedPortfolio)}</span>
              <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">{money.format(draft.monthlyContribution, contributionCurrency)}/{FREQ_LABELS[contributionFrequency]}</span>
              {draftBase.targetPortfolio > 0 && (
                <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">Target gap {money.formatDisplay(targetGap)}</span>
              )}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Estimated in {draft.durationYears} years at {draft.annualReturnRate}% annual return.
            </p>
          </div>
          <div className="relative flex flex-col gap-3 sm:flex-row lg:shrink-0">
            <Button className="px-9" onClick={saveSimulator} disabled={saveInvestmentConfig.isPending}>
              {saveInvestmentConfig.isPending ? 'Saving…' : 'Save simulator'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-xl">Growth simulation</CardTitle>
              <span className="text-xs font-bold text-muted-foreground">
                {draft.durationYears > 0 ? `${draft.durationYears}yr · tap bar to change` : 'tap a bar to set duration'}
              </span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-center px-6 pb-8 sm:px-8">
            {draftBase.monthlyContribution <= 0 || draft.durationYears <= 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center" style={{ height: '200px' }}>
                <p className="font-extrabold text-foreground">No simulation yet</p>
                <p className="mt-2 text-sm text-muted-foreground">Enter monthly contribution and expected return, then run the simulation.</p>
              </div>
            ) : (
              <div className="flex items-stretch justify-between gap-1" style={{ height: '200px' }}>
                {chartData.map((point) => (
                  <button
                    key={point.year}
                    type="button"
                    className="flex flex-1 flex-col items-center justify-end gap-1.5 pb-1"
                    onClick={() => setDuration(point.year)}
                    aria-label={`Use ${point.year} year duration`}
                    title={`${point.year} years: ${money.formatDisplay(point.value)}`}
                  >
                    <div
                      className={`w-full max-w-[20px] rounded-full transition-colors ${point.year === draft.durationYears ? 'bg-primary' : 'bg-muted hover:bg-muted/60'}`}
                      style={{ height: `${Math.max(8, (point.value / maxValue) * 168)}px` }}
                    />
                    <span className={`text-[9px] font-bold leading-none sm:text-[10px] ${point.year === draft.durationYears ? 'text-primary' : 'text-muted-foreground'}`}>{point.year}y</span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-xs text-muted-foreground">
              <p className="font-bold text-foreground/70">Assumptions</p>
              <ul className="mt-1.5 space-y-1 list-disc list-inside">
                <li>Fixed annual return — no fee drag or market volatility</li>
                <li>No tax or inflation adjustment included</li>
                <li>No platform or transaction fees</li>
                <li>Educational estimate only — not financial advice</li>
              </ul>
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
              <Label className="text-xs text-muted-foreground">Contribution currency</Label>
              <select
                aria-label="Contribution currency"
                className="mt-1 h-11 w-full rounded-xl border border-input bg-secondary px-3 text-sm font-extrabold text-foreground outline-none"
                value={contributionCurrency}
                onChange={event => setContributionCurrency(event.target.value)}
              >
                {CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Contribution frequency</Label>
              <select
                aria-label="Contribution frequency"
                className="mt-1 h-11 w-full rounded-xl border border-input bg-secondary px-3 text-sm font-extrabold text-foreground outline-none"
                value={contributionFrequency}
                onChange={event => setContributionFrequency(event.target.value as ContributionFrequency)}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
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
              [`Contribution per ${FREQ_LABELS[contributionFrequency]} (${contributionCurrency})`, 'monthlyContribution', formatNumberInput(draft.monthlyContribution)],
              [`Target portfolio (${targetCurrency})`, 'targetPortfolio', formatNumberInput(draft.targetPortfolio)],
              ['Expected return / year', 'annualReturnRate', String(draft.annualReturnRate)],
              ['Duration (years)', 'durationYears', String(draft.durationYears)],
              [`Initial capital (${money.baseCurrency})`, 'initialCapital', formatNumberInput(draft.initialCapital)],
            ] as [string, keyof SimulatorValues, string][]).map(([label, key, value]) => (
              <div key={key}>
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Input
                  aria-label={key === 'monthlyContribution' ? 'Monthly contribution' : key === 'targetPortfolio' ? 'Target portfolio' : key === 'initialCapital' ? 'Initial capital' : label}
                  className="mt-1 h-11 rounded-xl bg-secondary text-sm font-extrabold"
                  value={value}
                  onChange={event => updateDraft(key, event.target.value)}
                />
              </div>
            ))}
            <div>
              <Label className="text-xs text-muted-foreground">Target portfolio currency</Label>
              <select
                aria-label="Target portfolio currency"
                className="mt-1 h-11 w-full rounded-xl border border-input bg-secondary px-3 text-sm font-extrabold text-foreground outline-none"
                value={targetCurrency}
                onChange={event => setTargetCurrency(event.target.value)}
              >
                {CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>
      </div>

      {!glossaryDismissed && (
        <div className="mb-6 rounded-2xl border border-border bg-secondary">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            onClick={() => setGlossaryOpen(o => !o)}
            aria-expanded={glossaryOpen}
          >
            <div className="flex items-center gap-3">
              <BookOpen className="h-4 w-4 shrink-0 text-primary" />
              <span className="font-extrabold text-foreground">Investing basics</span>
              <span className="text-xs text-muted-foreground">New to investing? Tap to learn key terms.</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={e => { e.stopPropagation(); localStorage.setItem(GLOSSARY_DISMISSED_KEY, '1'); setGlossaryDismissed(true) }}
                className="shrink-0 rounded-full px-3 py-1 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Dismiss investing basics"
              >
                Dismiss
              </button>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${glossaryOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
          {glossaryOpen && (
            <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
              {GLOSSARY_ITEMS.map(item => (
                <div key={item.term} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="font-extrabold text-foreground">{item.term}</span>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{item.definition}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

      {draftBase.monthlyContribution > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-xl">Scenario comparison</CardTitle>
            <p className="text-sm text-muted-foreground">
              Same contribution ({money.format(draft.monthlyContribution, contributionCurrency)}/month) · {draft.durationYears > 0 ? `${draft.durationYears} years` : '10 years'} · different risk profiles
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 px-5 pb-6 sm:grid-cols-3 sm:px-8">
            {RISK_PROFILES.map((profile, i) => {
              const assumedReturn = SCENARIO_RETURNS[i]
              const scenarioPlan = calculateInvestmentPlan({
                ...draftBase,
                annualReturnRate: assumedReturn,
                durationYears: Math.max(1, draft.durationYears || 10),
              })
              return (
                <div key={profile.label} className="rounded-2xl border border-border bg-secondary p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-extrabold text-foreground">{profile.label}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">{assumedReturn}%/yr</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{profile.description}</p>
                  <div className="mt-3 flex gap-1">
                    {profile.allocation.map(item => (
                      <div key={item.name} className="flex-1 overflow-hidden rounded-full" style={{ background: item.color, height: 3 }} title={`${item.name} ${item.pct}%`} />
                    ))}
                  </div>
                  <p className="mt-3 text-lg font-extrabold text-primary">{money.formatDisplay(scenarioPlan.projectedPortfolio)}</p>
                  <p className="text-xs text-muted-foreground">Gain: {money.formatDisplay(scenarioPlan.projectedGain)}</p>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
