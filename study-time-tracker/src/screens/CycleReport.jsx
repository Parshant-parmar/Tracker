import { useStore } from '../store.jsx';
import { Link } from '../router.jsx';
import { Page, Stat } from '../ui.jsx';
import { cycleReport, CYCLE_LENGTH } from '../lib/logic.js';
import { formatDayLong, formatDayMonth, formatDuration } from '../lib/time.js';

export default function CycleReport({ id }) {
  const { derived } = useStore();
  const cycle = derived.cycles.find((c) => c.id === id);
  if (!cycle || cycle.status !== 'completed') return <Page title="Report not found" back={{ to: 'stats', label: 'Statistics' }}><p className="empty">This 7-day report doesn’t exist.</p></Page>;
  const c = cycleReport(cycle, derived.sessionsByDay, derived.daysMap);
  return (
    <Page title="7-day report" subtitle={`${formatDayLong(c.from)} to ${formatDayLong(c.to)}`} back={{ to: 'stats', label: 'Statistics' }}>
      <dl className="stats">
        <Stat label="Total Study" value={formatDuration(c.total)} />
        <Stat label="Average / Day" value={formatDuration(c.average)} />
        <Stat label="Days Completed" value={`${c.count} / ${CYCLE_LENGTH}`} />
      </dl>
      <section aria-labelledby="d-h">
        <h2 id="d-h" className="section-title">Days</h2>
        <ul className="rows">
          {c.days.map((d) => (
            <li key={d.dayKey}>
              <Link className="row" to={`day/${d.dayKey}`}>
                <span>{formatDayMonth(d.dayKey)}{d.reopened && <span className="tag">reopened</span>}</span>
                <span className="num">{formatDuration(d.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}
