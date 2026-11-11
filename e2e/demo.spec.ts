import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { DEMO_PASSWORD } from '../playwright.config.ts'

const signIn = async (page: Page): Promise<void> => {
  await page.goto('/')
  await page.locator('input[type=password]').fill(DEMO_PASSWORD)
  await page.keyboard.press('Enter')
  await expect(page.locator('.footer')).toBeVisible()
}

test.describe('in German', () => {
  test.use({ locale: 'de-DE' })

  test('a wrong password is refused in words', async ({ page }) => {
    await page.goto('/')
    await page.locator('input[type=password]').fill('falsch')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toContainText('Passwort falsch')
  })

  test('the plan opens on today and three days', async ({ page }) => {
    await signIn(page)
    await expect(page.locator('.line__stop-item')).toHaveCount(3)
    await expect(page.locator('.panel__tag')).toHaveText(['Heute', 'Morgen', /.+/])
    await expect(page.locator('.line__panel:not([hidden]) h2')).not.toBeEmpty()
    await expect(page.getByText('Demo mit Beispieldaten')).toBeVisible()
  })

  test('the whole week is shown on request, the far days as an outlook, and the choice is kept', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: '+ Ganze Woche zeigen' }).click()
    await expect(page.locator('.line__stop-item')).toHaveCount(7)
    await expect(page.locator('.line__stop-item--outlook')).toHaveCount(4)

    await page.locator('.line__stop-item--outlook > button.line__row').first().click()
    await expect(page.locator('.line__panel:not([hidden]) .panel__outlook')).toContainText('Ausblick')

    await page.reload()
    await expect(page.locator('.line__stop-item')).toHaveCount(7)
    await page.getByRole('button', { name: '− Nur die nächsten drei Tage' }).click()
    await expect(page.locator('.line__stop-item')).toHaveCount(3)
  })

  test('a wish for today changes today', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(page.locator('.line__panel:not([hidden]) .panel__facts').first()).toContainText('Ruhetag')
  })

  test('progress shows the curve, the weeks and the levels', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: 'Verlauf' }).click()
    await expect(page).toHaveURL(/\/verlauf$/)
    await expect(page.getByText('Fitness und Ermüdung')).toBeVisible()
    await expect(page.getByText('Wochenlast')).toBeVisible()
    await expect(page.getByText('Stufen', { exact: true })).toBeVisible()
  })
})

test.describe('in English', () => {
  test.use({ locale: 'en-GB' })

  test('a browser that is not German reads English, from the server too', async ({ page }) => {
    await signIn(page)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('.panel__tag').first()).toHaveText('Today')
    await expect(page.getByRole('button', { name: 'Rest', exact: true })).toBeVisible()
    // Written by the server: the reason for the day.
    await expect(page.locator('.line__panel:not([hidden]) .panel__facts').nth(1)).not.toHaveText(/[äöüß]/)
  })

  test('the language switch is remembered', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: 'DE', exact: true }).click()
    await expect(page.locator('.panel__tag').first()).toHaveText('Heute')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
    await page.getByRole('button', { name: 'EN', exact: true }).click()
    await expect(page.locator('.panel__tag').first()).toHaveText('Today')
  })
})

test('without a connection the app opens from its kept files and says so, then carries on', async ({ page, context }) => {
  await signIn(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  // No plan and no wellness value may be kept: only the program.
  const kept = await page.evaluate(async () => {
    const names = await caches.keys()
    const requests = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()))
    return requests.flat().map((request) => new URL(request.url).pathname)
  })
  expect(kept.length).toBeGreaterThan(0)
  expect(kept.filter((path) => path.startsWith('/api/') || path.startsWith('/auth/'))).toEqual([])

  await context.setOffline(true)
  await page.goto('/app')
  await expect(page.getByRole('alert')).toBeVisible()

  await expect(page.getByRole('alert').getByRole('button')).toBeVisible()

  // Back online the app carries on by itself: nobody has to find the button.
  await context.setOffline(false)
  await expect(page.locator('.footer')).toBeVisible()
})
