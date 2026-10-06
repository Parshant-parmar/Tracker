// Pure calculation helpers. Everything here is derived from raw session records.
import { dayNum, compareKeys, monthKeyOf, addDays } from './time.js';

export const CYCLE_LENGTH = 7;
// Raw span between start and end. Internal only; never shown to the user.
export const rawDuration = (s) => s.endDateTime - s.startDateTime;
export const excluded = (s) => (Number.isFinite(s.excludedDuration) && s.excludedDuration > 0 ? s.excludedDuration : 0);
// Always derived from the timestamps; the stored reduction is never applied cumulatively.
// This is the only duration the UI and every report use.
export const duration = (s) => rawDuration(s) - excluded(s);

export function groupByDay(sessions) {
  const m = new Map();
  for (const s of sessions) {
    const a = m.get(s.dayKey);
    if (a) a.push(s); else m.set(s.dayKey, [s]);
  }
  for (const a of m.values()) a.sort((x, y) => x.startDateTime - y.startDateTime);
  return m;
}

export function dayTotals(list = []) {
  let total = 0, longest = 0, count = 0;
  for (const s of list) {
    if (s.status !== 'completed' || s.endDateTime == null) continue;
    const d = duration(s);
    if (d < 0) continue;
    total += d; count += 1;
    if (d > longest) longest = d;
  }
  return { total, count, longest };
}

// Study days that are still open: they own at least one session and are not completed.
// (Ownership is session.dayKey, never the calendar date of the timestamps.)
export function pendingDayKeys(sessions, days) {
  const done = new Set(days.filter((d) => d.status === 'completed').map((d) => d.dayKey));
  return [...new Set(sessions.map((s) => s.dayKey))].filter((k) => !done.has(k)).sort(compareKeys);
}

export function isExamDay(key, exams) {
  const n = dayNum(key);
  return exams.some((e) => e.status !== 'removed' && n >= dayNum(e.from) && n <= dayNum(e.to));
}

// The exam that is running now or scheduled for the future (at most one).
export function currentExam(exams, today) {
  const t = dayNum(today);
  const live = exams
    .filter((e) => e.status !== 'removed' && dayNum(e.to) >= t)
    .sort((a, b) => dayNum(a.from) - dayNum(b.from))[0];
  if (!live) return null;
  return { exam: live, state: dayNum(live.from) <= t ? 'active' : 'upcoming' };
}

export function cycleReport(cycle, sessionsByDay, daysMap) {
  const keys = [...cycle.dayKeys].sort(compareKeys);
  const items = keys.map((k) => ({
    dayKey: k,
    total: dayTotals(sessionsByDay.get(k)).total,
    reopened: daysMap.get(k)?.status !== 'completed',
  }));
  const total = items.reduce((a, b) => a + b.total, 0);
  return {
    id: cycle.id, index: cycle.index, status: cycle.status,
    from: keys[0] || null, to: keys[keys.length - 1] || null,
    days: items, total, count: items.length,
    average: items.length ? total / items.length : 0,
  };
}

export function derive(data, today) {
  const sessionsByDay = groupByDay(data.sessions);
  const daysMap = new Map(data.days.map((d) => [d.dayKey, d]));
  const active = data.sessions.find((s) => s.status === 'active') || null;
  const pending = [...sessionsByDay.keys()].filter((k) => daysMap.get(k)?.status !== 'completed').sort(compareKeys);
  const working = pending[0] ?? today;
  const exam = currentExam(data.examModes, today);
  const examToday = isExamDay(today, data.examModes);
  const todayCompleted = daysMap.get(today)?.status === 'completed';

  const completedKeys = data.days.filter((d) => d.status === 'completed').map((d) => d.dayKey)
    .sort((a, b) => compareKeys(b, a));

  const cycles = [...data.cycles].sort((a, b) => a.index - b.index);
  const completedCycles = cycles.filter((c) => c.status === 'completed');
  const openCycle = cycles.find((c) => c.status === 'open') || null;
  const cycleReports = completedCycles.map((c) => cycleReport(c, sessionsByDay, daysMap)).reverse();

  // Monthly reports (completed days only; exam days never counted as zero days)
  const monthMap = new Map();
  let total = 0, sessions = 0, longest = 0;
  for (const k of completedKeys) {
    const t = dayTotals(sessionsByDay.get(k));
    total += t.total; sessions += t.count; if (t.longest > longest) longest = t.longest;
    const mk = monthKeyOf(k);
    let m = monthMap.get(mk);
    if (!m) { m = { monthKey: mk, total: 0, studyDays: 0, sessions: 0, longest: 0, dayKeys: [], examDays: 0 }; monthMap.set(mk, m); }
    m.total += t.total; m.sessions += t.count; if (t.count > 0) m.studyDays += 1;
    if (t.longest > m.longest) m.longest = t.longest;
    m.dayKeys.push(k);
  }
  for (const e of data.examModes) {
    if (e.status === 'removed') continue;
    const a = dayNum(e.from), b = dayNum(e.to);
    for (let n = a; n <= b && n - a < 400; n++) {
      const k = addDays(e.from, n - a);
      const m = monthMap.get(monthKeyOf(k));
      if (m) m.examDays += 1;
    }
  }
  const months = [...monthMap.values()].sort((a, b) => dayNum(`${b.monthKey}-01`) - dayNum(`${a.monthKey}-01`));
  return {
    sessionsByDay, daysMap, active, pending, working, exam, examToday, todayCompleted,
    completedKeys, cycles, completedCycles, openCycle, cycleReports, months,
    overall: { total, days: completedKeys.length, sessions, longest },
  };
}

export function cyclesConsistent(cycles) {
  const seen = new Set();
  let open = 0;
  for (const c of cycles) {
    if (c.status === 'open') open += 1;
    if (c.status === 'completed' && c.dayKeys.length !== CYCLE_LENGTH) return false;
    if (c.status === 'open' && c.dayKeys.length >= CYCLE_LENGTH) return false;
    for (const k of c.dayKeys) { if (seen.has(k)) return false; seen.add(k); }
  }
  return open <= 1;
}

export function rebuildCycles(days, now) {
  const keys = days.filter((d) => d.status === 'completed').map((d) => d.dayKey).sort(compareKeys);
  const out = [];
  for (let i = 0; i < keys.length; i += CYCLE_LENGTH) {
    const chunk = keys.slice(i, i + CYCLE_LENGTH);
    const full = chunk.length === CYCLE_LENGTH;
    out.push({ id: `cycle-${out.length + 1}`, index: out.length + 1, status: full ? 'completed' : 'open',
      dayKeys: chunk, createdAt: now, updatedAt: now, completedAt: full ? now : null });
  }
  return out;
}
