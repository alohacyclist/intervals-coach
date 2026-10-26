# OAuth client application — intervals.icu form

The client is requested through the form at `https://intervals.icu/oauth/apply`, logged in
as the athlete who will own the app. It stays "Pending" until approved, but client id and
secret are available right away under "Manage App" in `/settings/apps`
([guide, post 1](https://forum.intervals.icu/t/intervals-icu-oauth-support/2759)).
Once the integration is tested, a short mail with a link to the management page asks for
the listing in the public app directory.

Before submitting: open `https://formkurve.org/logo.png` and `https://formkurve.org/datenschutz`
in a browser — the logo must load (square, ≥128 px; the source is 512 × 512), the privacy
page must show the real operator details from `src/ui/legal/operator.ts`.

## Form fields

**App name**

```
Formkurve
```

**Description**

```
Formkurve is a training planner for athletes with short, unpredictable time. Each morning it reads recent activities and wellness from intervals.icu and proposes the next three days for cycling, running and swimming, each session also in a shorter version. After a session it compares planned and completed work interval by interval. A chosen workout is written to the intervals.icu calendar only when the athlete clicks to send it; the app never deletes training data.
```

**Website URL**

```
https://formkurve.org
```

**Logo** — upload `public/logo.png`.

**Privacy policy URL**

```
https://formkurve.org/datenschutz
```

**Redirect URIs** — `www.` requests are redirected to the bare host by the Worker, so the
callback only ever runs on these two origins:

```
https://formkurve.org/auth/callback
http://localhost:8787/auth/callback
```

**Scopes** — must match `SCOPES` in `worker/oauth.ts`:

```
ACTIVITY:READ,WELLNESS:READ,CALENDAR:WRITE,SETTINGS:WRITE
```

## If David asks about the scopes

- `ACTIVITY:READ` — fitness, fatigue and form per sport; the last hard session; planned vs.
  completed pairing; intervals and streams of a single activity for the comparison.
- `WELLNESS:READ` — HRV, resting heart rate and sleep against the athlete's 30-day
  baseline, and the eFTP estimate.
- `CALENDAR:WRITE` — read planned workouts and write the chosen workout to the calendar.
- `SETTINGS:WRITE` — each write only on an explicit click, never in the background:
  - `GET /athlete/0` — name and timezone at sign-in, so the plan's days are the athlete's days
  - `GET /athlete/{id}/sport-settings` — prefill FTP, threshold pace and CSS at sign-up
  - `PUT /athlete/{id}/sport-settings/{type}` — keep FTP and threshold pace in step when the
    athlete adopts a new value in the app, since intervals.icu computes load and compliance
    from its own numbers
  - `GET /athlete/{id}` and `PUT /athlete/{id}` — show linked devices and set a single
    `*_upload_workouts` flag, never the whole record

  Fallback if `SETTINGS:WRITE` is not granted: `SETTINGS:READ`, and athletes are pointed to
  the intervals.icu settings page for thresholds and device uploads.

No write access to activities or wellness. The only DELETE is `/api/v1/disconnect-app`,
called when an athlete deletes their Formkurve account.

## If David asks about data and scale

- Training and wellness data are fetched when the athlete opens the app and not stored;
  responses are cached for at most five minutes, encrypted, and every write clears them.
  Only OAuth tokens (AES-GCM) and each athlete's goal settings are persisted.
- Explicit consent for health data (GDPR Art. 9) before connecting.
- Five to six requests per plan; with the optional Strava feature around 10–25 requests per
  athlete and day, throttled per athlete.
- Garmin data is attributed as Garmin's brand guidelines require.
- Free beta: training partners first, then an open beta announced in the forum. A paid tier
  may follow to cover running costs; it will be discussed with David before it is
  introduced. No data resale, no advertising.
