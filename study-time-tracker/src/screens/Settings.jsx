import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { Button, Confirm, Field, Modal, Page, Segmented } from '../ui.jsx';
import { saveSettings, deleteAllData } from '../lib/actions.js';
import { applyImport, downloadBackup, parseBackup, planImport, ImportError, SCHEMA_VERSION } from '../lib/backup.js';
import { formatDateTime } from '../lib/time.js';

const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

function ImportDialog({ plan, onClose }) {
  const { data, act, reload } = useStore();
  const [backupFirst, setBackupFirst] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const s = plan.sessions;
  const nothing = !s.add && !s.replace && !plan.days.add && !plan.days.replace && !plan.exams.add && !plan.exams.replace && !plan.cycles.rebuilt && !plan.writes.cycles.length && !plan.writes.settings;
  const run = async () => {
    setBusy(true); setError('');
    if (backupFirst) { try { downloadBackup(data); } catch { setError('Couldn’t save a copy of your current data, so nothing was imported.'); setBusy(false); return; } }
    const res = await act(() => applyImport(plan), { ok: 'Progress imported.', inline: true });
    setBusy(false);
    if (res.ok) { await reload(); onClose(); } else setError(res.message);
  };
  return (
    <Modal title="Import progress?" onClose={onClose} actions={<>
      <Button data-autofocus onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={run} disabled={busy}>Import</Button>
    </>}>
      <p>This will restore your previous study data. Existing data may be affected, so nothing is overwritten without a rule:</p>
      <ul className="plain">
        <li>{s.add} new {s.add === 1 ? 'session' : 'sessions'} will be added.</li>
        {s.same > 0 && <li>{s.same} already here (not duplicated).</li>}
        {s.replace > 0 && <li>{s.replace} will be replaced by a newer version from the backup.</li>}
        {s.keptLocal > 0 && <li>{s.keptLocal} differ, and the version on this device is newer, so it stays.</li>}
        {(plan.days.add + plan.days.replace) > 0 && <li>{plan.days.add + plan.days.replace} finished-day records restored.</li>}
        {(plan.exams.add + plan.exams.replace) > 0 && <li>{plan.exams.add + plan.exams.replace} Exam Mode periods restored.</li>}
        {plan.cycles.rebuilt && <li>7-day cycles will be rebuilt from your finished days. The old cycle records are archived.</li>}
      </ul>
      {(s.skipped.length > 0 || plan.exams.skipped > 0) && (
        <div className="callout">
          <strong>Not imported</strong>
          <ul className="plain">
            {s.skipped.slice(0, 6).map((m, i) => <li key={i}>{m}</li>)}
            {s.skipped.length > 6 && <li>…and {s.skipped.length - 6} more.</li>}
            {plan.exams.skipped > 0 && <li>{plan.exams.skipped} Exam Mode period(s) overlap an existing one.</li>}
          </ul>
        </div>
      )}
      {nothing && <p className="hint">Everything in this file is already on this device.</p>}
      <label className="check"><input type="checkbox" checked={backupFirst} onChange={(e) => setBackupFirst(e.target.checked)} /> Download a backup of my current data first</label>
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  );
}

function DeleteAllDialog({ onClose }) {
  const { data, act, showToast } = useStore();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const res = await act(() => deleteAllData(), { ok: 'All study data deleted.' });
    setBusy(false);
    if (res.ok) onClose();
  };
  return (
    <Modal title="Delete all data?" onClose={onClose} actions={<>
      <Button data-autofocus onClick={onClose}>Cancel</Button>
      <Button variant="danger" onClick={run} disabled={busy || text.trim().toLowerCase() !== 'delete'}>Delete Everything</Button>
    </>}>
      <p>This will permanently remove your study history from this browser.</p>
      <p>Make sure you have exported a backup first.</p>
      <p><Button onClick={() => { downloadBackup(data); showToast('Backup downloaded.'); }}>Export Progress now</Button></p>
      <Field label="Type DELETE to confirm">{(id) => <input id={id} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck="false" />}</Field>
    </Modal>
  );
}

export default function Settings() {
  const { data, settings, act, showToast } = useStore();
  const fileRef = useRef(null);
  const [plan, setPlan] = useState(null);
  const [importError, setImportError] = useState('');
  const [del, setDel] = useState(false);
  const [persisted, setPersisted] = useState(null);

  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted).catch(() => {}); }, []);

  const exportNow = async () => {
    try { downloadBackup(data); } catch (e) { console.error(e); showToast('We couldn’t create the backup file. Please try again.', 'error'); return; }
    await act(() => saveSettings({ lastExportAt: Date.now() }), { ok: 'Backup downloaded.' });
  };

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = parseBackup(await file.text());
      setPlan(planImport(parsed, data));
    } catch (err) {
      setImportError(err instanceof ImportError ? err.message : 'We couldn’t read that file.');
    }
  };

  return (
    <Page title="Settings" back={{ to: '', label: 'Home' }}>
      <section aria-labelledby="ap-h">
        <h2 id="ap-h" className="section-title">Appearance</h2>
        <Segmented legend="Theme" value={settings.theme} onChange={(v) => act(() => saveSettings({ theme: v }))}
          options={[{ value: 'light', label: 'Light Mode' }, { value: 'dark', label: 'Dark Mode' }]} />
      </section>

      <section aria-labelledby="tf-h">
        <h2 id="tf-h" className="section-title">Time Format</h2>
        <Segmented legend="Clock" value={settings.timeFormat} onChange={(v) => act(() => saveSettings({ timeFormat: v }))}
          options={[{ value: '12', label: '12-hour' }, { value: '24', label: '24-hour' }]} />
      </section>

      <section aria-labelledby="da-h">
        <h2 id="da-h" className="section-title">Data</h2>
        <p className="hint">Your study data is stored in this browser only. Export a backup regularly, and before switching browsers or devices.
          {' '}{settings.lastExportAt ? `Last backup: ${formatDateTime(settings.lastExportAt)}.` : 'You haven’t exported a backup yet.'}</p>
        <div className="actions">
          <Button onClick={exportNow}>Export Progress</Button>
          <Button onClick={() => fileRef.current?.click()}>Import Progress</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={pick} aria-label="Choose a backup file to import" />
        </div>
        {persisted === false && <p className="hint">This browser may clear site data when storage is low. Regular backups protect you from that.</p>}
        <div className="actions"><Button variant="danger-quiet" onClick={() => setDel(true)}>Delete All Data</Button></div>
      </section>

      <section aria-labelledby="ab-h">
        <h2 id="ab-h" className="section-title">About</h2>
        <p className="hint">Study Time, version {VERSION}. Data format {SCHEMA_VERSION}.</p>
      </section>

      {plan && <ImportDialog plan={plan} onClose={() => setPlan(null)} />}
      {importError && (
        <Modal title="Can’t import this file" onClose={() => setImportError('')} actions={<Button variant="primary" data-autofocus onClick={() => setImportError('')}>OK</Button>}>
          <p className="prewrap">{importError}</p>
          <p className="hint">Nothing was changed.</p>
        </Modal>
      )}
      {del && <DeleteAllDialog onClose={() => setDel(false)} />}
    </Page>
  );
}
