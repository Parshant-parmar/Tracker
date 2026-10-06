import { Button } from '../ui.jsx';
import { formatTime, formatDuration, formatDayShort, dayKeyOf } from '../lib/time.js';
import { duration, excluded } from '../lib/logic.js';

export default function SessionRow({ session, number, showDuration, onEdit, onDelete, onReduce, onEditReduction }) {
  const s = session;
  const crosses = s.endDateTime != null && dayKeyOf(s.endDateTime) !== dayKeyOf(s.startDateTime);
  const label = `Session ${number}`;
  return (
    <li className="session">
      <div className="session-main">
        <span className="session-name">{label}</span>
        <span className="session-time">
          {formatTime(s.startDateTime)} → {s.endDateTime != null ? formatTime(s.endDateTime) : 'in progress'}
          {s.dayKey && dayKeyOf(s.startDateTime) !== s.dayKey && <span className="tag">starts {formatDayShort(dayKeyOf(s.startDateTime))}</span>}
          {crosses && <span className="tag">ends {formatDayShort(dayKeyOf(s.endDateTime))}</span>}
        </span>
      </div>
      {showDuration && s.endDateTime != null && <span className="session-dur">{formatDuration(duration(s))}</span>}
      {s.status === 'completed' && (
        <span className="row-actions">
          {onReduce && <Button variant="quiet" onClick={onReduce} aria-label={`Reduce time for ${label}`}>Reduce Time</Button>}
          {onEditReduction && excluded(s) > 0 && <Button variant="quiet" onClick={onEditReduction} aria-label={`Edit reduction for ${label}`}>Edit reduction</Button>}
          <Button variant="quiet" onClick={onEdit} aria-label={`Edit ${label}`}>Edit</Button>
          <Button variant="quiet" onClick={onDelete} aria-label={`Delete ${label}`}>Delete</Button>
        </span>
      )}
    </li>
  );
}
