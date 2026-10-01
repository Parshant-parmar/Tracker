import { useState } from 'react';
import { Button, Field, Modal } from '../ui.jsx';
import { useStore } from '../store.jsx';
import { reduceTime } from '../lib/actions.js';
import { excluded } from '../lib/logic.js';

// mode 'add': remove more minutes. mode 'edit': change the total reduction (0 clears it).
export default function ReduceTimeDialog({ session, mode = 'add', onClose }) {
  const { act } = useStore();
  const [value, setValue] = useState(mode === 'edit' ? String(Math.round(excluded(session) / 60000)) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const v = value.trim();
    if (!/^\d+$/.test(v) || (mode === 'add' && Number(v) < 1)) { setError('Enter a whole number of minutes.'); return; }
    setBusy(true);
    const res = await act(() => reduceTime(session.id, Number(v), mode === 'edit' ? 'set' : 'add'), { ok: 'Time reduced.', inline: true });
    setBusy(false);
    if (res.ok) onClose(); else setError(res.message);
  };

  return (
    <Modal title={mode === 'edit' ? 'Edit reduction' : 'Reduce Time'} onClose={onClose} narrow>
      <form onSubmit={submit} noValidate>
        <Field label={mode === 'edit' ? 'How many minutes should be removed?' : 'How many minutes do you want to remove?'}>
          {(id) => <input id={id} data-autofocus type="text" inputMode="numeric" autoComplete="off" value={value}
            onChange={(e) => { setValue(e.target.value); setError(''); }} />}
        </Field>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy}>{mode === 'edit' ? 'Save' : 'Reduce Time'}</Button>
        </div>
      </form>
    </Modal>
  );
}
