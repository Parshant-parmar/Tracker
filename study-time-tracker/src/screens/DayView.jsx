import { useState } from 'react';
import { useStore } from '../store.jsx';
import { Link, go } from '../router.jsx';
import { Button, Confirm, Modal, Page, Stat } from '../ui.jsx';
import SessionRow from '../components/SessionRow.jsx';
import SessionForm from '../components/SessionForm.jsx';
import { deleteSession, endDay, reopenDay } from '../lib/actions.js';
import { dayTotals } from '../lib/logic.js';
import { formatDayLong, formatDuration, formatTime, isValidKey } from '../lib/time.js';

export default function DayView({ dayKey }) {
  const { derived, today, act, lastCycle, setLastCycle } = useStore();
  const [form, setForm] = useState(null); // {session?} 
  const [del, setDel] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!isValidKey(dayKey)) return <Page title="Day not found" back={{ to: '', label: 'Home' }} />;
  const list = derived.sessionsByDay.get(dayKey) || [];
  const day = derived.daysMap.get(dayKey);
  const completed = day?.status === 'completed';
  const recorded = list.filter((s) => s.status === 'completed');
  const active = list.find((s) => s.status === 'active');
  const t = dayTotals(list);
  const isWorking = derived.working === dayKey;
  const cycleNote = lastCycle && lastCycle.dayKey === dayKey ? lastCycle.cycleId : null;

  const onDelete = async () => {
    setBusy(true);
    const res = await act(() => deleteSession(del.id), { ok: 'Session deleted.' });
    setBusy(false);
    if (res.ok) setDel(null);
  };
  const onEndDay = async () => {
    setBusy(true);
    const res = await act(() => endDay(dayKey));
    setBusy(false); setDialog(null);
    if (res.ok) setLastCycle(res.res.completedCycleId ? { dayKey, cycleId: res.res.completedCycleId } : null);
  };
  const onReopen = async () => {
    setBusy(true);
    const res = await act(() => reopenDay(dayKey), { ok: 'Day reopened.' });
    setBusy(false); setDialog(null);
    if (res.ok) setLastCycle(null);
  };

  const header = completed
    ? { title: formatDayLong(dayKey), subtitle: 'Day report', back: { to: 'history', label: 'History' } }
    : { title: formatDayLong(dayKey), subtitle: dayKey === today ? 'Today’s sessions' : 'Not finished', back: { to: '', label: 'Home' } };

  return (
    <Page {...header}>
      {completed && (
        <>
          <dl className="stats">
            <Stat label="Total Study" value={formatDuration(t.total)} />
            <Stat label="Sessions" value={t.count} />
            <Stat label="Longest Session" value={formatDuration(t.longest)} />
          </dl>
          {cycleNote && <p className="callout">That was day 7 of your cycle. <Link to={`cycle/${cycleNote}`}>See the 7-day report</Link></p>}
        </>
      )}

      <section aria-labelledby="sessions-h">
        <h2 id="sessions-h" className="section-title">Sessions</h2>
        {!completed && <p className="hint">Study time appears once you end the day.</p>}
        {recorded.length === 0 && !active && <p className="empty">No sessions recorded.</p>}
        <ul className="sessions">
          {recorded.map((s, i) => (
            <SessionRow key={s.id} session={s} number={i + 1} showDuration={completed}
              onEdit={() => setForm({ session: s })} onDelete={() => setDel(s)} />
          ))}
          {active && (
            <li className="session"><div className="session-main"><span className="session-name">In progress</span>
              <span className="session-time">Started {formatTime(active.startDateTime)}</span></div></li>
          )}
        </ul>
      </section>

      <div className="actions">
        {!completed && <Button onClick={() => setForm({})}>Add session</Button>}
        {!completed && isWorking && <Button variant="primary" onClick={() => (active ? setDialog('active') : recorded.length ? setDialog('end') : setDialog('empty'))}>End for the Day</Button>}
        {completed && <Button onClick={() => setDialog('reopen')}>Reopen Day</Button>}
      </div>

      {form && <SessionForm session={form.session} defaultDate={dayKey} onClose={() => setForm(null)} />}
      {del && (
        <Confirm title="Delete this session?" danger confirmLabel="Delete" busy={busy} onCancel={() => setDel(null)} onConfirm={onDelete}>
          <p>{formatTime(del.startDateTime)} → {formatTime(del.endDateTime)} on {formatDayLong(del.dayKey)}</p>
          <p>This cannot be undone unless restored from backup.</p>
        </Confirm>
      )}
      {dialog === 'end' && (
        <Confirm title="End for today?" confirmLabel="Confirm" busy={busy} onCancel={() => setDialog(null)} onConfirm={onEndDay}>
          <p>Are you sure you want to finish tracking for {formatDayLong(dayKey)}?</p>
        </Confirm>
      )}
      {dialog === 'active' && (
        <Modal title="You still have an active session." onClose={() => setDialog(null)} actions={<Button variant="primary" data-autofocus onClick={() => { setDialog(null); go(''); }}>Back to Home</Button>}>
          <p>Please end the current session before ending the day.</p>
        </Modal>
      )}
      {dialog === 'empty' && (
        <Modal title="Nothing to finish yet" onClose={() => setDialog(null)} actions={<Button variant="primary" data-autofocus onClick={() => setDialog(null)}>OK</Button>}>
          <p>Add a session first, then end the day.</p>
        </Modal>
      )}
      {dialog === 'reopen' && (
        <Confirm title="Reopen this day?" confirmLabel="Reopen Day" busy={busy} onCancel={() => setDialog(null)} onConfirm={onReopen}>
          <p>You can add, edit or delete sessions, then end the day again. Your sessions stay as they are.</p>
        </Confirm>
      )}
    </Page>
  );
}
