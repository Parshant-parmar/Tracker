// Every write goes through here. Each write is transactional, validated and read back.
import { transact, r, getOne, loadAll, stable } from './db.js';
import { dayKeyOf, dayNum, addDays, isValidKey, formatDateTime, todayKey } from './time.js';
import { isExamDay, CYCLE_LENGTH } from './logic.js';

export class AppError extends Error {
  constructor(message, code, extra) { super(message); this.code = code; this.extra = extra; }
}
export const SAVE_FAIL = 'We couldn’t save this session. Please try again.';
const DATA_FAIL = 'We couldn’t save your changes. Nothing was changed. Please try again.';

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const wrap = (e, fallback) => { if (e instanceof AppError) return e; console.error(e); return new AppError(fallback, 'storage'); };

async function verify(store, rec) {
  const key = store === 'days' ? rec.dayKey : store === 'meta' ? rec.key : rec.id;
  const back = await getOne(store, key);
  if (!back || stable(back) !== stable(rec)) throw new AppError('Saved data could not be verified.', 'verify');
}

// ---------- startup ----------
export async function initApp(version) {
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
  const now = Date.now();
  await transact(['meta'], 'readwrite', async (tx) => {
    const m = tx.objectStore('meta');
    const cur = await r(m.get('app'));
    await r(m.put({ key: 'app', createdAt: cur?.createdAt ?? now, lastOpenedVersion: version, lastOpenedAt: now }));
  });
  return loadAll();
}

// ---------- sessions ----------
export async function startSession() {
  const now = Date.now();
  const rec = { id: uid(), startDateTime: now, endDateTime: null, status: 'active', dayKey: dayKeyOf(now), excludedDuration: 0, createdAt: now, updatedAt: now };
  try {
    await transact(['sessions', 'days', 'examModes'], 'readwrite', async (tx) => {
      const sess = tx.objectStore('sessions');
      if ((await r(sess.index('status').count('active'))) > 0) throw new AppError('A session is already in progress.', 'active-exists');
      const day = await r(tx.objectStore('days').get(rec.dayKey));
      if (day?.status === 'completed') throw new AppError('Today is finished. Reopen the day to add sessions.', 'day-completed');
      const exams = await r(tx.objectStore('examModes').getAll());
      if (isExamDay(rec.dayKey, exams)) throw new AppError('Exam Mode is on. Tracking is paused.', 'exam');
      const all = await r(sess.getAll());
      if (all.some((s) => s.endDateTime != null && s.endDateTime > now))
        throw new AppError('A saved session ends after the current time. Check the device clock or edit that session.', 'clock');
      await r(sess.add(rec));
    });
    await verify('sessions', rec);
    return rec;
  } catch (e) { throw wrap(e, SAVE_FAIL); }
}

export async function endSession(id) {
  const now = Date.now();
  let saved;
  try {
    await transact(['sessions'], 'readwrite', async (tx) => {
      const sess = tx.objectStore('sessions');
      const s = await r(sess.get(id));
      if (!s || s.status !== 'active') throw new AppError('There is no active session to end.', 'no-active');
      if (now <= s.startDateTime) throw new AppError('The current time is not after the start time. Check the device clock.', 'clock');
      saved = { ...s, endDateTime: now, status: 'completed', excludedDuration: s.excludedDuration || 0, updatedAt: now };
      await r(sess.put(saved));
    });
    await verify('sessions', saved);
    return saved;
  } catch (e) { throw wrap(e, SAVE_FAIL); }
}

