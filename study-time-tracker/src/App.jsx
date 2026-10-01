import { StoreProvider, useStore } from './store.jsx';
import { useHashRoute } from './router.jsx';
import { Button, Page } from './ui.jsx';
import Home from './screens/Home.jsx';
import History from './screens/History.jsx';
import DayView from './screens/DayView.jsx';
import Stats from './screens/Stats.jsx';
import CycleReport from './screens/CycleReport.jsx';
import MonthReport from './screens/MonthReport.jsx';
import Exam from './screens/Exam.jsx';
import Settings from './screens/Settings.jsx';
import { isValidKey } from './lib/time.js';

function Toast() {
  const { toast, dismissToast } = useStore();
  if (!toast) return <div className="toast-region" aria-live="polite" />;
  const err = toast.kind === 'error';
  return (
    <div className="toast-region" aria-live={err ? 'assertive' : 'polite'}>
      <div key={toast.id} className={`toast${err ? ' toast-error' : ''}`} role={err ? 'alert' : 'status'}>
        <span>{toast.text}</span>
        {err && <button className="toast-close" onClick={dismissToast}>Dismiss</button>}
      </div>
    </div>
  );
}

function Routes() {
  const { status, error, boot } = useStore();
  const route = useHashRoute();
  if (status === 'loading') return <main className="page"><p className="subtitle">Opening your study log…</p></main>;
  if (status === 'error') {
    return (
      <Page title="Can’t open saved data">
        <p>The app couldn’t open its local database, so it hasn’t shown or changed anything.</p>
        <p className="hint">{error?.message}</p>
        <p>Private browsing or blocked site data can cause this. Your data has not been touched.</p>
        <Button variant="primary" onClick={boot}>Try again</Button>
      </Page>
    );
  }
  const [name, arg] = route.split('/');
  switch (name) {
    case 'history': return <History />;
    case 'day': return isValidKey(arg) ? <DayView dayKey={arg} /> : <Home />;
    case 'stats': return <Stats />;
    case 'cycle': return <CycleReport id={arg} />;
    case 'month': return <MonthReport monthKey={arg} />;
    case 'exam': return <Exam />;
    case 'settings': return <Settings />;
    default: return <Home />;
  }
}

export default function App() {
  return (
    <StoreProvider>
      <a className="skip" href="#main">Skip to content</a>
      <Routes />
      <Toast />
    </StoreProvider>
  );
}
