import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { loadAll } from '../src/lib/db.js';
import * as A from '../src/lib/actions.js';
import { derive, dayTotals, duration } from '../src/lib/logic.js';
import { buildBackup, parseBackup, planImport, applyImport } from '../src/lib/backup.js';
import { todayKey, addDays, localMs, formatDuration } from '../src/lib/time.js';

let n = 0;
const ok = (name) => console.log(`  ok ${++n} ${name}`);
const rejects = async (p, code) => { try { await p; } catch (e) { assert.equal(e.code, code, e.message); return; } assert.fail('expected rejection ' + code); };
const today = todayKey();
const d = (back) => addDays(today, -back);
const add = (day, a, b, endDay = day) => A.saveSession({ startMs: localMs(day, a), endMs: localMs(endDay, b) });

// 1. active session persists, no duplicates
const s = await A.startSession();
let data = await loadAll();
assert.equal(derive(data, today).active.id, s.id); ok('active session persisted in IndexedDB');
await rejects(A.startSession(), 'active-exists'); ok('second active session blocked');
await rejects(A.endDay(today), 'active'); ok('end day blocked while session active');
await new Promise((r) => setTimeout(r, 20));
const ended = await A.endSession(s.id);
assert.ok(ended.endDateTime > ended.startDateTime && ended.status === 'completed'); ok('session ended with exact timestamps');
await A.deleteSession(s.id);

// 2. midnight handling
const a = await add(d(20), '23:50', '00:10', d(19));
assert.equal(a.dayKey, d(20)); assert.equal(formatDuration(a.endDateTime - a.startDateTime), '20m'); ok('11:50 PM → 12:10 AM = 20m');
const b = await add(d(18), '23:50', '01:10', d(17));
assert.equal(b.dayKey, d(18)); assert.equal(formatDuration(b.endDateTime - b.startDateTime), '1h 20m'); ok('11:50 PM → 1:10 AM = 1h 20m, belongs to start day');
await rejects(add(d(5), '10:00', '09:00'), 'invalid'); ok('end before start rejected');
await add(d(16), '09:00', '10:00');
await rejects(add(d(16), '09:30', '10:30'), 'overlap'); ok('overlapping sessions rejected');

// 3. multiple sessions, day report, 7-day cycle
for (let i = 0; i < 7; i++) {
  const day = d(15 - i);
  await add(day, '08:00', '09:00'); await add(day, '10:00', '10:30');
  await A.endDay(day);
}
data = await loadAll();
let dv = derive(data, today);
assert.equal(dv.completedCycles.length, 1); assert.equal(dv.cycleReports[0].count, 7);
assert.equal(formatDuration(dv.cycleReports[0].total), '10h 30m'); assert.equal(formatDuration(dv.cycleReports[0].average), '1h 30m'); ok('7-day report: total + average from raw sessions');
await rejects(A.endDay(d(15)), 'already'); ok('day cannot be finished twice');

// 4. reopen, edit, re-end
await A.reopenDay(d(15));
data = await loadAll();
assert.equal(data.days.find((x) => x.dayKey === d(15)).status, 'open');
const target = data.sessions.find((x) => x.dayKey === d(15) && x.startDateTime === localMs(d(15), '08:00'));
await A.saveSession({ id: target.id, startMs: localMs(d(15), '08:00'), endMs: localMs(d(15), '09:30') });
dv = derive(await loadAll(), today);
assert.equal(formatDuration(dv.cycleReports[0].total), '11h 0m'); ok('edit recalculates the 7-day report');
await A.endDay(d(15));
dv = derive(await loadAll(), today);
assert.equal(dv.completedCycles.length, 1); assert.equal(dv.openCycle, null); ok('reopen + end again keeps finished cycle intact');

// 5. cycle freezes through exam mode; new cycle begins afterward
await add(d(6), '08:00', '09:00'); await A.endDay(d(6));
dv = derive(await loadAll(), today);
assert.equal(dv.openCycle.dayKeys.length, 1); ok('next cycle starts after the 7th day');
const ex = await A.createExam({ from: today, to: addDays(today, 8) });
await rejects(A.createExam({ from: addDays(today, 5), to: addDays(today, 6) }), 'overlap'); ok('overlapping exam periods rejected');
await rejects(A.createExam({ from: d(3), to: today }), 'invalid'); ok('exam in the past rejected');
await rejects(A.startSession(), 'exam'); ok('Exam Mode blocks Start Session');
data = await loadAll();
assert.equal(derive(data, today).openCycle.dayKeys.length, 1); ok('cycle unchanged by exam mode');
await A.endExamEarly(ex.id, addDays(today, 5));
data = await loadAll();
assert.equal(data.examModes[0].to, addDays(today, 4)); assert.equal(data.examModes[0].history.length, 2); ok('exam ended early; history kept');
await rejects(A.endExamEarly(ex.id, d(1)), 'invalid'); ok('resume on a past date rejected');
const fut = await A.createExam({ from: addDays(today, 20), to: addDays(today, 22) });
const gone = await A.endExamEarly(fut.id); assert.equal(gone.status, 'removed'); ok('upcoming exam can be deleted; record kept');

