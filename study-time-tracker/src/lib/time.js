// All date-only logic uses integer "day numbers" (days since epoch, UTC-based),
// never string comparison. Timestamps are epoch milliseconds.
export const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export function dayKeyOf(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, mo, d, num: Math.round(dt.getTime() / DAY_MS) };
}
export const isValidKey = (k) => typeof k === 'string' && parseKey(k) !== null;
export const dayNum = (k) => parseKey(k).num;
export function keyFromNum(n) {
  const d = new Date(n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export const addDays = (k, n) => keyFromNum(dayNum(k) + n);
export const compareKeys = (a, b) => dayNum(a) - dayNum(b);
export const monthKeyOf = (k) => k.slice(0, 7);
export const todayKey = () => dayKeyOf(Date.now());

// Local date key + "HH:MM" -> epoch ms (local time zone)
export function localMs(key, hhmm) {
  const p = parseKey(key);
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(p.y, p.mo - 1, p.d, h, m, 0, 0).getTime();
}
export function timeInputValue(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let fmt = '12';
export const setTimeFormat = (f) => { fmt = f === '24' ? '24' : '12'; };
export function defaultTimeFormat() {
  try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ? '12' : '24'; }
  catch { return '12'; }
}
export function formatTime(ms) {
  const opts = { hour: fmt === '24' ? '2-digit' : 'numeric', minute: '2-digit', hourCycle: fmt === '24' ? 'h23' : 'h12' };
  return new Intl.DateTimeFormat(undefined, opts).format(ms);
}
export function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins <= 0) return ms > 0 ? '<1m' : '0m';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}
const utcFmt = (key, opts) => {
  const p = parseKey(key);
  return new Date(Date.UTC(p.y, p.mo - 1, p.d)).toLocaleDateString(undefined, { timeZone: 'UTC', ...opts });
};
export const formatDayLong = (k) => utcFmt(k, { year: 'numeric', month: 'long', day: 'numeric' });
export const formatDayShort = (k) => utcFmt(k, { month: 'short', day: 'numeric' });
export const formatDayMonth = (k) => utcFmt(k, { month: 'long', day: 'numeric' });
export const formatWeekday = (k) => utcFmt(k, { weekday: 'long', month: 'long', day: 'numeric' });
export const formatMonth = (mk) => utcFmt(`${mk}-01`, { year: 'numeric', month: 'long' });
export const greetingFor = (hour) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
export const formatDateTime = (ms) => `${formatDayShort(dayKeyOf(ms))}, ${formatTime(ms)}`;
