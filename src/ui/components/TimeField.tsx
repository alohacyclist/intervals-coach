import { useId } from 'react'

type Props = {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly error: string | null
  readonly placeholder?: string
}

/** A time typed as text, with what is wrong with it said right at the field. */
export const TimeField = ({ label, value, onChange, error, placeholder }: Props) => {
  const messageId = useId()
  return (
    <label>
      {label}
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : messageId}
      />
      {error !== null && (
        <small id={messageId} className="error">
          {error}
        </small>
      )}
    </label>
  )
}
