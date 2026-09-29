# OAuth client request — email to david@intervals.icu

Before sending: open `https://formkurve.org/logo.png` (must load, square, ≥128 px — the
source is 512 × 512) and `https://formkurve.org/datenschutz` (must carry real contact
details, not the draft placeholders). Attach two or three screenshots made from demo
data, never from a real account: the site sits behind a password until the OAuth client
exists, so they are the only way David can see the app.

---

**To:** david@intervals.icu
**Subject:** OAuth application request — Formkurve

Hi David,

I'd like to request an OAuth client for a small app built on the intervals.icu API. The
details from the API guide are below; a few screenshots made with demo data are
attached, since the site is behind a password until OAuth is in place.

**App name**
Formkurve

**Description**
A training planner for athletes whose time is short and unpredictable. Each morning it
reads recent activities and wellness from intervals.icu and proposes the next three days:
one session per sport the athlete trains (cycling, running, swimming), each also as a
shorter version, so they can take whichever fits the day without losing the stimulus.
Sessions come from a fixed workout library and are chosen from fitness, fatigue and form
per sport, time since the last hard session, HRV and resting heart rate against the
athlete's own 30-day baseline, and the training phase derived from their goal date.

After a session, the app compares what was planned with what was done, interval by
interval: it reads the activity's detected intervals and its power, pace and heart rate
streams to show time spent in each target band. It also schedules a threshold test every
few weeks and reads the result from the test's intervals.

Selected workouts can be written to the intervals.icu calendar as structured workouts,
and the pairing between a planned workout and the activity that fulfilled it is read back,
so progression follows what was actually completed.

**Website URL**
https://formkurve.org

**Logo image URL**
https://formkurve.org/logo.png

**Privacy policy URL**
https://formkurve.org/datenschutz

**Redirect URIs**
- https://formkurve.org/auth/callback
- http://localhost:8787/auth/callback

**Scopes**
`ACTIVITY:READ WELLNESS:READ CALENDAR:WRITE`, plus whatever covers the settings access
below — I could not find it documented (I assume `SETTINGS:READ` / `SETTINGS:WRITE`).
If those endpoints are off limits for OAuth clients, I'll drop the features.

- `ACTIVITY:READ` — fitness, fatigue and form per sport; the last hard session; planned
  vs. completed pairing; intervals and streams of a single activity for the comparison
- `WELLNESS:READ` — HRV, resting heart rate and sleep against the athlete's baseline, and
  the eFTP estimate
- `CALENDAR:WRITE` — write the chosen workout to the athlete's calendar

Settings access, each write only on an explicit click by the athlete, never in the
background:

- `GET /athlete/{id}/sport-settings` — prefill FTP, threshold pace and CSS at sign-up
- `PUT /athlete/{id}/sport-settings/{type}` — keep FTP and threshold pace in step when the
  athlete adopts a new value in the app (for example after a test), since intervals.icu
  computes load and compliance from its own numbers
- `GET /athlete/{id}` and `PUT /athlete/{id}` — show which devices are linked and set
  the `*_upload_workouts` flags, so a session reaches the right watch, head unit or
  trainer. Only the single flag is sent, never the whole record. If you'd rather not
  expose this, I'll point athletes to your settings page instead.

No write access to activities or wellness, and no delete access anywhere.

**Scale and business model**
It starts as a free beta: my training partners first, then an open beta announced in the
forum. I expect a few dozen athletes in the first months and at most a few hundred in the
first year — well below the 500 users of the default allowance; if it ever gets close, I'll
write before, not after. Free during the beta. A paid tier may follow later to cover
running costs; before introducing one I'd talk it through with you first, and I'm happy
to align it with your terms and your supporters. No data resale, no advertising, ever.

**Data and API usage**
Training and wellness data are fetched when the athlete opens the app and not stored;
answers are kept for at most five minutes, encrypted, so a reload does not ask the API
again, and every write clears them. Only the OAuth tokens (AES-GCM encrypted) and each
athlete's goal settings are persisted. Athletes give explicit consent for health data
(GDPR Art. 9) before connecting. A plan takes five to six requests; an optional Strava
feature looks for new sessions only on days with a proposed workout, backing off to once
every two hours — around 10–25 requests per connected athlete and day. Requests are
throttled per athlete, and the logs warn when the daily allowance runs low. Data from
Garmin devices is attributed as Garmin's API brand guidelines require.

Thanks for building intervals.icu and keeping the API open.

Best regards,
Christian Müller
