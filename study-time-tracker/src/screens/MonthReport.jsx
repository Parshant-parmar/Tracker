import { useStore } from '../store.jsx';
import { Link } from '../router.jsx';
import { Page, Stat } from '../ui.jsx';
import { dayTotals } from '../lib/logic.js';
import { formatDayMonth, formatDuration, formatMonth } from '../lib/time.js';

export default function MonthReport({ monthKey }) {
  const { derived } = useStore();
  const { months, sessionsByDay } = derived;
  const i = months.findIndex((m) => m.monthKey === monthKey);
  if (i < 0) return <Page title="No data for this month" back={{ to: 'stats', label: 'Statistics' }}><p className="empty">There are no finished days in this month.</p></Page>;
  const m = months[i];
  const newer = months[i - 1], older = months[i + 1];
  return (
    <Page title={formatMonth(m.monthKey)} subtitle="Monthly report" back={{ to: 'stats', label: 'Statistics' }}>
      <dl className="stats stats-2">
        <Stat label="Total Study" value={formatDuration(m.total)} />
        <Stat label="Study Days" value={m.studyDays} />
        <Stat label="Sessions" value={m.sessions} />
        <Stat label="Longest Session" value={formatDuration(m.longest)} />
      </dl>
      {m.examDays > 0 && <p className="hint">{m.examDays} Exam Mode {m.examDays === 1 ? 'day is' : 'days are'} left out. They aren’t counted as zero-study days.</p>}
      <section aria-labelledby="md-h">
        <h2 id="md-h" className="section-title">Days</h2>
        <ul className="rows">
          {m.dayKeys.map((k) => (
            <li key={k}><Link className="row" to={`day/${k}`}><span>{formatDayMonth(k)}</span><span className="num">{formatDuration(dayTotals(sessionsByDay.get(k)).total)}</span></Link></li>
          ))}
        </ul>
      </section>
      <nav className="pager" aria-label="Other months">
        {older ? <Link to={`month/${older.monthKey}`}>{formatMonth(older.monthKey)}</Link> : <span />}
        {newer ? <Link to={`month/${newer.monthKey}`}>{formatMonth(newer.monthKey)}</Link> : <span />}
      </nav>
    </Page>
  );
}
