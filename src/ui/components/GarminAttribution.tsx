import type { GarminAttribution as Attribution } from '../../coach/types.ts'

/**
 * Required by Garmin's API brand guidelines, which intervals.icu passes on:
 * right under the data it concerns, never in a footnote, and only where Garmin
 * data is actually involved. Device names stay as Garmin writes them.
 */
export const garminText = (attribution: Attribution): string =>
  attribution.devices.length > 0
    ? `Teilweise abgeleitet aus Daten von Garmin-Geräten: ${attribution.devices.join(', ')}`
    : 'Teilweise abgeleitet aus Daten von Garmin-Geräten'

export const GarminAttribution = ({ attribution }: { readonly attribution: Attribution | null | undefined }) =>
  attribution ? <p className="hint attribution">{garminText(attribution)}</p> : null

/** One session recorded on a Garmin: "Garmin Edge 530". */
export const GarminDevice = ({ device }: { readonly device: string | null | undefined }) =>
  device ? <p className="hint attribution">{device}</p> : null
