// Export / import. Backups contain the raw records; derived reports are included for readability only.
import { transact, r, loadAll, stable } from './db.js';
import { derive, cyclesConsistent, rebuildCycles, isExamDay } from './logic.js';
import { dayKeyOf, dayNum, isValidKey, formatDateTime } from './time.js';
import { AppError } from './actions.js';

export const APP_NAME = 'Study Time Tracker';
export const SCHEMA_VERSION = 1;
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export class ImportError extends Error {}

export function buildBackup(data) {
  const d = derive(data, dayKeyOf(Date.now()));
  const now = Date.now();
  return {
    app: APP_NAME,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date(now).toISOString(),
    exportedAtMs: now,
    settings: data.settings ? { theme: data.settings.theme ?? null, timeFormat: data.settings.timeFormat ?? null } : null,
    sessions: data.sessions.map((s) => ({
      ...s,
      startISO: new Date(s.startDateTime).toISOString(),
      endISO: s.endDateTime == null ? null : new Date(s.endDateTime).toISOString(),
    })),
    days: data.days,
    cycles: data.cycles,
    examModes: data.examModes,
    // Informational only: always recalculated from `sessions` after import.
    derived: {
      sevenDayReports: d.cycleReports.map((c) => ({ index: c.index, from: c.from, to: c.to, totalMs: c.total, averageMs: c.average, days: c.days })),
      monthlyReports: d.months.map((m) => ({ month: m.monthKey, totalMs: m.total, studyDays: m.studyDays, sessions: m.sessions, longestMs: m.longest })),
    },
  };
}

export function backupFilename() {
  return `study-tracker-backup-${dayKeyOf(Date.now())}.json`;
}

