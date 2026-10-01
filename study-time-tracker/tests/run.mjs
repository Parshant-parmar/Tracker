import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { loadAll } from '../src/lib/db.js';
import * as A from '../src/lib/actions.js';
import { derive, dayTotals } from '../src/lib/logic.js';
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
console.log(`\nAll ${n} checks passed.`);
