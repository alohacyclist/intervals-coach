/** Three days are what the plan stands for; seven show where the week is heading. */
export const SHORT_HORIZON = 3
export const LONG_HORIZON = 7
export type PlanHorizon = typeof SHORT_HORIZON | typeof LONG_HORIZON

const HORIZON_KEY = 'plan-horizon'

/** Private browsing modes throw on storage access; the plan then opens on three days. */
export const readHorizon = (): PlanHorizon => {
  try {
    return Number(window.localStorage.getItem(HORIZON_KEY)) === LONG_HORIZON ? LONG_HORIZON : SHORT_HORIZON
  } catch {
    return SHORT_HORIZON
  }
}

export const keepHorizon = (horizon: PlanHorizon): void => {
  try {
    window.localStorage.setItem(HORIZON_KEY, String(horizon))
  } catch {
    // Holds for this visit, not the next.
  }
}
