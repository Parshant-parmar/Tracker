import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadAll } from './lib/db.js';
import { initApp } from './lib/actions.js';
import { derive } from './lib/logic.js';
import { dayKeyOf, setTimeFormat, defaultTimeFormat } from './lib/time.js';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export function StoreProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState(null);
  const [lastCycle, setLastCycle] = useState(null);
  const channel = useRef(null);

  const reload = useCallback(async () => {
    try { setState({ status: 'ready', data: await loadAll(), error: null }); }
    catch (error) { console.error(error); setState((s) => ({ status: s.data ? 'ready' : 'error', data: s.data, error })); }
  }, []);

  const boot = useCallback(async () => {
    setState({ status: 'loading', data: null, error: null });
    try { setState({ status: 'ready', data: await initApp(VERSION), error: null }); }
    catch (error) { console.error(error); setState({ status: 'error', data: null, error }); }
  }, []);

  useEffect(() => { boot(); }, [boot]);

  // A single timeout to the next local midnight, so Home and History roll over to the new day/month
  // even if the tab stays open. No polling.
  useEffect(() => {
    let id;
    const arm = () => {
      const n = new Date();
      const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 1).getTime();
      id = setTimeout(() => { setTick((t) => t + 1); arm(); }, Math.max(1000, next - Date.now()));
    };
    arm();
    return () => clearTimeout(id);
  }, []);

  // Re-read from IndexedDB whenever the app becomes visible again (and when another tab writes).
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') { reload(); setTick((t) => t + 1); } };
    document.addEventListener('visibilitychange', on);
    window.addEventListener('focus', on);
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('study-time-tracker');
      channel.current.onmessage = () => reload();
    }
    return () => {
      document.removeEventListener('visibilitychange', on);
      window.removeEventListener('focus', on);
      channel.current?.close();
    };
  }, [reload]);

  const settings = useMemo(() => ({
    theme: state.data?.settings?.theme ?? document.documentElement.dataset.theme ?? 'light',
    timeFormat: state.data?.settings?.timeFormat ?? defaultTimeFormat(),
    lastExportAt: state.data?.settings?.lastExportAt ?? null,
  }), [state.data]);

  setTimeFormat(settings.timeFormat);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    try { localStorage.setItem('stt-theme', settings.theme); } catch { /* optional preference only */ }
  }, [settings.theme]);

  const showToast = useCallback((text, kind = 'ok') => setToast({ id: Math.random(), text, kind }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 10000 : 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Runs a write. Success is only reported after the write was committed and verified.
  const act = useCallback(async (fn, { ok, inline } = {}) => {
    try {
      const res = await fn();
      await reload();
      channel.current?.postMessage('changed');
      if (ok) showToast(ok);
      return { ok: true, res };
    } catch (error) {
      const message = error?.message || 'Something went wrong. Nothing was changed.';
      if (!inline) showToast(message, 'error');
      return { ok: false, error, message };
    }
  }, [reload, showToast]);

  const today = useMemo(() => dayKeyOf(Date.now()), [tick, state.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const derived = useMemo(() => (state.data ? derive(state.data, today) : null), [state.data, today]);

  const value = { ...state, data: state.data, derived, today, settings, act, reload, boot, toast, showToast, dismissToast: () => setToast(null), lastCycle, setLastCycle };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
