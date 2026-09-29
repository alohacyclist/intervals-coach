import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SessionCard } from '../src/ui/components/SessionCard.tsx'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { activity, baselineWellness, config, TODAY, wellness } from './fixtures.ts'

const state = buildState([activity(9, 'Ride'), activity(11, 'Run')], [wellness(0), ...baselineWellness()], TODAY)
const session = planDays(state, config, 3)
  .flatMap((day) => day.options)
  .find((option) => option.variants.length > 1)!

describe('toggle state for assistive technology', () => {
  it('marks exactly the chosen duration as pressed', () => {
    const html = renderToStaticMarkup(
      createElement(SessionCard, {
        session,
        date: TODAY,
        recommended: true,
        done: false,
        scheduledMinutes: [],
        destinations: [],
      }),
    )
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(session.variants.length - 1)
  })
})
