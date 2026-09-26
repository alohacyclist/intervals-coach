/** The one place the operator's details are written down. Both legal pages read them. */
export const OPERATOR = {
  name: 'Christian Müller',
  street: 'Uhlandstraße 12',
  city: '50931 Köln',
  country: 'Deutschland',
  email: 'alohacyclist@icloud.com',
} as const

/** Named because Art. 13 (2) (d) GDPR requires the supervisory authority to be identified. */
export const SUPERVISOR = {
  name: 'Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen',
  street: 'Kavalleriestraße 2–4',
  city: '40213 Düsseldorf',
  url: 'https://www.ldi.nrw.de',
} as const

/**
 * Processor. Under the EU-US Data Privacy Framework plus standard contractual
 * clauses; the operator concludes the data processing addendum in the Cloudflare
 * dashboard. Verify the framework listing before every publication.
 */
export const PROCESSOR = {
  name: 'Cloudflare, Inc.',
  address: '101 Townsend St, San Francisco, CA 94107, USA',
} as const

/**
 * Sends the waitlist's confirmation and launch mails and keeps the list. EU based,
 * so no transfer to a third country; the operator concludes the data processing
 * agreement in the Brevo account. Verify the address before every publication.
 */
export const MAILER = {
  name: 'Sendinblue SAS (Brevo)',
  address: '106 boulevard Haussmann, 75008 Paris, Frankreich',
} as const

/** Inactive accounts are erased after this long — enforced by the key lifetime in KV. */
export const RETENTION_MONTHS = 12
