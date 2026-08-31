import { test, expect } from '@playwright/test'

// Guest-mode smoke flow: the whole loop works against local storage only,
// so the suite runs without Supabase or a Gemini key.

test('onboarding seeds a wallet, quick-add records an expense, history shows it', async ({ page }) => {
  await page.goto('/')

  // Onboarding: welcome → auto-setup → skip first transaction → finish
  await expect(page.getByText('Welcome to FinPath')).toBeVisible()
  await page.getByRole('button', { name: /get started/i }).click()
  await expect(page.getByText('Everything is ready')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page.getByText('Log your first transaction')).toBeVisible()
  // Skip finishes onboarding straight into the app (the tour step is only
  // reached after logging a first transaction).
  await page.getByRole('button', { name: /^skip$/i }).click()

  // Dashboard renders after onboarding
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible()

  // Quick add (desktop shortcut) → expense with a note
  await page.keyboard.press('n')
  await expect(page.getByRole('button', { name: 'Add expense' })).toBeVisible()
  await page.getByLabel('Amount').fill('25000')
  await page.getByLabel('Description').fill('E2E coffee')
  await page.getByRole('button', { name: 'Add expense' }).click()
  await expect(page.getByText('Transaction added')).toBeVisible()

  // History shows the new expense
  await page.goto('/transactions')
  await expect(page.getByText('E2E coffee')).toBeVisible()
})