// Add (no id) or edit (id) a recorded session. startMs / endMs are full timestamps.
export async function saveSession({ id, startMs, endMs }) {
  const now = Date.now();
  let saved;
  try {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) throw new AppError('Enter a valid date and time.', 'invalid');
    if (endMs <= startMs) throw new AppError('The end must be after the start.', 'invalid');
    if (endMs > now) throw new AppError('A session can’t end in the future.', 'invalid');
    const dayKey = dayKeyOf(startMs);
    await transact(['sessions', 'days', 'examModes'], 'readwrite', async (tx) => {
      const sess = tx.objectStore('sessions');
      const exams = await r(tx.objectStore('examModes').getAll());
      if (isExamDay(dayKey, exams)) throw new AppError('That date is inside Exam Mode, where tracking is paused.', 'exam');
      const others = (await r(sess.getAll())).filter((s) => s.id !== id);
      const hit = others.find((o) => startMs < (o.endDateTime ?? Infinity) && endMs > o.startDateTime);
      if (hit) throw new AppError(`This overlaps another session (${formatDateTime(hit.startDateTime)} to ${hit.endDateTime ? formatDateTime(hit.endDateTime) : 'in progress'}).`, 'overlap');
      if (id) {
        const old = await r(sess.get(id));
        if (!old) throw new AppError('That session no longer exists.', 'missing');
        if (old.status !== 'completed') throw new AppError('End the active session before editing it.', 'active');
        if ((old.excludedDuration || 0) > endMs - startMs)
          throw new AppError('The reduced time would be longer than this session. Lower the reduction first.', 'invalid');
        saved = { ...old, startDateTime: startMs, endDateTime: endMs, dayKey, excludedDuration: old.excludedDuration || 0, updatedAt: now };
      } else {
        const day = await r(tx.objectStore('days').get(dayKey));
        if (day?.status === 'completed') throw new AppError('That day is finished. Reopen it before adding sessions.', 'day-completed');
        saved = { id: uid(), startDateTime: startMs, endDateTime: endMs, status: 'completed', dayKey, excludedDuration: 0, createdAt: now, updatedAt: now };
      }
      await r(sess.put(saved));
    });
    await verify('sessions', saved);
    return saved;
  } catch (e) { throw wrap(e, SAVE_FAIL); }
}

export async function deleteSession(id) {
  try {
    await transact(['sessions'], 'readwrite', async (tx) => {
      const sess = tx.objectStore('sessions');
      const s = await r(sess.get(id));
      if (!s) throw new AppError('That session no longer exists.', 'missing');
      if (s.status === 'active') throw new AppError('End the active session before deleting it.', 'active');
      await r(sess.delete(id));
    });
    if (await getOne('sessions', id)) throw new AppError('The session could not be deleted.', 'verify');
  } catch (e) { throw wrap(e, 'We couldn’t delete this session. Nothing was changed.'); }
}

// Reduce Time. mode 'add' removes `minutes` more; mode 'set' sets the total reduction.
// Timestamps are never touched; only excludedDuration changes.
export const REDUCE_TOO_MUCH = 'You can’t reduce more time than the session duration.';
export async function reduceTime(id, minutes, mode = 'add') {
  const now = Date.now();
  let saved;
  try {
    if (typeof minutes === 'string') minutes = minutes.trim() === '' || !/^\d+$/.test(minutes.trim()) ? NaN : Number(minutes.trim());
    if (!Number.isInteger(minutes) || minutes < (mode === 'set' ? 0 : 1)) throw new AppError('Enter a whole number of minutes.', 'invalid');
    await transact(['sessions'], 'readwrite', async (tx) => {
      const sess = tx.objectStore('sessions');
      const s = await r(sess.get(id));
      if (!s) throw new AppError('That session no longer exists.', 'missing');
      if (s.status !== 'completed') throw new AppError('End the session before reducing its time.', 'active');
      const total = (mode === 'set' ? 0 : (s.excludedDuration || 0)) + minutes * 60000;
      if (total > s.endDateTime - s.startDateTime) throw new AppError(REDUCE_TOO_MUCH, 'too-much');
      saved = { ...s, excludedDuration: total, updatedAt: now };
      await r(sess.put(saved));
    });
    await verify('sessions', saved);
    return saved;
  } catch (e) { throw wrap(e, SAVE_FAIL); }
}

