import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PortfolioTab } from '@/components/investing/PortfolioTab'
import { SimulatorTab } from '@/components/investing/SimulatorTab'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { Monitor } from 'lucide-react'

type InvestingTab = 'portfolio' | 'simulator'

export function Investing() {
  const isDesktop = useIsDesktop()
  const [tab, setTab] = useState<InvestingTab>('simulator')

  return (
    <div>
      <PageHeader
        title="Investing"
        subtitle="Track your real portfolio with live prices, or simulate future returns with compound projections."
      />

      {!isDesktop && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
          <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-bold text-primary">Best on desktop</p>
            <p className="mt-0.5 text-sm text-muted-foreground">This tool is easier to use on a larger screen.</p>
          </div>
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
