# OAuth client request — email to david@intervals.icu

Fill in every `[...]` before sending. The five bracketed items are the only things
missing; everything else is ready.

---

**To:** david@intervals.icu
**Subject:** OAuth application request — Intervals Coach

Hi David,

I'd like to request an OAuth client for a small app I've built on top of the
intervals.icu API. Details as requested in the API guide:

**App name**
Intervals Coach

**Description**
A training planner that reads an athlete's recent activities and wellness data from
intervals.icu and proposes the next three days. Each day offers one cycling and one
running session as equivalent alternatives, so athletes with limited or unpredictable
time can pick whichever fits that day without losing the training stimulus. Sessions are
selected from a fixed workout library based on form (CTL/ATL/TSB per sport), time since
the last hard session, HRV and resting heart rate against the athlete's own 30-day
baseline, and the phase derived from their goal date. Planned workouts can be written
back to the intervals.icu calendar as structured workouts.

**Website URL**
[https://your-domain.example]

**Logo image URL**
[https://your-domain.example/logo.png — square, at least 128x128]

**Privacy policy URL**
[https://your-domain.example/datenschutz]

**Redirect URIs**
- [https://your-domain.example/auth/callback]
- http://localhost:8787/auth/callback

**Scopes requested**
`ACTIVITY:READ WELLNESS:READ CALENDAR:WRITE`

- `ACTIVITY:READ` — compute fitness, fatigue and form per sport, and detect when the
  last hard session was
- `WELLNESS:READ` — HRV, resting heart rate and sleep, compared against the athlete's
  own baseline, to decide whether today should be a quality day
- `CALENDAR:WRITE` — write the selected workout to the athlete's calendar so it syncs to
  their trainer or watch

No write access to activities and no delete access is needed.

**Scale**
Currently myself plus a handful of training partners. No commercial use, no data resale.
Training and wellness data are fetched per request and not stored; only the OAuth tokens
(encrypted) and the athlete's own goal configuration are persisted.

Thanks for building and maintaining intervals.icu — and for keeping the API open.

Best regards,
[Your name]
