import { useStore } from '../store.jsx';
import { Link } from '../router.jsx';
import { Page } from '../ui.jsx';
import { dayTotals } from '../lib/logic.js';
import { compareKeys, formatDayLong, formatDayShort, formatDuration, formatMonth, monthKeyOf } from '../lib/time.js';

// History is a VIEW over the data: only the current month's finished days are listed.
// Nothing is deleted when the month changes; older months live on in Monthly, Statistics, reports and backups.
export default function History() {
  const { derived, today } = useStore();
  const { completedKeys, sessionsByDay, pending } = derived;
  const mk = monthKeyOf(today);
  const keys = completedKeys.filter((k) => monthKeyOf(k) === mk);
  // Unfinished days stay reachable (from any month) because they still need an action.
  const open = [...pending].sort((a, b) => compareKeys(b, a));

  return (
    <Page title="History" subtitle={formatMonth(mk)}>
      {open.length > 0 && (
        <section aria-labelledby="open-h">
          <h2 id="open-h" className="section-title">Not finished</h2>
          <ul className="rows">
            {open.map((k) => (
              <li key={k}><Link className="row" to={`day/${k}`}><span>{formatDayShort(k)}</span><span className="muted">Not finished</span></Link></li>
            ))}
          </ul>
        </section>
      )}
      {keys.length === 0 ? <p className="empty">Finished days in {formatMonth(mk)} will appear here.</p> : (
        <ul className="rows">
          {keys.map((k) => {
            const total = formatDuration(dayTotals(sessionsByDay.get(k)).total);
            return (
              <li key={k}>
                <Link className="row" to={`day/${k}`} aria-label={`${formatDayLong(k)}, ${total}`}>
                  <span>{formatDayShort(k)}</span>
                  <span className="num">{total}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
