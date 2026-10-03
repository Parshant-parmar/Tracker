import { useStore } from '../store.jsx';
import { Link } from '../router.jsx';
import { Page, Stat } from '../ui.jsx';
import { CYCLE_LENGTH } from '../lib/logic.js';
import { formatDayShort, formatDuration, formatMonth } from '../lib/time.js';

export default function Stats() {
  const { derived } = useStore();
  const { overall, cycleReports, months, openCycle } = derived;
  return (
    <Page title="Statistics">
      <dl className="stats stats-2">
        <Stat label="Total study time" value={formatDuration(overall.total)} />
        <Stat label="Completed study days" value={overall.days} />
        <Stat label="Total sessions" value={overall.sessions} />
        <Stat label="Longest session" value={formatDuration(overall.longest)} />
      </dl>

      <section aria-labelledby="cyc-h">
        <h2 id="cyc-h" className="section-title">7-day reports</h2>
        <p className="hint">Current cycle: {openCycle ? openCycle.dayKeys.length : 0} of {CYCLE_LENGTH} days completed. Its report is made after day 7.</p>
        {cycleReports.length === 0 ? <p className="empty">No completed 7-day reports yet.</p> : (
          <ul className="rows">
            {cycleReports.map((c) => (
              <li key={c.id}>
                <Link className="row row-2" to={`cycle/${c.id}`}>
                  <span>Cycle {c.index}<span className="sub">{formatDayShort(c.from)} to {formatDayShort(c.to)}</span></span>
                  <span className="num">{formatDuration(c.total)}<span className="sub">{formatDuration(c.average)} / day</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="mon-h">
        <h2 id="mon-h" className="section-title">Monthly reports</h2>
        {months.length === 0 ? <p className="empty">Monthly reports appear after your first finished day.</p> : (
          <ul className="rows">
            {months.map((m) => (
              <li key={m.monthKey}>
                <Link className="row" to={`month/${m.monthKey}`}><span>{formatMonth(m.monthKey)}</span><span className="num">{formatDuration(m.total)}</span></Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