// ---------- days & cycles ----------
export async function endDay(dayKey) {
  const now = Date.now();
  let day, completedCycleId = null;
  try {
    await transact(['sessions', 'days', 'cycles'], 'readwrite', async (tx) => {
      const list = await r(tx.objectStore('sessions').index('dayKey').getAll(dayKey));
      if (list.some((s) => s.status === 'active')) throw new AppError('End the current session before ending the day.', 'active');
      if (!list.some((s) => s.status === 'completed')) throw new AppError('No sessions have been recorded for this day.', 'empty');
      const days = tx.objectStore('days');
      const prev = await r(days.get(dayKey));
      if (prev?.status === 'completed') throw new AppError('This day is already finished.', 'already');
      day = {
        dayKey, status: 'completed', completedAt: now, createdAt: prev?.createdAt ?? now, updatedAt: now,
        reopenCount: prev?.reopenCount ?? 0, events: [...(prev?.events ?? []), { type: 'completed', at: now }],
      };
      await r(days.put(day));
      const cyc = tx.objectStore('cycles');
      const cycles = await r(cyc.getAll());
      if (!cycles.some((c) => c.dayKeys.includes(dayKey))) {
        let open = cycles.filter((c) => c.status === 'open').sort((a, b) => a.index - b.index)[0];
        if (!open) {
          const idx = cycles.reduce((m, c) => Math.max(m, c.index), 0) + 1;
          open = { id: uid(), index: idx, status: 'open', dayKeys: [], createdAt: now, updatedAt: now, completedAt: null };
        }
        open = { ...open, dayKeys: [...open.dayKeys, dayKey], updatedAt: now };
        if (open.dayKeys.length >= CYCLE_LENGTH) { open.status = 'completed'; open.completedAt = now; completedCycleId = open.id; }
        await r(cyc.put(open));
      }
    });
    await verify('days', day);
    return { completedCycleId };
  } catch (e) { throw wrap(e, DATA_FAIL); }
}

export async function reopenDay(dayKey) {
  const now = Date.now();
  let day;
  try {
    await transact(['days', 'cycles'], 'readwrite', async (tx) => {
      const days = tx.objectStore('days');
      const prev = await r(days.get(dayKey));
      if (!prev || prev.status !== 'completed') throw new AppError('This day isn’t finished.', 'not-completed');
      day = { ...prev, status: 'open', reopenedAt: now, reopenCount: (prev.reopenCount || 0) + 1, updatedAt: now,
        events: [...(prev.events ?? []), { type: 'reopened', at: now }] };
      await r(days.put(day));
      // Only the cycle still being filled gives the day back; finished 7-day reports keep their days.
      const cyc = tx.objectStore('cycles');
      for (const c of await r(cyc.getAll())) {
        if (c.status === 'open' && c.dayKeys.includes(dayKey))
          await r(cyc.put({ ...c, dayKeys: c.dayKeys.filter((k) => k !== dayKey), updatedAt: now }));
      }
    });
    await verify('days', day);
  } catch (e) { throw wrap(e, DATA_FAIL); }
}

// ---------- exam mode ----------
const MAX_EXAM_DAYS = 366;

async function checkExamRange(tx, { from, to, excludeId }) {
  if (!isValidKey(from) || !isValidKey(to)) throw new AppError('Choose a valid start and end date.', 'invalid');
  if (dayNum(to) < dayNum(from)) throw new AppError('The end date must be on or after the start date.', 'invalid');
  if (dayNum(to) - dayNum(from) + 1 > MAX_EXAM_DAYS) throw new AppError('Exam Mode can’t be longer than a year.', 'invalid');
  const exams = await r(tx.objectStore('examModes').getAll());
  if (exams.some((e) => e.id !== excludeId && e.status !== 'removed' && dayNum(e.from) <= dayNum(to) && dayNum(e.to) >= dayNum(from)))
    throw new AppError('These dates overlap another Exam Mode period.', 'overlap');
  const sIdx = tx.objectStore('sessions').index('dayKey');
  const days = tx.objectStore('days');
  for (let n = dayNum(from); n <= dayNum(to); n++) {
    const k = addDays(from, n - dayNum(from));
    if ((await r(sIdx.count(k))) > 0 || (await r(days.get(k))))
      throw new AppError('Study data already exists on one of these days. Pick dates without recorded sessions.', 'has-data');
  }
}

export async function createExam({ from, to }) {
  const now = Date.now();
  let rec;
  try {
    const today = todayKey();
    await transact(['examModes', 'sessions', 'days'], 'readwrite', async (tx) => {
      if (isValidKey(from) && dayNum(from) < dayNum(today)) throw new AppError('Exam Mode can’t start in the past.', 'invalid');
      if (from === today && (await r(tx.objectStore('sessions').index('status').count('active'))) > 0)
        throw new AppError('End your current session before starting Exam Mode today.', 'active');
      await checkExamRange(tx, { from, to });
      rec = { id: uid(), from, to, originalTo: to, status: 'active', createdAt: now, updatedAt: now, history: [{ type: 'created', at: now, from, to }] };
      await r(tx.objectStore('examModes').put(rec));
    });
    await verify('examModes', rec);
    return rec;
  } catch (e) { throw wrap(e, DATA_FAIL); }
}

