import { useState } from 'react'
import type { HeartNote } from '../../coach/types.ts'
import { ApiError, correctHeart } from '../api.ts'

/**
 * The estimate written back to intervals.icu, on the athlete's word only. The
 * first tap says what will change and that the app cannot undo it; only the
 * second writes. Once written, the recording reads clean and this disappears.
 */

type Props = {
  readonly heart: HeartNote
  readonly activityId: string
  readonly templateId: string
  readonly date: string
}

type Step =
  | { readonly kind: 'offer' }
  | { readonly kind: 'confirm' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'done'; readonly noted: boolean }
  | { readonly kind: 'failed'; readonly message: string }

export const HeartCorrection = ({ heart, activityId, templateId, date }: Props) => {
  const [step, setStep] = useState<Step>({ kind: 'offer' })
  if (!heart.writable) return null

  const write = async () => {
    setStep({ kind: 'busy' })
    try {
      const outcome = await correctHeart(activityId, templateId, date, {
        faultySeconds: heart.faultySeconds,
        correctedAverage: heart.correctedAverage,
      })
      setStep({ kind: 'done', noted: outcome.noted })
    } catch (caught) {
      setStep({
        kind: 'failed',
        message: caught instanceof ApiError ? caught.message : 'Das hat nicht geklappt. Bitte versuch es noch einmal.',
      })
    }
  }

  const minutes = Math.round(heart.faultySeconds / 60)
  const averages =
    heart.measuredAverage !== null && heart.correctedAverage !== null
      ? ` Der Schnitt der Einheit wird ${heart.correctedAverage} statt ${heart.measuredAverage} bpm.`
      : ''

  if (step.kind === 'done') {
    return (
      <div className="exec__heartfix">
        <p className="exec__note exec__note--heart">
          Puls in intervals.icu korrigiert.
          {step.noted
            ? ' Ein Vermerk an der Aktivität sagt, was geändert wurde.'
            : ' Der Vermerk an der Aktivität ließ sich nicht anlegen.'}
        </p>
      </div>
    )
  }

  if (step.kind === 'confirm' || step.kind === 'busy') {
    return (
      <div className="exec__heartfix" role="group" aria-label="Puls in intervals.icu korrigieren">
        <p className="exec__note exec__note--heart">
          Überschreibt in intervals.icu den Puls der {minutes} gestörten Minuten mit der Schätzung; der Rest der
          Aufzeichnung, Leistung und Tempo bleiben, wie sie sind.{averages} In der App lässt sich das nicht rückgängig
          machen.
        </p>
        <div className="exec__actions">
          <button type="button" disabled={step.kind === 'busy'} onClick={() => void write()}>
            {step.kind === 'busy' ? 'Schreibt…' : 'Überschreiben'}
          </button>
          <button type="button" disabled={step.kind === 'busy'} onClick={() => setStep({ kind: 'offer' })}>
            Abbrechen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="exec__heartfix">
      <div className="exec__actions">
        <button type="button" onClick={() => setStep({ kind: 'confirm' })}>
          In intervals.icu korrigieren
        </button>
        {step.kind === 'failed' && <p className="exec__note exec__note--action">{step.message}</p>}
      </div>
    </div>
  )
}
