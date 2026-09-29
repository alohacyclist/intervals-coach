/**
 * What an athlete reads when a request fails. The server's own words are kept
 * where it wrote them for people (a rejected input, a lockout, an intervals.icu
 * refusal it marked `forAthlete`); a crash, or a gateway page in place of the
 * server's answer, gets a calm sentence instead of "Fehler 500".
 */

export const OFFLINE = 0

const GENERIC = 'Das hat nicht geklappt. Bitte versuch es noch einmal.'

export const humanError = (status: number, serverMessage?: string, forAthlete = false): string => {
  if (status === OFFLINE) return 'Keine Verbindung. Prüf dein Netz und versuch es noch einmal.'
  if (forAthlete && serverMessage) return serverMessage
  if (status === 502 || status === 503 || status === 504) {
    return 'intervals.icu oder Strava antwortet gerade nicht. Bitte versuch es gleich noch einmal.'
  }
  if (status >= 500) return 'Da ist bei uns etwas schiefgelaufen. Bitte versuch es gleich noch einmal.'
  if (serverMessage) return serverMessage
  if (status === 401) return 'Du bist nicht mehr angemeldet. Bitte melde dich neu an.'
  if (status === 429) return 'Gerade zu viele Anfragen. Bitte versuch es in ein paar Minuten noch einmal.'
  return GENERIC
}
