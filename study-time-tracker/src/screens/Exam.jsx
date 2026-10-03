import { useState } from 'react';
import { useStore } from '../store.jsx';
import { Button, Field, Modal, Page } from '../ui.jsx';
import { createExam, updateExam, endExamEarly } from '../lib/actions.js';
import { addDays, dayNum, formatDayLong, formatDayMonth } from '../lib/time.js';

function RangeFields({ from, to, setFrom, setTo, min }) {
  return (
    <div className="field-row">
      <Field label="From date">{(id) => <input id={id} type="date" value={from} min={min} onChange={(e) => setFrom(e.target.value)} required />}</Field>
      <Field label="To date">{(id) => <input id={id} type="date" value={to} min={from || min} onChange={(e) => setTo(e.target.value)} required />}</Field>
    </div>
  );
}

function EditDialog({ exam, onClose }) {
  const { act, today } = useStore();
  const [from, setFrom] = useState(exam.from);
  const [to, setTo] = useState(exam.to);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!from || !to || dayNum(to) < dayNum(from)) { setError('Choose a valid date range. The end can’t be before the start.'); return; }
    const res = await act(() => updateExam(exam.id, { from, to }), { ok: 'Exam Mode updated.', inline: true });
    if (res.ok) onClose(); else setError(res.message);
  };
  return (
    <Modal title="Edit Exam Mode" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <RangeFields from={from} to={to} setFrom={setFrom} setTo={setTo} />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit">Save</Button></div>
      </form>
    </Modal>
  );
}

function DeleteDialog({ exam, started, onClose }) {
  const { act, today } = useStore();
  const [resume, setResume] = useState(today);
  const [step, setStep] = useState(started ? 'pick' : 'confirm');
  const [error, setError] = useState('');
  const valid = resume && dayNum(resume) >= dayNum(today) && dayNum(resume) <= dayNum(exam.to);
  const apply = async () => {
    const res = await act(() => endExamEarly(exam.id, resume), { ok: started ? 'Exam Mode ended. Normal tracking resumes.' : 'Exam Mode deleted.', inline: true });
    if (res.ok) onClose(); else { setError(res.message); setStep('pick'); }
  };
  if (step === 'pick') {
    return (
      <Modal title="Delete Exam Mode?" onClose={onClose}>
        <form onSubmit={(e) => { e.preventDefault(); if (valid) { setError(''); setStep('confirm'); } else setError('Choose today or a later date within the exam period.'); }} noValidate>
          <p>When should normal tracking start again?</p>
          <Field label="Resume on" hint={`Today or later, up to ${formatDayLong(exam.to)}.`}>
            {(id) => <input id={id} data-autofocus type="date" value={resume} min={today} max={exam.to} onChange={(e) => setResume(e.target.value)} required />}
          </Field>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="modal-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit">Continue</Button></div>
        </form>
      </Modal>
    );
  }
  return (
    <Modal title="Delete Exam Mode?" onClose={onClose} actions={<>
      <Button data-autofocus onClick={started ? () => setStep('pick') : onClose}>{started ? 'Back' : 'Cancel'}</Button>
      <Button variant="danger" onClick={apply}>Delete Exam Mode</Button>
    </>}>
      {started ? (
        <>
          <p>Exam Mode will run {formatDayMonth(exam.from)} to {formatDayMonth(addDays(resume, -1))} {dayNum(resume) === dayNum(today) ? '(already over)' : ''}.</p>
          <p>Normal tracking resumes on {formatDayLong(resume)}.</p>
          <p className="hint">The original period stays in your Exam Mode history.</p>
        </>
      ) : <p>This Exam Mode hasn’t started. It will be removed from your schedule and kept in your history.</p>}
    </Modal>
  );
}

export default function Exam() {
  const { data, derived, today, act } = useStore();
  const cur = derived.exam;
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);

  const start = async (e) => {
    e.preventDefault();
    if (!from || !to || dayNum(to) < dayNum(from)) { setError('Choose a valid date range. The end can’t be before the start.'); return; }
    const res = await act(() => createExam({ from, to }), { ok: 'Exam Mode started.', inline: true });
    if (!res.ok) setError(res.message); else setError('');
  };

  const past = data.examModes.filter((e) => !(cur && e.id === cur.exam.id)).sort((a, b) => dayNum(b.from) - dayNum(a.from));
  const started = cur?.state === 'active';

  return (
    <Page title="Exam Mode">
      {cur ? (
        <section className="status" aria-labelledby="exam-h">
          <h2 id="exam-h">{started ? 'Exam Mode' : 'Exam Mode scheduled'}</h2>
          <p className="started">{formatDayMonth(cur.exam.from)} → {formatDayMonth(cur.exam.to)}</p>
          <p>{started ? 'Tracking is paused.' : 'Normal tracking continues until it starts.'}</p>
          <div className="actions">
            <Button onClick={() => setDialog('edit')}>Edit Exam Mode</Button>
            <Button variant="danger-quiet" onClick={() => setDialog('delete')}>Delete Exam Mode</Button>
          </div>
        </section>
      ) : (
        <form onSubmit={start} noValidate className="status">
          <p>Pause normal tracking for an exam period. Exam days don’t count as study days, and your 7-day cycle stays where it is.</p>
          <RangeFields from={from} to={to} setFrom={setFrom} setTo={setTo} min={today} />
          {error && <p className="error" role="alert">{error}</p>}
          <Button variant="primary" size="lg" type="submit" disabled={!!derived.active && from === today}>Start Exam Mode</Button>
          {derived.active && from === today && <p className="hint">End your current session first, or choose a later start date.</p>}
        </form>
      )}

      {past.length > 0 && (
        <section aria-labelledby="past-h">
          <h2 id="past-h" className="section-title">Exam Mode history</h2>
          <ul className="rows">
            {past.map((e) => {
              const early = e.history?.find((h) => h.type === 'ended-early');
              return (
                <li key={e.id} className="row row-2 static">
                  <span>{formatDayMonth(e.from)} → {formatDayMonth(e.to)}
                    <span className="sub">{e.status === 'removed' ? 'Removed' : early ? `Ended early, tracking resumed ${formatDayLong(early.resume)}` : 'Completed'}</span></span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {dialog === 'edit' && <EditDialog exam={cur.exam} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteDialog exam={cur.exam} started={started} onClose={() => setDialog(null)} />}
    </Page>
  );
}
