import { LANGS, t } from '../../coach/lang.ts'
import { LANGUAGE, chooseLanguage } from '../language.ts'

/** The same control as the theme: one more choice, no new kind of switch. */
export const LanguageSwitch = () => (
  <div className="mode" role="group" aria-label={t('Sprache')}>
    {LANGS.map((option) => (
      <button key={option} type="button" lang={option} aria-pressed={LANGUAGE === option} onClick={() => chooseLanguage(option)}>
        {option.toUpperCase()}
      </button>
    ))}
  </div>
)
