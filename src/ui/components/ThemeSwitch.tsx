import { THEMES, THEME_LABELS, useTheme } from '../theme.ts'
import { t } from '../../coach/lang.ts'

export const ThemeSwitch = () => {
  const [theme, setTheme] = useTheme()

  return (
    <div className="mode" role="group" aria-label={t('Darstellung')}>
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={theme === option}
          onClick={() => setTheme(option)}
        >
          {THEME_LABELS[option]}
        </button>
      ))}
    </div>
  )
}
