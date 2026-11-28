import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { t } from '../../coach/lang.ts'
import { TILES, tileTitle } from './model.ts'
import type { TileKey } from './model.ts'

const FLY_MS = 340

/** The tile grows from where it sat to the middle of the screen. */
const fly = (dialog: HTMLElement, from: DOMRect): void => {
  const to = dialog.getBoundingClientRect()
  const dx = from.left + from.width / 2 - (to.left + to.width / 2)
  const dy = from.top + from.height / 2 - (to.top + to.height / 2)
  dialog.animate(
    [
      { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${(from.width / to.width).toFixed(3)}, ${(from.height / to.height).toFixed(3)})`, opacity: 0.35 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: FLY_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  )
}

type Props = {
  /** The tile in front; null keeps the dialog shut. */
  readonly tile: TileKey | null
  /** Where the clicked tile sat, for the flight; null opens in place. */
  readonly origin: DOMRect | null
  readonly quiet: boolean
  readonly onClose: () => void
  readonly onStep: (direction: 1 | -1) => void
  readonly children: ReactNode
}

/**
 * One tile, large and in front. A native modal dialog: it traps the keyboard,
 * closes on Escape and sits in the top layer, clear of the receding deck.
 */
export const CockpitFocus = ({ tile, origin, quiet, onClose, onStep, children }: Props) => {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const open = tile !== null
  // The flight reads the origin of the click that opened the dialog, not of later steps.
  const flight = useRef({ origin, quiet })
  flight.current = { origin, quiet }

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      if (!flight.current.quiet && flight.current.origin) fly(dialog, flight.current.origin)
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    // A click on the dialog itself is a click on the veil around its content.
    const onClick = (event: MouseEvent) => {
      if (event.target === dialog) onClose()
    }
    // The slider and scrolling tables own the arrow keys; Alt+Arrow stays the browser's.
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.target instanceof HTMLInputElement) return
      if (event.target instanceof Element && event.target.closest('.hud-scroll')) return
      if (event.key === 'ArrowRight') onStep(1)
      if (event.key === 'ArrowLeft') onStep(-1)
    }
    dialog.addEventListener('click', onClick)
    dialog.addEventListener('keydown', onKey)
    return () => {
      dialog.removeEventListener('click', onClick)
      dialog.removeEventListener('keydown', onKey)
    }
  }, [onClose, onStep])

  return (
    <dialog ref={ref} className="hud-focus" aria-labelledby={titleId} onClose={onClose}>
      {tile && (
        <div className="hud-focus__frame">
          <header className="hud-focus__head">
            <h2 id={titleId} className="hud-lbl">{tileTitle(tile)}</h2>
            <div className="hud-focus__nav">
              <span className="hud-cap hud-mono" aria-hidden="true">{TILES.indexOf(tile) + 1} / {TILES.length}</span>
              <button type="button" className="hud-btn hud-btn--icon" aria-label={t('Vorherige Kachel')} onClick={() => onStep(-1)}>‹</button>
              <button type="button" className="hud-btn hud-btn--icon" aria-label={t('Nächste Kachel')} onClick={() => onStep(1)}>›</button>
              <button type="button" className="hud-btn hud-btn--icon" aria-label={t('Schließen')} onClick={onClose}>×</button>
            </div>
          </header>
          <span key={`sweep-${tile}`} className="hud-sweep" aria-hidden="true" />
          <div key={tile} className="hud-focus__body">{children}</div>
        </div>
      )}
    </dialog>
  )
}
