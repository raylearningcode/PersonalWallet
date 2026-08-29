import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PortfolioTab } from '@/components/investing/PortfolioTab'
import { SimulatorTab } from '@/components/investing/SimulatorTab'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { safeGet } from '@/lib/utils'
import { Monitor, X } from 'lucide-react'

const INVESTING_BANNER_KEY = 'finpath_investing_banner_dismissed'
type InvestingTab = 'portfolio' | 'simulator'

export function Investing() {
  const isDesktop = useIsDesktop()
  const [tab, setTab] = useState<InvestingTab>('simulator')
  const [bannerDismissed, setBannerDismissed] = useState(() => safeGet(INVESTING_BANNER_KEY) === '1')

  return (
    <div>
      <PageHeader
        title="Investing"
        subtitle="Track your real portfolio with live prices, or simulate future returns with compound projections."
      />

      {!isDesktop && !bannerDismissed && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
          <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1">
            <p className="font-bold text-primary">Best on desktop</p>
            <p className="mt-0.5 text-sm text-muted-foreground">This tool is easier to use on a larger screen.</p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
            onClick={() => { localStorage.setItem(INVESTING_BANNER_KEY, '1'); setBannerDismissed(true) }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Tabs value={tab} onValueChange={v => setTab(v as InvestingTab)} className="mb-6">
        <TabsList className="w-full max-w-sm">
          <TabsTrigger value="simulator" className="flex-1">
            Simulator
          </TabsTrigger>
          <TabsTrigger value="portfolio" className="flex-1">
            Portfolio
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'simulator' && <SimulatorTab />}
      {tab === 'portfolio' && <PortfolioTab />}
    </div>
  )
}
