export const MOBILE_FEATURES = {
  showInvestingFull: false,
  showPlanningFull: false,
  showReportsFull: false,
  showQuickAddCash: true,
  showDesktopAdminLinks: false,
  showAICardByDefault: false,
  maxHomeInsights: 4,
  maxHomeGoals: 1,
  showCashChangeAssistant: true,
} as const

export type MobileFeatureKey = keyof typeof MOBILE_FEATURES
