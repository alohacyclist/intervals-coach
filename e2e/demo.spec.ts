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

  test('the dashboard on a phone shows the week, the findings and the rides', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: 'Dashboard' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('heading', { name: /^Diese Woche/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Befunde' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Fahrten' })).toBeVisible()
    // Every block is read in the end: the progress line goes away.
    await expect(page.locator('.dash-m progress')).toHaveCount(0)
    await expect(page.locator('.dash-m__findings li').first()).toBeVisible()
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

  test('the cockpit on a wide screen speaks English', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await signIn(page)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Training cockpit' })).toBeVisible()
    await expect(page.locator('.hud-tile')).toHaveCount(6)
    await expect(page.locator('.hud-tiles')).not.toHaveText(/[äöüß]/)
  })

  test('a tile opens large in front, the ride is read with a slider', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page)
    await page.goto('/dashboard')
    // The overview fits one screen: nothing to scroll before deciding whether to look closer.
    await expect(page.locator('.hud-tile')).toHaveCount(6)
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true)

    await page.getByRole('button', { name: /^Findings/ }).click()
    const focus = page.getByRole('dialog')
    await expect(focus.getByRole('heading', { name: 'Findings' })).toBeVisible()
    // Every steady block is a dot over the weeks; its label carries what makes two blocks comparable.
    await expect(focus.getByRole('img', { name: 'Heart rate drift per steady block' })).toBeVisible()
    await expect(focus.locator('.hud-pt').first()).toHaveAttribute('aria-label', /min at \d+ W · drift/)
    // A finding leads to its ride, where verdict and trace sit together.
    await focus.locator('.hud-al').first().click()
    await expect(focus.getByRole('heading', { name: 'Ride trace' })).toBeVisible()
    const slider = focus.getByRole('slider', { name: 'Choose ride time' })
    await expect(slider).toBeVisible()
    const before = await slider.getAttribute('aria-valuetext')
    await slider.focus()
    await page.keyboard.press('ArrowRight')
    await expect(slider).not.toHaveAttribute('aria-valuetext', before ?? '')
    // The arrow moved the slider, not the tile.
    await expect(focus.getByRole('heading', { name: 'Ride trace' })).toBeVisible()
    await expect(focus).not.toHaveText(/[äöüß]/)

    await focus.getByRole('button', { name: 'Next tile' }).click()
    await expect(focus.getByRole('heading', { name: 'Load' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(focus).toBeHidden()
    // Closing leaves nothing behind: the next tile opens and stays open.
    await page.getByRole('button', { name: /^Coverage/ }).click()
    await expect(focus.getByRole('heading', { name: 'Coverage' })).toBeVisible()
    await focus.getByRole('button', { name: 'Close' }).click()
    await expect(focus).toBeHidden()
    await page.getByRole('button', { name: /^Rides/ }).click()
    await expect(focus.getByRole('heading', { name: 'Rides' })).toBeVisible()
    await page.keyboard.press('Escape')
    // Efficiency is told apart by place, and says which way is better.
    await page.getByRole('button', { name: /^Efficiency/ }).click()
    await expect(focus.getByText('EF Outdoor, W/bpm')).toBeVisible()
    await expect(focus.getByText('EF Indoor, W/bpm')).toBeVisible()
    await expect(focus.locator('.hud-better').first()).toHaveText('↑higher is better')
    // A dot in the drift chart opens its ride.
    await focus.getByRole('button', { name: 'Previous tile' }).click()
    await focus.getByRole('button', { name: 'Previous tile' }).click()
    await focus.getByRole('button', { name: 'Previous tile' }).click()
    await expect(focus.getByRole('heading', { name: 'Findings' })).toBeVisible()
    await focus.locator('.hud-pt').first().click()
    await expect(focus.getByRole('heading', { name: 'Ride trace' })).toBeVisible()
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
