import { useEffect, useState } from 'react'
import type { Execution } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'
import { renderShareImage, shareImage } from '../share-image.ts'
import { drawableTrace } from '../trace-geometry.ts'

/** What can be done with one finished session: its picture to the phone's share sheet. */

type Props = {
  readonly execution: Execution
  readonly activityId: string
  readonly templateId: string
  readonly date: string
}

export const ExecutionActions = ({ execution, templateId, date }: Props) => {
  const [sharing, setSharing] = useState<'idle' | 'failed'>('idle')
  const [image, setImage] = useState<Blob | null>(null)
  const trace = drawableTrace(execution)

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

  if (!trace) return null

  return (
    <div className="exec__actions">
      <button type="button" disabled={!image} onClick={share}>
        {image ? 'Bild teilen' : 'Zeichnet…'}
      </button>
      {sharing === 'failed' && <p className="exec__note exec__note--action">Bild ließ sich nicht erzeugen.</p>}
    </div>
  )
}