// 6. exam today blocks starting a session
await A.deleteAllData();
await A.createExam({ from: today, to: addDays(today, 2) });
await rejects(A.startSession(), 'exam'); ok('Exam Mode blocks new sessions');
await A.deleteAllData();
assert.equal((await loadAll()).sessions.length, 0); ok('delete all data clears study data');

// 7. export → import into an empty database
for (let i = 0; i < 8; i++) { await add(d(30 - i), '19:00', '20:15'); await A.endDay(d(30 - i)); }
await A.startSession();
const before = await loadAll();
const backup = JSON.parse(JSON.stringify(buildBackup(before)));
assert.equal(backup.schemaVersion, 1); assert.ok(backup.sessions[0].startISO);
await A.deleteAllData();
// active session in the backup is restored on an empty database
const parsed = parseBackup(JSON.stringify(backup));
const plan = planImport(parsed, await loadAll());
assert.equal(plan.sessions.add, 9);
const after = await applyImport(plan);
assert.equal(after.sessions.length, 9); assert.equal(after.days.length, 8); assert.equal(after.cycles.length, 2);
assert.ok(after.sessions.some((x) => x.status === 'active')); ok('export → delete → import restores everything');
const again = planImport(parsed, await loadAll());
assert.equal(again.sessions.add, 0); assert.equal(again.sessions.same, 9); ok('re-import does not duplicate sessions');
const bad = JSON.parse(JSON.stringify(backup)); bad.sessions[0].endDateTime = bad.sessions[0].startDateTime - 1;
assert.throws(() => parseBackup(JSON.stringify(bad)), /problems/); ok('corrupt backup rejected before any write');
assert.throws(() => parseBackup(JSON.stringify({ ...backup, schemaVersion: 99 })), /newer/); ok('newer schema rejected with clear message');

// 8. Reduce Time
await A.deleteAllData();
const R = (day, a, b, endDay = day) => add(day, a, b, endDay);
const shown = (s) => formatDuration(duration(s));
const cur = async (id) => (await loadAll()).sessions.find((x) => x.id === id);
const r1 = await R(d(10), '18:00', '20:00');
await A.reduceTime(r1.id, 20);
let c = await cur(r1.id);
assert.equal(shown(c), '1h 40m'); assert.equal(c.startDateTime, r1.startDateTime); assert.equal(c.endDateTime, r1.endDateTime); ok('reduce 20m on 2h = 1h 40m, timestamps untouched');
const r2 = await R(d(9), '10:00', '10:30');
await rejects(A.reduceTime(r2.id, 40), 'too-much'); assert.equal((await cur(r2.id)).excludedDuration, 0); ok('reducing more than the session is rejected');
for (const bad of [-5, 0, 1.5, NaN, '', 'abc', '2.5']) await rejects(A.reduceTime(r2.id, bad), 'invalid');
ok('negative, zero, decimal, invalid and empty input rejected');
await A.reduceTime(r1.id, 10); c = await cur(r1.id);
assert.equal(shown(c), '1h 30m'); assert.equal(c.excludedDuration, 30 * 60000); ok('second reduction: 1h 30m, excludedDuration = 30m');
await rejects(A.reduceTime(r1.id, 100), 'too-much'); ok('cumulative reduction cannot exceed the session');
await A.reduceTime(r1.id, 30, 'set'); assert.equal(shown(await cur(r1.id)), '1h 30m');
await A.reduceTime(r1.id, 15, 'set'); assert.equal(shown(await cur(r1.id)), '1h 45m'); ok('edit reduction sets the total');
await A.reduceTime(r1.id, 0, 'set'); assert.equal(shown(await cur(r1.id)), '2h 0m'); await A.reduceTime(r1.id, 20, 'set');
const mid = await R(d(8), '23:50', '01:10', d(7));
await A.reduceTime(mid.id, 20); c = await cur(mid.id);
assert.equal(shown(c), '1h 0m'); assert.equal(c.dayKey, d(8)); ok('midnight crossing: 1h 20m - 20m = 1h, stays on start day');
const act1 = await A.startSession();
await rejects(A.reduceTime(act1.id, 5), 'active'); await new Promise((r) => setTimeout(r, 20)); await A.endSession(act1.id); await A.deleteSession(act1.id); ok('active session cannot be reduced');

