import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type Props = { readonly children: ReactNode }
type State = { readonly message: string | null }

/**
 * Without this, one bad render blanks the page and the athlete sees nothing at
 * all — which reads as "the button does nothing" rather than as a failure. The
 * message is shown rather than swallowed, because a silent white screen is the
 * hardest thing to report and the hardest thing to fix.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : 'Unbekannter Fehler' }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console -- the only trace a phone browser leaves
    console.error('Render fehlgeschlagen', error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children

    return (
      <section className="issue">
        <h2>Die Ansicht konnte nicht aufgebaut werden</h2>
        <p>{this.state.message}</p>
        <p>
          Neu laden hilft meistens. Bleibt es dabei, hilft der genaue Text oben beim Finden der
          Ursache.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Neu laden
        </button>
      </section>
    )
  }
}
