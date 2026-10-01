import { useState } from 'react';
import { Button, Field, Modal } from '../ui.jsx';
import { useStore } from '../store.jsx';
import { saveSession } from '../lib/actions.js';
import { addDays, dayKeyOf, formatDayLong, formatTime, localMs, timeInputValue } from '../lib/time.js';

// Add or edit a session. Only date, start time and end time can be changed.
export default function SessionForm({ session, defaultDate, onClose }) {
  const { act, today } = useStore();
  const editing = !!session;
  const [date, setDate] = useState(editing ? dayKeyOf(session.startDateTime) : defaultDate);
  const [start, setStart] = useState(editing ? timeInputValue(session.startDateTime) : '');
  const [end, setEnd] = useState(editing ? timeInputValue(session.endDateTime) : '');
  const [step, setStep] = useState('form'); // form | end-day | move
  const [endDate, setEndDate] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const originallyCrossed = editing && dayKeyOf(session.endDateTime) !== dayKeyOf(session.startDateTime);

  const validate = () => {
    if (!date || !start || !end) return 'Enter a date, a start time and an end time.';
    return '';
  };

  const commit = async (finalEndDate, confirmedMove) => {
    const startMs = localMs(date, start);
    const endMs = localMs(finalEndDate, end);
    if (editing && !confirmedMove && dayKeyOf(startMs) !== session.dayKey) { setEndDate(finalEndDate); setStep('move'); return; }
    setBusy(true);
    const res = await act(() => saveSession({ id: session?.id, startMs, endMs }), { ok: editing ? 'Session updated.' : 'Session added.', inline: true });
    setBusy(false);
    if (res.ok) onClose();
    else { setError(res.message); setStep('form'); }
  };

  const submit = (e) => {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setError('');
    const sameDayEnd = localMs(date, end);
    const ambiguous = sameDayEnd <= localMs(date, start) || originallyCrossed;
    if (ambiguous) { setStep('end-day'); return; }
    commit(date, false);
  };

  if (step === 'end-day') {
    const next = addDays(date, 1);
    const sameOk = localMs(date, end) > localMs(date, start);
    return (
      <Modal title="Which day does it end?" onClose={() => setStep('form')} actions={<>
        <Button data-autofocus onClick={() => setStep('form')}>Back to edit</Button>
        <Button disabled={!sameOk} onClick={() => commit(date, false)}>Ends {formatDayLong(date)}</Button>
        <Button variant="primary" onClick={() => commit(next, false)}>Ends {formatDayLong(next)}</Button>
      </>}>
        <p>The session starts at {formatTime(localMs(date, start))} on {formatDayLong(date)} and ends at {formatTime(localMs(date, end))}. Please confirm the day it ended.</p>
        {!sameOk && <p className="hint">That time is earlier than the start, so it can’t be the same day.</p>}
      </Modal>
    );
  }

  if (step === 'move') {
    return (
      <Modal title="Move this session?" onClose={() => setStep('form')} actions={<>
        <Button data-autofocus onClick={() => setStep('form')}>Back to edit</Button>
        <Button variant="primary" disabled={busy} onClick={() => commit(endDate, true)}>Move session</Button>
      </>}>
        <p>This changes the session from {formatDayLong(session.dayKey)} to {formatDayLong(date)}. Both days’ reports will be recalculated.</p>
      </Modal>
    );
  }

  return (
    <Modal title={editing ? 'Edit session' : 'Add session'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="Date">{(id) => <input id={id} data-autofocus type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />}</Field>
        <div className="field-row">
          <Field label="Start time">{(id) => <input id={id} type="time" value={start} onChange={(e) => setStart(e.target.value)} required />}</Field>
          <Field label="End time">{(id) => <input id={id} type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />}</Field>
        </div>
        {originallyCrossed && <p className="hint">This session currently ends on {formatDayLong(dayKeyOf(session.endDateTime))}. You’ll be asked to confirm the end day.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