// reports use effective duration
await A.deleteAllData();
const e1 = await R(d(3), '18:00', '20:00'); const e2 = await R(d(3), '20:30', '21:30');
await A.reduceTime(e1.id, 20);
await A.endDay(d(3));
dv = derive(await loadAll(), today);
assert.equal(formatDuration(dayTotals(dv.sessionsByDay.get(d(3))).total), '2h 40m'); ok('day report total uses effective duration');
const la = await R(d(2), '09:00', '10:50'); await A.endDay(d(2));
dv = derive(await loadAll(), today);
assert.equal(formatDuration(dv.overall.total), '4h 30m'); assert.equal(formatDuration(dv.overall.longest), '1h 50m');
{ const mons = dv.months.filter((m) => m.dayKeys.includes(d(3)) || m.dayKeys.includes(d(2)));
  assert.equal(formatDuration(mons.reduce((a, m) => a + m.total, 0)), '4h 30m'); assert.equal(formatDuration(Math.max(...mons.map((m) => m.longest))), '1h 50m'); }
ok('statistics, monthly total and longest session use effective duration');
for (let i = 0; i < 5; i++) { await R(d(30 - i), '08:00', '09:00'); await A.endDay(d(30 - i)); }
dv = derive(await loadAll(), today);
assert.equal(dv.completedCycles.length, 1);
assert.equal(formatDuration(dv.cycleReports[0].total), '9h 30m'); ok('7-day total uses effective duration');

// reopen keeps reduction; editing timestamps recalculates; delete removes together
await A.reopenDay(d(3)); await A.endDay(d(3));
assert.equal(shown(await cur(e1.id)), '1h 40m'); ok('reopened day keeps the reduction');
await A.saveSession({ id: e1.id, startMs: localMs(d(3), '17:00'), endMs: localMs(d(3), '20:00') }); c = await cur(e1.id);
assert.equal(shown(c), '2h 40m'); assert.equal(c.excludedDuration, 20 * 60000); ok('editing timestamps recalculates effective duration');
await rejects(A.saveSession({ id: e1.id, startMs: localMs(d(3), '19:50'), endMs: localMs(d(3), '20:00') }), 'invalid'); ok('shrinking a session below its reduction is rejected');
await A.deleteSession(e2.id); assert.equal(await cur(e2.id), undefined); ok('deleting a session removes it with its reduction');

// export / import
const withRed = await loadAll();
const bk = JSON.parse(JSON.stringify(buildBackup(withRed)));
assert.equal(bk.sessions.find((x) => x.id === e1.id).excludedDuration, 20 * 60000); ok('export includes excludedDuration');
const snapshot = withRed.sessions.map((x) => [x.id, x.startDateTime, x.endDateTime, duration(x)]).sort();
await A.deleteAllData();
const afterImp = await applyImport(planImport(parseBackup(JSON.stringify(bk)), await loadAll()));
assert.deepEqual(afterImp.sessions.map((x) => [x.id, x.startDateTime, x.endDateTime, duration(x)]).sort(), snapshot); ok('import restores reductions, timestamps and effective durations');
const again2 = planImport(parseBackup(JSON.stringify(bk)), await loadAll());
assert.equal(again2.sessions.add, 0); assert.equal(again2.sessions.replace, 0); ok('re-import creates no duplicates');
const old = JSON.parse(JSON.stringify(bk)); delete old.sessions[0].excludedDuration;
assert.equal(parseBackup(JSON.stringify(old)).sessions[0].excludedDuration, 0); ok('older backups without excludedDuration import as 0');
const badRed = JSON.parse(JSON.stringify(bk)); badRed.sessions[0].excludedDuration = 1e12;
assert.throws(() => parseBackup(JSON.stringify(badRed)), /reduced time/); ok('invalid excludedDuration rejected on import');

// 9. Home greeting + History month filter (History is a view; data is never removed)
{
  const { greetingFor, monthKeyOf } = await import('../src/lib/time.js');
  assert.deepEqual([0, 5, 11, 12, 17, 18, 23].map(greetingFor), ['Good morning', 'Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening']);
  ok('greeting: morning < 12:00, afternoon < 18:00, evening after');
  await A.deleteAllData();
  const keys = ['2026-08-31', '2026-09-01', '2026-10-01', '2026-10-02'];
  for (const k of keys) { await add(k, '09:00', '10:00'); await A.endDay(k); }
  const all = await loadAll();
  const dv2 = derive(all, '2026-10-03');
  const inMonth = (t) => dv2.completedKeys.filter((k) => monthKeyOf(k) === monthKeyOf(t));
  assert.deepEqual(inMonth('2026-10-03'), ['2026-10-02', '2026-10-01']); ok('history filter: only the current month (October)');
  assert.deepEqual(inMonth('2026-09-15'), ['2026-09-01']); ok('history filter: another month shows only its own days, October hidden');
  assert.equal(all.sessions.length, 4); assert.equal(dv2.overall.sessions, 4); assert.equal(dv2.months.length, 3);
  ok('older months remain in the data, Statistics and Monthly (4 sessions, 3 months)');
}

console.log(`\nAll ${n} checks passed.`);
