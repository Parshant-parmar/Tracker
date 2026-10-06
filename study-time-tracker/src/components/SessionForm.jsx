import { useState } from 'react';
import { Button, Field, Modal } from '../ui.jsx';
import { useStore } from '../store.jsx';
import { saveSession } from '../lib/actions.js';
import { dayKeyOf, localMs, timeInputValue } from '../lib/time.js';

// Add or edit a session. Study Day, Start (date + time) and End (date + time) are five independent fields:
// the study day decides which day's report the session counts in; the start/end timestamps decide
// chronology and duration. Nothing here derives one from another.
export default function SessionForm({ session, defaultDate, onClose }) {
  const { act, today } = useStore();
  const editing = !!session;
  const [studyDay, setStudyDay] = useState(editing ? session.dayKey : defaultDate);
  const [startDate, setStartDate] = useState(editing ? dayKeyOf(session.startDateTime) : defaultDate);
  const [start, setStart] = useState(editing ? timeInputValue(session.startDateTime) : '');
  const [endDate, setEndDate] = useState(editing ? dayKeyOf(session.endDateTime) : defaultDate);
  const [end, setEnd] = useState(editing ? timeInputValue(session.endDateTime) : '');
  const [endTouched, setEndTouched] = useState(editing); // until the user picks an end date, a new session's end date follows its start date
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onStartDate = (v) => { setStartDate(v); if (!endTouched) setEndDate(v); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (!studyDay || !startDate || !start || !endDate || !end) { setError('Enter a study day, a start date and time, and an end date and time.'); return; }
    const startMs = localMs(startDate, start);
    const endMs = localMs(endDate, end);
    if (!(endMs > startMs)) { setError('The end must be after the start.'); return; }
    setBusy(true);
    const res = await act(() => saveSession({ id: session?.id, dayKey: studyDay, startMs, endMs }), { ok: editing ? 'Session updated.' : 'Session added.', inline: true });
    setBusy(false);
    if (res.ok) onClose(); else setError(res.message);
  };

  return (
    <Modal title={editing ? 'Edit session' : 'Add session'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="Study Day" hint="The day this session is counted under in reports.">
          {(id) => <input id={id} data-autofocus type="date" value={studyDay} max={today} onChange={(e) => { setStudyDay(e.target.value); setError(''); }} required />}
        </Field>
        <div className="field-row">
          <Field label="Start Date">{(id) => <input id={id} type="date" value={startDate} max={today} onChange={(e) => onStartDate(e.target.value)} required />}</Field>
          <Field label="Start Time">{(id) => <input id={id} type="time" value={start} onChange={(e) => { setStart(e.target.value); setError(''); }} required />}</Field>
        </div>
        <div className="field-row">
          <Field label="End Date">{(id) => <input id={id} type="date" value={endDate} max={today} onChange={(e) => { setEndDate(e.target.value); setEndTouched(true); setError(''); }} required />}</Field>
          <Field label="End Time">{(id) => <input id={id} type="time" value={end} onChange={(e) => { setEnd(e.target.value); setError(''); }} required />}</Field>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