export async function updateExam(id, { from, to }) {
  const now = Date.now();
  let rec;
  try {
    const today = todayKey();
    await transact(['examModes', 'sessions', 'days'], 'readwrite', async (tx) => {
      const store = tx.objectStore('examModes');
      const old = await r(store.get(id));
      if (!old || old.status === 'removed') throw new AppError('This Exam Mode no longer exists.', 'missing');
      if (isValidKey(to) && dayNum(to) < dayNum(today)) throw new AppError('The end date can’t be in the past.', 'invalid');
      await checkExamRange(tx, { from, to, excludeId: id });
      rec = { ...old, from, to, updatedAt: now, history: [...(old.history ?? []), { type: 'edited', at: now, from: old.from, to: old.to, newFrom: from, newTo: to }] };
      await r(store.put(rec));
    });
    await verify('examModes', rec);
    return rec;
  } catch (e) { throw wrap(e, DATA_FAIL); }
}

// End Exam Mode early. Exam days before `resume` stay as Exam Mode; history is kept.
export async function endExamEarly(id, resume) {
  const now = Date.now();
  let rec;
  try {
    const today = todayKey();
    await transact(['examModes'], 'readwrite', async (tx) => {
      const store = tx.objectStore('examModes');
      const old = await r(store.get(id));
      if (!old || old.status === 'removed') throw new AppError('This Exam Mode no longer exists.', 'missing');
      const upcoming = dayNum(old.from) > dayNum(today);
      if (upcoming) {
        rec = { ...old, status: 'removed', updatedAt: now, history: [...(old.history ?? []), { type: 'removed', at: now, from: old.from, to: old.to }] };
      } else {
        if (!isValidKey(resume)) throw new AppError('Choose a date.', 'invalid');
        if (dayNum(resume) < dayNum(today)) throw new AppError('Normal tracking can’t resume on a past date.', 'invalid');
        if (dayNum(resume) > dayNum(old.to)) throw new AppError('Pick a date within the current Exam Mode period.', 'invalid');
        const newTo = addDays(resume, -1);
        const empty = dayNum(newTo) < dayNum(old.from);
        rec = { ...old, to: empty ? old.to : newTo, status: empty ? 'removed' : 'active', updatedAt: now,
          history: [...(old.history ?? []), { type: 'ended-early', at: now, from: old.from, to: old.to, resume }] };
      }
      await r(store.put(rec));
    });
    await verify('examModes', rec);
    return rec;
  } catch (e) { throw wrap(e, DATA_FAIL); }
}

// ---------- settings & maintenance ----------
export async function saveSettings(patch) {
  const now = Date.now();
  let rec;
  try {
    await transact(['meta'], 'readwrite', async (tx) => {
      const m = tx.objectStore('meta');
      const cur = (await r(m.get('settings'))) || { key: 'settings' };
      rec = { ...cur, ...patch, updatedAt: now };
      await r(m.put(rec));
    });
    return rec;
  } catch (e) { throw wrap(e, 'We couldn’t save this setting.'); }
}

export async function deleteAllData() {
  try {
    await transact(['sessions', 'days', 'cycles', 'examModes', 'meta'], 'readwrite', async (tx) => {
      for (const s of ['sessions', 'days', 'cycles', 'examModes']) await r(tx.objectStore(s).clear());
      const m = tx.objectStore('meta');
      for (const rec of await r(m.getAll())) if (rec.key !== 'settings' && rec.key !== 'app') await r(m.delete(rec.key));
    });
    const left = await loadAll();
    if (left.sessions.length || left.days.length || left.cycles.length || left.examModes.length)
      throw new AppError('Some data could not be removed.', 'verify');
  } catch (e) { throw wrap(e, 'We couldn’t delete the data. Nothing was changed.'); }
}
