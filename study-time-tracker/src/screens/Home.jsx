import { useState } from 'react';
import { useStore } from '../store.jsx';
import { Link, go } from '../router.jsx';
import { Button, Confirm, Modal } from '../ui.jsx';
import { startSession, endSession, endDay } from '../lib/actions.js';
import { dayKeyOf, formatDayLong, formatDayMonth, formatDayShort, formatTime, formatWeekday } from '../lib/time.js';

export default function Home() {
  const { derived, today, act, setLastCycle } = useStore();
  const { active, exam, examToday, todayCompleted, working, pending, sessionsByDay } = derived;
  const [dialog, setDialog] = useState(null); // 'confirm' | 'active' | 'empty'
  const [busy, setBusy] = useState(false);

  const canStart = !active && !examToday && !todayCompleted;
  const canEndDay = pending.length > 0 || (!examToday && !todayCompleted);
  const workingCount = (sessionsByDay.get(working) || []).filter((s) => s.status === 'completed').length;
  const isToday = working === today;

  const startedLabel = active
    ? (dayKeyOf(active.startDateTime) === today ? formatTime(active.startDateTime) : `${formatDayShort(dayKeyOf(active.startDateTime))}, ${formatTime(active.startDateTime)}`)
    : '';

  const onStart = () => act(() => startSession(), { ok: 'Session started.' });
  const onEnd = async () => { setBusy(true); await act(() => endSession(active.id), { ok: 'Session recorded.' }); setBusy(false); setDialog(null); };

  const onEndDay = () => {
    if (active) setDialog('active');
    else if (workingCount === 0) setDialog('empty');
    else setDialog('confirm');
  };
  const confirmEndDay = async () => {
    setBusy(true);
    const res = await act(() => endDay(working));
    setBusy(false);
    setDialog(null);
    if (res.ok) { setLastCycle(res.res.completedCycleId ? { dayKey: working, cycleId: res.res.completedCycleId } : null); go(`day/${working}`); }
  };

  return (
    <main className="page home" id="main">
      <header className="home-head">
        <p className="app-name">Study Time</p>
        <h1 className="date">{formatWeekday(today)}</h1>
      </header>

      <section className="status" aria-labelledby="status-title">
        {active ? (
          <>
            <h2 id="status-title">Session in progress</h2>
            <p className="started">Started {startedLabel}</p>
            <Button variant="primary" size="lg" onClick={onEnd} disabled={busy}>End Session</Button>
            <Button size="lg" disabled aria-describedby="start-hint">Start Session</Button>
            <p id="start-hint" className="hint">A session is already running.</p>
          </>
        ) : examToday ? (
          <>
            <h2 id="status-title">Exam Mode</h2>
            <p className="started">{formatDayMonth(exam.exam.from)} → {formatDayMonth(exam.exam.to)}</p>
            <p>Tracking is paused.</p>
            <Button size="lg" disabled>Start Session</Button>
          </>
        ) : todayCompleted ? (
          <>
            <h2 id="status-title">Today is finished</h2>
            <p>Reopen the day if you need to add or correct sessions.</p>
            <Button variant="primary" size="lg" onClick={() => go(`day/${today}`)}>View today’s report</Button>
            <Button size="lg" disabled>Start Session</Button>
          </>
        ) : (
          <>
            <h2 id="status-title">No session running</h2>
            <Button variant="primary" size="lg" onClick={onStart} disabled={!canStart}>Start Session</Button>
          </>
        )}
      </section>

      {pending.length > 0 && !(isToday && workingCount === 0) && (
        <p className="note">
          {isToday ? `${workingCount} ${workingCount === 1 ? 'session' : 'sessions'} recorded today. ` : `${formatDayLong(working)} hasn’t been finished. `}
          <Link to={`day/${working}`}>Review sessions</Link>
        </p>
      )}

      <nav className="menu" aria-label="Main">
        <button type="button" className="menu-row" onClick={onEndDay} disabled={!canEndDay}>End for the Day</button>
        <Link className="menu-row" to="history">History</Link>
        <Link className="menu-row" to="stats">Statistics</Link>
        <Link className="menu-row" to="exam">Exam Mode</Link>
        <Link className="menu-row" to="settings">Settings</Link>
      </nav>

      {dialog === 'confirm' && (
        <Confirm title="End for today?" confirmLabel="Confirm" busy={busy} onCancel={() => setDialog(null)} onConfirm={confirmEndDay}>
          <p>{isToday ? 'Are you sure you want to finish today’s tracking?' : `Are you sure you want to finish tracking for ${formatDayLong(working)}?`}</p>
        </Confirm>
      )}
      {dialog === 'active' && (
        <Modal title="You still have an active session." onClose={() => setDialog(null)} actions={<>
          <Button data-autofocus onClick={() => setDialog(null)}>Back</Button>
          <Button variant="primary" onClick={onEnd} disabled={busy}>End Session</Button>
        </>}>
          <p>Please end the current session before ending the day.</p>
        </Modal>
      )}
      {dialog === 'empty' && (
        <Modal title="Nothing to finish yet" onClose={() => setDialog(null)} actions={<Button variant="primary" data-autofocus onClick={() => setDialog(null)}>OK</Button>}>
          <p>No sessions have been recorded for {isToday ? 'today' : formatDayLong(working)}.</p>
        </Modal>
      )}
    </main>
  );
}
