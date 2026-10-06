import { useState } from 'react';
import { useStore } from '../store.jsx';
import { Link, go } from '../router.jsx';
import { Button, Confirm, Modal } from '../ui.jsx';
import { startSession, endSession, endDay } from '../lib/actions.js';
import { dayKeyOf, formatDayLong, formatDayMonth, formatDayShort, formatTime, greetingFor } from '../lib/time.js';

export default function Home() {
  const { derived, today, act, setLastCycle } = useStore();
  const { active, exam, examToday, todayCompleted, working, pending, sessionsByDay } = derived;
  const [dialog, setDialog] = useState(null); // 'confirm' | 'active' | 'empty'
  const [busy, setBusy] = useState(false);

  const finishedToday = todayCompleted && pending.length === 0;
  const canStart = !active && !examToday && !finishedToday;
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
        <h1 className="greeting">{greetingFor(new Date().getHours())}</h1>
        <p className="date">{formatDayLong(today)}</p>
      </header>

      <section className="status" aria-labelledby="status-title">
        {active ? (
          <>
            <h2 id="status-title" className="eyebrow">Session in progress</h2>
            <p className="started">Started at {startedLabel}</p>
            <Button variant="primary" size="hero" onClick={onEnd} disabled={busy}>End Session</Button>
          </>
        ) : examToday ? (
          <>
            <h2 id="status-title" className="eyebrow">Exam Mode</h2>
            <p className="started">{formatDayMonth(exam.exam.from)} → {formatDayMonth(exam.exam.to)}</p>
            <p className="hint">Tracking is paused.</p>
            <Button size="hero" disabled>Start Session</Button>
          </>
        ) : finishedToday ? (
          <>
            <h2 id="status-title" className="eyebrow">Today is finished</h2>
            <p className="hint">Reopen the day if you need to add or correct sessions.</p>
            <Button variant="primary" size="hero" onClick={() => go(`day/${today}`)}>View today’s report</Button>
            <Button size="hero" disabled>Start Session</Button>
          </>
        ) : (
          <>
            <h2 id="status-title" className="eyebrow">Start session</h2>
            <Button variant="primary" size="hero" onClick={onStart} disabled={!canStart}>Start Session</Button>
          </>
        )}
      </section>

      <div className="home-foot">
        {pending.length > 0 && !(isToday && workingCount === 0) && (
          <p className="note">
            {isToday ? `${workingCount} ${workingCount === 1 ? 'session' : 'sessions'} recorded today. ` : `${formatDayLong(working)} hasn’t been finished. `}
            <Link to={`day/${working}`}>Review sessions</Link>
          </p>
        )}
        <Button variant="quiet" onClick={onEndDay} disabled={!canEndDay}>End for the Day</Button>
      </div>

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
