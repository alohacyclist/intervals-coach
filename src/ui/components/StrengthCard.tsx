import type { StrengthSuggestion } from '../../coach/types.ts'

export const StrengthCard = ({ strength }: { readonly strength: StrengthSuggestion }) => (
  <details className="strength">
    <summary>
      <span className="badge badge--strength">Kraft</span>
      <strong>{strength.name}</strong>
      <span className="strength__meta">{strength.minutes} min · optional</span>
    </summary>
    <table className="strength__table">
      <tbody>
        {strength.exercises.map((exercise) => (
          <tr key={exercise.name}>
            <td>{exercise.name}</td>
            <td>{exercise.sets}</td>
            <td>{exercise.load}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="strength__note">{strength.note}</p>
  </details>
)