export function downloadBackup(data) {
  const blob = new Blob([JSON.stringify(buildBackup(data), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = backupFilename();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------- migration (older backup schemas are upgraded, not rejected) ----------
const MIGRATIONS = {
  // 1: (b) => ({ ...b, schemaVersion: 2, ... }),
};
function migrate(b) {
  let cur = b;
  while (cur.schemaVersion < SCHEMA_VERSION) {
    const step = MIGRATIONS[cur.schemaVersion];
    if (!step) throw new ImportError(`This backup uses schema ${cur.schemaVersion}, which can’t be upgraded.`);
    cur = step(cur);
  }
  return cur;
}

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const sane = (n) => isNum(n) && n > Date.UTC(2000, 0, 1) && n < Date.UTC(2100, 0, 1);

export function parseBackup(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new ImportError('This file isn’t valid JSON, so it can’t be a Study Time Tracker backup.'); }
  if (!raw || typeof raw !== 'object' || raw.app !== APP_NAME) throw new ImportError('This doesn’t look like a Study Time Tracker backup.');
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) throw new ImportError('The backup has no valid schema version.');
  if (raw.schemaVersion > SCHEMA_VERSION) throw new ImportError('This backup was made by a newer version of the app. Update the app, then try again.');
  raw = migrate(raw);
  for (const k of ['sessions', 'days', 'cycles', 'examModes']) {
    if (!Array.isArray(raw[k])) throw new ImportError(`The backup is missing the “${k}” list.`);
  }
  const errors = [];
  const err = (m) => { if (errors.length < 6) errors.push(m); else if (errors.length === 6) errors.push('…and more problems.'); };

  const ids = new Set();
  const sessions = raw.sessions.map((s, i) => {
    const at = `Session ${i + 1}`;
    if (!s || typeof s.id !== 'string' || !s.id) { err(`${at}: missing id.`); return null; }
    if (ids.has(s.id)) { err(`${at}: duplicate id.`); return null; }
    ids.add(s.id);
    if (!sane(s.startDateTime)) { err(`${at}: invalid start time.`); return null; }
    const hasEnd = s.endDateTime !== null && s.endDateTime !== undefined;
    if (hasEnd && (!sane(s.endDateTime) || s.endDateTime <= s.startDateTime)) { err(`${at}: end time is invalid or not after the start.`); return null; }
    if (s.status !== 'active' && s.status !== 'completed') { err(`${at}: unknown status.`); return null; }
    if ((s.status === 'active') === hasEnd) { err(`${at}: status doesn’t match its end time.`); return null; }
    const dayKey = s.dayKey === undefined ? dayKeyOf(s.startDateTime) : s.dayKey;
    if (!isValidKey(dayKey)) { err(`${at}: invalid day.`); return null; }
    const createdAt = isNum(s.createdAt) ? s.createdAt : s.startDateTime;
    const updatedAt = isNum(s.updatedAt) ? s.updatedAt : createdAt;
    return { id: s.id, startDateTime: s.startDateTime, endDateTime: hasEnd ? s.endDateTime : null, status: s.status, dayKey, createdAt, updatedAt };
  });
  if (sessions.filter((s) => s && s.status === 'active').length > 1) err('The backup contains more than one active session.');

  const days = raw.days.map((d, i) => {
    if (!d || !isValidKey(d.dayKey)) { err(`Day ${i + 1}: invalid date.`); return null; }
    if (d.status !== 'completed' && d.status !== 'open') { err(`Day ${i + 1}: unknown status.`); return null; }
    return { ...d, updatedAt: isNum(d.updatedAt) ? d.updatedAt : (isNum(d.completedAt) ? d.completedAt : 0), createdAt: isNum(d.createdAt) ? d.createdAt : 0 };
  });

  const cycleIds = new Set();
  const cycles = raw.cycles.map((c, i) => {
    if (!c || typeof c.id !== 'string' || cycleIds.has(c.id)) { err(`7-day cycle ${i + 1}: missing or duplicate id.`); return null; }
    cycleIds.add(c.id);
    if (!Array.isArray(c.dayKeys) || !c.dayKeys.every(isValidKey)) { err(`7-day cycle ${i + 1}: invalid days.`); return null; }
    if (c.status !== 'open' && c.status !== 'completed') { err(`7-day cycle ${i + 1}: unknown status.`); return null; }
    return { id: c.id, index: Number.isInteger(c.index) ? c.index : i + 1, status: c.status, dayKeys: [...new Set(c.dayKeys)],
      createdAt: isNum(c.createdAt) ? c.createdAt : 0, updatedAt: isNum(c.updatedAt) ? c.updatedAt : 0, completedAt: isNum(c.completedAt) ? c.completedAt : null };
  });

  const examIds = new Set();
  const examModes = raw.examModes.map((e, i) => {
    if (!e || typeof e.id !== 'string' || examIds.has(e.id)) { err(`Exam Mode ${i + 1}: missing or duplicate id.`); return null; }
    examIds.add(e.id);
    if (!isValidKey(e.from) || !isValidKey(e.to) || dayNum(e.to) < dayNum(e.from)) { err(`Exam Mode ${i + 1}: invalid dates.`); return null; }
    return { ...e, status: e.status === 'removed' ? 'removed' : 'active', updatedAt: isNum(e.updatedAt) ? e.updatedAt : 0, createdAt: isNum(e.createdAt) ? e.createdAt : 0, history: Array.isArray(e.history) ? e.history : [] };
  });

  if (errors.length) throw new ImportError(`This backup has problems and was not imported:\n• ${errors.join('\n• ')}`);
  const settings = raw.settings && typeof raw.settings === 'object' ? {
    theme: raw.settings.theme === 'dark' || raw.settings.theme === 'light' ? raw.settings.theme : null,
    timeFormat: raw.settings.timeFormat === '24' || raw.settings.timeFormat === '12' ? raw.settings.timeFormat : null,
  } : null;
  return { sessions, days, cycles, examModes, settings, schemaVersion: raw.schemaVersion };
}

// ---------- merge planning (nothing is written here) ----------
const overlaps = (a, b) => a.startDateTime < (b.endDateTime ?? Infinity) && (a.endDateTime ?? Infinity) > b.startDateTime;

export function planImport(imp, local) {
  const now = Date.now();
  const plan = {
    sessions: { add: 0, replace: 0, same: 0, keptLocal: 0, skipped: [] },
    days: { add: 0, replace: 0, same: 0, keptLocal: 0 },
    cycles: { rebuilt: false, add: 0 },
    exams: { add: 0, replace: 0, same: 0, keptLocal: 0, skipped: 0 },
    writes: { sessions: [], days: [], examModes: [], cycles: [], deleteCycleIds: [], archive: null, settings: null },
  };

  // sessions
  const final = new Map(local.sessions.map((s) => [s.id, s]));
  for (const s of [...imp.sessions].sort((a, b) => a.startDateTime - b.startDateTime)) {
    const cur = final.get(s.id);
    if (cur && stable(cur) === stable(s)) { plan.sessions.same += 1; continue; }
    if (cur && cur.updatedAt >= s.updatedAt) { plan.sessions.keptLocal += 1; continue; }
    const others = [...final.values()].filter((o) => o.id !== s.id);
    if (s.status === 'active' && others.some((o) => o.status === 'active')) {
      plan.sessions.skipped.push(`Active session from ${formatDateTime(s.startDateTime)}: another session is already in progress.`); continue;
    }
    const hit = others.find((o) => overlaps(s, o));
    if (hit) { plan.sessions.skipped.push(`Session from ${formatDateTime(s.startDateTime)}: overlaps an existing session.`); continue; }
    final.set(s.id, s);
    plan.writes.sessions.push(s);
    if (cur) plan.sessions.replace += 1; else plan.sessions.add += 1;
  }

  // days
  const finalDays = new Map(local.days.map((d) => [d.dayKey, d]));
  for (const d of imp.days) {
    const cur = finalDays.get(d.dayKey);
    if (cur && stable(cur) === stable(d)) { plan.days.same += 1; continue; }
    if (cur && (cur.updatedAt ?? 0) >= d.updatedAt) { plan.days.keptLocal += 1; continue; }
    finalDays.set(d.dayKey, d); plan.writes.days.push(d);
    if (cur) plan.days.replace += 1; else plan.days.add += 1;
  }

  // exam modes
  const finalExams = new Map(local.examModes.map((e) => [e.id, e]));
  for (const e of imp.examModes) {
    const cur = finalExams.get(e.id);
    if (cur && stable(cur) === stable(e)) { plan.exams.same += 1; continue; }
    if (cur && (cur.updatedAt ?? 0) >= e.updatedAt) { plan.exams.keptLocal += 1; continue; }
    const clash = e.status !== 'removed' && [...finalExams.values()].some((o) => o.id !== e.id && o.status !== 'removed' && dayNum(o.from) <= dayNum(e.to) && dayNum(o.to) >= dayNum(e.from));
    if (clash) { plan.exams.skipped += 1; continue; }
    finalExams.set(e.id, e); plan.writes.examModes.push(e);
    if (cur) plan.exams.replace += 1; else plan.exams.add += 1;
  }

  // cycles: union by id; if the result is inconsistent, rebuild from completed days (old records archived)
  const finalCycles = new Map(local.cycles.map((c) => [c.id, c]));
  for (const c of imp.cycles) {
    const cur = finalCycles.get(c.id);
    if (cur && (cur.updatedAt ?? 0) >= c.updatedAt) continue;
    finalCycles.set(c.id, c); plan.cycles.add += 1;
  }
  const merged = [...finalCycles.values()];
  if (!cyclesConsistent(merged)) {
    plan.cycles.rebuilt = true;
    plan.writes.archive = { key: `cycles-before-import-${now}`, cycles: merged, archivedAt: now };
    plan.writes.deleteCycleIds = merged.map((c) => c.id);
    plan.writes.cycles = rebuildCycles([...finalDays.values()], now);
  } else {
    plan.writes.cycles = merged.filter((c) => stable(finalCycles.get(c.id)) !== stable(local.cycles.find((l) => l.id === c.id) ?? null));
  }

  if (imp.settings && !local.settings) plan.writes.settings = { key: 'settings', ...imp.settings, updatedAt: now };
  plan.totals = {
    sessionsInFile: imp.sessions.length, daysInFile: imp.days.length, examsInFile: imp.examModes.length,
  };
  return plan;
}

export async function applyImport(plan) {
  const w = plan.writes;
  try {
    await transact(['sessions', 'days', 'cycles', 'examModes', 'meta'], 'readwrite', async (tx) => {
      for (const s of w.sessions) await r(tx.objectStore('sessions').put(s));
      for (const d of w.days) await r(tx.objectStore('days').put(d));
      for (const e of w.examModes) await r(tx.objectStore('examModes').put(e));
      if (w.archive) await r(tx.objectStore('meta').put(w.archive));
      for (const id of w.deleteCycleIds) await r(tx.objectStore('cycles').delete(id));
      for (const c of w.cycles) await r(tx.objectStore('cycles').put(c));
      if (w.settings) await r(tx.objectStore('meta').put(w.settings));
    });
    const after = await loadAll();
    const byId = new Map(after.sessions.map((s) => [s.id, s]));
    for (const s of w.sessions) if (stable(byId.get(s.id) ?? null) !== stable(s)) throw new AppError('Imported data could not be verified.', 'verify');
    return after;
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error(e);
    throw new AppError('The import failed and nothing was changed. Please try again.', 'storage');
  }
}
