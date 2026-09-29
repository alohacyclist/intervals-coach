import { useId } from 'react'
import type { ReactNode } from 'react'
import { GLOSSARY } from '../glossary.ts'
import type { GlossaryTerm } from '../glossary.ts'

type Props = {
  readonly term: GlossaryTerm
  readonly children: ReactNode
}

/**
 * A term that explains itself on tap. A native popover rather than a `title`:
 * a phone has no hover, and a screen reader reaches a button but not a tooltip.
 */
export const Term = ({ term, children }: Props) => {
  const id = `term-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const entry = GLOSSARY[term]
  return (
    <>
      <button type="button" className="term" popoverTarget={id}>
        {children}
        <span className="term__mark" aria-hidden="true">
          ?
        </span>
        <span className="sr-only"> (Erklärung)</span>
      </button>
      <span id={id} popover="auto" role="note" className="term__pop">
        <strong>{entry.name}</strong>
        <span>{entry.what}</span>
        <span className="term__why">{entry.why}</span>
        <button type="button" popoverTarget={id} popoverTargetAction="hide">
          Schließen
        </button>
      </span>
    </>
  )
}
