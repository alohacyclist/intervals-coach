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
A training planner for athletes whose training time is short and unpredictable. It reads
an athlete's recent activities and wellness data from intervals.icu and proposes the next
three days. For every sport the athlete trains — cycling, running, swimming, in any
combination — each day carries one session, so they can take whichever fits that day
without losing the training stimulus. Sessions come from a fixed workout library and are
chosen from form (CTL/ATL/TSB per sport), time since the last hard session, HRV and
resting heart rate against the athlete's own 30-day baseline, and the phase derived from
their goal date. Rest days are part of the plan rather than the absence of one. Selected
workouts can be written to the intervals.icu calendar as structured workouts, and the
pairing intervals.icu performs between a planned workout and the activity that fulfilled
it is read back, so the plan progresses on what was actually completed.

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
Reading: `ACTIVITY:READ WELLNESS:READ`
Writing: `CALENDAR:WRITE`, plus whichever scopes cover the two settings writes
below — I could not find them documented, so please tell me the right ones, or
whether those endpoints are off limits to OAuth clients and I should drop the
features.

- `ACTIVITY:READ` — compute fitness, fatigue and form per sport, detect when the
  last hard session was, and read the pairing between a planned workout and the
  activity that fulfilled it so the plan progresses on what was really done
- `WELLNESS:READ` — HRV, resting heart rate and sleep against the athlete's own
  baseline, to decide whether today should be a quality day
- `CALENDAR:WRITE` — write the selected workout to the athlete's calendar

Two settings writes, both only on an explicit click by the athlete, never in the
background:

- `PUT /athlete/{id}/sport-settings/{type}` — keep FTP and threshold pace in step
  with the value the athlete has just adopted in the app. It matters because
  intervals.icu computes load, intensity and workout compliance from its own
  numbers; leaving them stale feeds wrong figures back into the plan.
- `PUT /athlete/{id}` — toggle the `*_upload_workouts` flags so a planned session
  reaches the athlete's watch, head unit or trainer. I am aware this endpoint
  covers the whole athlete record: the app reads the record, changes only that
  one flag and writes it back unchanged otherwise. If you would rather not hand
  out that endpoint, a narrower one would work just as well — or I will simply
  point athletes at your settings page instead.

No write access to activities and no delete access anywhere is needed.

**Scale**
Currently myself plus a handful of training partners. No commercial use, no data resale.
Training and wellness data are fetched per request and not stored; only the OAuth tokens
(encrypted) and the athlete's own goal configuration are persisted.

Thanks for building and maintaining intervals.icu — and for keeping the API open.

Best regards,
[Your name]
