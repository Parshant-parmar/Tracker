# Study Time

A quiet, manual study timesheet. React + Vite, no backend, no accounts. All study data lives in the browser's **IndexedDB**.

## Run

```
npm install
npm run dev        # local
npm test           # data-layer checks + UI smoke test
npm run build      # static output in dist/
```

## Deploy on Render (static site)

- Build command: `npm install && npm run build`
- Publish directory: `dist`
- (or use the included `render.yaml`)

Render only hosts the app. Study data stays in each browser. Use **Settings → Export Progress** to move between browsers/devices, then **Import Progress**. Hash routing (`#/history`) means no rewrite rules are needed.

## How data is stored

| Store | Contents |
|---|---|
| `sessions` | id, startDateTime, endDateTime (epoch ms), status (`active`/`completed`), dayKey, createdAt, updatedAt |
| `days` | dayKey, status (`completed`/`open`), completedAt, reopenCount, events |
| `cycles` | 7-day cycles: id, index, status, dayKeys |
| `examModes` | from, to, status, history (edits / early endings are kept) |
| `meta` | settings, app info |

Sessions are the source of truth. Durations, daily totals, 7-day reports, averages and monthly reports are calculated from raw sessions on demand (`src/lib/logic.js`), never stored as the only copy.

- Starting a session saves only `startDateTime`. There is no timer. An active session is found again by reading IndexedDB on load, on focus, and when another tab writes.
- "Only one active session" is enforced inside one write transaction.
- Every write is transactional, then read back and compared. If it fails, the UI says so and never reports success.
- Upgrades never delete or reset the database: add `if (old < N)` blocks in `src/lib/db.js`. Old backups are upgraded via `MIGRATIONS` in `src/lib/backup.js`.
- The app asks the browser for persistent storage and shows when the last backup was exported.

## Decisions worth knowing

- **Day ownership:** a session belongs to the local date it started, so 11:50 PM → 1:10 AM stays on the start day. The `dayKey` is stored on the session so reports don't shift if the time zone changes.
- **End for the Day after midnight:** it finishes the *oldest unfinished day that has sessions* (e.g. yesterday), not blindly "today". Older unfinished days are listed in History under "Not finished".
- **Ambiguous edits:** if the end time isn't after the start, the app asks which day the session ends instead of guessing.
- **Overlaps and future times** are rejected.
- **7-day cycles:** a day joins the open cycle when ended. Reopening a day returns it to the cycle that's still filling; days in an already finished 7-day report stay in it (the report simply recalculates and marks the day "reopened").
- **Exam Mode:** starts today or later, can't cover days that already have data, and one period at a time. Deleting early keeps the record (`ended-early` history); deleting an exam that hasn't started marks it `removed`. The 7-day cycle isn't touched.
- **Import:** validated first, then merged by id, never duplicating. Where the same id differs, the newer `updatedAt` wins, and anything skipped (e.g. overlaps) is listed. A backup of current data can be downloaded automatically first. If merged cycles end up inconsistent, they are rebuilt from finished days and the old records are archived in `meta`.
- Durations are shown rounded to the nearest minute; totals are computed from exact milliseconds.
