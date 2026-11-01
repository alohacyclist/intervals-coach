import { describe, expect, it } from 'vitest'
import { estimatePower, estimateRide, findBlocks, workGroups } from '../src/coach/speed-power.ts'
import { findTemplate } from '../src/coach/library.ts'
import type { Block } from '../src/coach/types.ts'
import { FTP, RIDER_KG, fortyTwenty, simulate } from './ride-sim.ts'

const template = (id: string): readonly Block[] => {
  const found = findTemplate(id)
  if (!found) throw new Error(`no template ${id}`)
  return found.blocks
}

describe('power from speed and the climb', () => {
  it('needs the altitude: without it every hill would be read as an effort', () => {
    const { streams } = simulate(() => 180, 1200)
    expect(estimatePower({ ...streams, altitude: null }, RIDER_KG)).toBeNull()
    expect(estimateRide({ ...streams, altitude: null }, RIDER_KG, FTP, null)).toBeNull()
  })

  it('lands near what a steady ride took, wind and drag unknown', () => {
    const { streams } = simulate(() => 180, 3600)
    const estimate = estimateRide(streams, RIDER_KG, FTP, null)
    expect(estimate).not.toBeNull()
    // 180 W for an hour at FTP 289 is 39 TSS. Drag a little off and a loop in the wind take it
    // up by a third or more: rough, but a ride that counts instead of one that does not.
    expect(estimate!.averageWatts).toBeGreaterThan(180 * 0.9)
    expect(estimate!.averageWatts).toBeLessThan(180 * 1.3)
    expect(estimate!.load).toBeGreaterThan(35)
    expect(estimate!.load).toBeLessThan(39 * 1.45)
    expect(estimate!.blocks).toEqual([])
  })

  it('does not take a red light or a descent for an effort', () => {
    const { streams } = simulate(() => 170, 1800, 3, [400, 900])
    const series = estimatePower(streams, RIDER_KG)!
    const readableAt = (second: number) => series.readable[second]
    // Braking and standing say nothing about the legs.
    expect(readableAt(405)).toBe(0)
    expect(readableAt(915)).toBe(0)
  })
})

describe('the sets of a session in a ride without power', () => {
  it('reads the session as its sets, the rests between them only what lies around', () => {
    const groups = workGroups(template('bike-vo2-3040'))
    expect(groups).toHaveLength(3)
    expect(groups.every((group) => group.segments.length === 12 && group.pad === 0)).toBe(true)
    // A lone long effort is set off against the riding either side.
    const solo = workGroups([{ kind: 'step', duration: '20m', target: '100%' }])
    expect(solo[0]?.pad).toBe(120)
  })

  it('finds all three sets of a 40/20 where they were ridden', () => {
    const ride = simulate(fortyTwenty(1230), 4800, 11, [300, 3600])
    const estimate = estimateRide(ride.streams, RIDER_KG, FTP, template('bike-vo2-3040'))!
    expect(estimate.blocks.map((block) => block.verdict)).toEqual(['found', 'found', 'found'])
    estimate.blocks.forEach((block, index) => {
      expect(Math.abs(block.startSecond - (1230 + index * 600))).toBeLessThanOrEqual(10)
      expect(block.targetWatts).toBe(Math.round(FTP * 1.25))
      expect(block.workWatts).toBeGreaterThan(361 * 0.75)
      expect(block.workWatts).toBeLessThan(361 * 1.35)
      expect(block.restWatts).toBeLessThan(block.workWatts)
    })
    // The work counts where VO2max is counted, not smeared into threshold.
    const vo2 = (estimate.zoneSeconds['Z5'] ?? 0) + (estimate.zoneSeconds['Z6'] ?? 0) + (estimate.zoneSeconds['Z7'] ?? 0)
    expect(vo2).toBeGreaterThan(600)
  })

  it('says so when a set was not ridden', () => {
    const twoSets = (second: number) => (second >= 1830 && second < 2190 ? 160 : fortyTwenty(1230)(second))
    const estimate = estimateRide(simulate(twoSets, 4800, 5).streams, RIDER_KG, FTP, template('bike-vo2-3040'))!
    expect(estimate.blocks.filter((block) => block.verdict === 'found')).toHaveLength(2)
    expect(estimate.blocks.some((block) => block.verdict === 'missing')).toBe(true)
  })

  it('finds no 40/20 in a steady ride with the odd surge and red light', () => {
    const surges = (second: number) => (second % 470 < 15 ? 330 : 165)
    const ride = simulate(surges, 4800, 23, [700, 1900, 3300])
    const blocks = findBlocks(template('bike-vo2-3040'), estimatePower(ride.streams, RIDER_KG)!, FTP)
    expect(blocks).toHaveLength(3)
    expect(blocks.some((block) => block.verdict === 'found')).toBe(false)
  })

  it('finds long threshold intervals too', () => {
    const threshold = (second: number) => {
      const into = second - 900
      return into >= 0 && into < 3 * 1020 && into % 1020 < 720 ? 290 : 150
    }
    const estimate = estimateRide(simulate(threshold, 4800, 17).streams, RIDER_KG, FTP, template('bike-thr-3x12'))!
    expect(estimate.blocks).toHaveLength(1)
    expect(estimate.blocks[0]?.verdict).toBe('found')
    expect(Math.abs((estimate.blocks[0]?.startSecond ?? 0) - 900)).toBeLessThanOrEqual(30)
  })
})
