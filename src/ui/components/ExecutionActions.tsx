import { useEffect, useState } from 'react'
import type { Execution } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'
import type { StravaStatus } from '../api.ts'
import { getStrava, postToStrava } from '../api.ts'
import { renderShareImage, shareImage } from '../share-image.ts'
import { drawableTrace } from '../trace-geometry.ts'

/**
 * What can be done with one finished session: its picture to the share sheet,
 * its summary under it on Strava. The cron writes the summary on its own; the
 * button is for the athlete who wants it there now, or again.
 */

type Props = {
  readonly execution: Execution
  readonly activityId: string
  readonly templateId: string
  readonly date: string
}

type Sending = 'idle' | 'busy' | 'posted' | 'not-found' | 'failed'

const NOTES: Readonly<Partial<Record<Sending, string>>> = {
  posted: 'Steht jetzt in der Beschreibung auf Strava.',
  'not-found': 'Auf Strava nicht gefunden — ist die Einheit dort schon hochgeladen?',
  failed: 'Strava hat gerade nicht geantwortet. Später noch einmal versuchen.',
}

export const ExecutionActions = ({ execution, activityId, templateId, date }: Props) => {
  const [strava, setStrava] = useState<StravaStatus | null>(null)
  const [sending, setSending] = useState<Sending>('idle')
  const [sharing, setSharing] = useState<'idle' | 'failed'>('idle')
  const [image, setImage] = useState<Blob | null>(null)
  const trace = drawableTrace(execution)

  useEffect(() => {
    let current = true
    void getStrava().then((status) => current && setStrava(status))
    return () => {
      current = false
    }
  }, [])

  const send = async () => {
    setSending('busy')
    try {
      const outcome = await postToStrava(activityId, templateId, date)
      setSending(outcome.status === 'posted' ? 'posted' : 'not-found')
    } catch {
      setSending('failed')
    }
  }

  // Drawn ahead: iOS opens the share sheet only straight from a tap, not after
  // an await in between, so the tap must find the picture ready.
  useEffect(() => {
    const drawable = drawableTrace(execution)
    if (!drawable) return
    let current = true
    renderShareImage(execution, drawable, { sport: SPORT_LABELS[execution.sport], date }).then(
      (blob) => current && setImage(blob),
      () => current && setSharing('failed'),
    )
    return () => {
      current = false
    }
  }, [execution, date])

  const share = () => {
    if (!image) return
    setSharing('idle')
    shareImage(image, `${date}-${templateId}`).catch((caught: unknown) =>
      // Closing the share sheet is not a failure.
      setSharing(caught instanceof DOMException && caught.name === 'AbortError' ? 'idle' : 'failed'),
    )
  }

  const posted = sending === 'posted' || (strava?.posted.includes(activityId) ?? false)
  if (!trace && !strava?.connected) return null

  return (
    <div className="exec__actions">
      {trace && (
        <button type="button" disabled={!image} onClick={share}>
          {image ? 'Bild teilen' : 'Zeichnet…'}
        </button>
      )}
      {strava?.connected && (
        <button type="button" disabled={sending === 'busy'} onClick={() => void send()}>
          {sending === 'busy' ? 'Schreibt…' : posted ? 'Auf Strava erneuern' : 'Auf Strava ergänzen'}
        </button>
      )}
      {posted && sending !== 'posted' && <span className="exec__sent readout">Auf Strava ✓</span>}
      {NOTES[sending] && <p className="exec__note exec__note--action">{NOTES[sending]}</p>}
      {sharing === 'failed' && <p className="exec__note exec__note--action">Bild ließ sich nicht erzeugen.</p>}
    </div>
  )
}
