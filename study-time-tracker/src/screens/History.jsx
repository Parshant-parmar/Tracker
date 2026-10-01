import { useStore } from '../store.jsx';
import { Link } from '../router.jsx';
import { Page } from '../ui.jsx';
import { dayTotals } from '../lib/logic.js';
import { compareKeys, formatDayLong, formatDayMonth, formatDuration, formatMonth, monthKeyOf } from '../lib/time.js';

export default function History() {
  const { derived } = useStore();
  const { completedKeys, sessionsByDay, pending } = derived;
  const groups = [];
  for (const k of completedKeys) {
    const mk = monthKeyOf(k);
    const g = groups[groups.length - 1];
    if (g && g.mk === mk) g.keys.push(k); else groups.push({ mk, keys: [k] });
  }
  const open = [...pending].sort((a, b) => compareKeys(b, a));

  return (
    <Page title="History" back={{ to: '', label: 'Home' }}>
      {open.length > 0 && (
        <section aria-labelledby="open-h">
          <h2 id="open-h" className="section-title">Not finished</h2>
          <ul className="rows">
            {open.map((k) => (
              <li key={k}><Link className="row" to={`day/${k}`}><span>{formatDayMonth(k)}</span><span className="muted">Not finished</span></Link></li>
            ))}
          </ul>
        </section>
      )}
      {groups.length === 0 && open.length === 0 && <p className="empty">Finished days will appear here.</p>}
      {groups.map((g) => (
        <section key={g.mk} aria-labelledby={`m-${g.mk}`}>
          <h2 id={`m-${g.mk}`} className="section-title">{formatMonth(g.mk)} <Link className="small-link" to={`month/${g.mk}`}>Monthly report</Link></h2>
          <ul className="rows">
            {g.keys.map((k) => (
              <li key={k}>
                <Link className="row" to={`day/${k}`} aria-label={`${formatDayLong(k)}, ${formatDuration(dayTotals(sessionsByDay.get(k)).total)}`}>
                  <span>{formatDayMonth(k)}</span>
                  <span className="num">{formatDuration(dayTotals(sessionsByDay.get(k)).total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Page>
  );
}
