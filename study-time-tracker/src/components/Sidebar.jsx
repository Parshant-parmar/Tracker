import { Link } from '../router.jsx';

const I = (d) => (
  <svg className="nav-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{d}</svg>
);
const ICONS = {
  home: I(<><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10v9h12v-9" /></>),
  history: I(<><circle cx="12" cy="12" r="8" /><path d="M12 8v4.2l2.8 1.8" /></>),
  stats: I(<><path d="M5 7h14" /><path d="M5 12h10" /><path d="M5 17h6" /></>),
  monthly: I(<><rect x="4" y="6" width="16" height="14" rx="3" /><path d="M8 4v4M16 4v4M4 11h16" /></>),
  exam: I(<><path d="M6 4h9l3 3v13H6z" /><path d="M9 11h6M9 15h6" /></>),
  settings: I(<><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></>),
};

const MAIN = [
  { id: 'home', to: '', label: 'Home' },
  { id: 'history', to: 'history', label: 'History' },
  { id: 'stats', to: 'stats', label: 'Statistics' },
  { id: 'monthly', to: 'monthly', label: 'Monthly' },
  { id: 'exam', to: 'exam', label: 'Exam Mode' },
];

// Which nav item a route belongs to (so a Day Report highlights History, a 7-day report Statistics, etc.)
export function activeIdFor(route) {
  const name = route.split('/')[0];
  switch (name) {
    case 'history': case 'day': return 'history';
    case 'stats': case 'cycle': return 'stats';
    case 'monthly': case 'month': return 'monthly';
    case 'exam': return 'exam';
    case 'settings': return 'settings';
    default: return 'home';
  }
}

export default function Sidebar({ route }) {
  const active = activeIdFor(route);
  const item = (n) => (
    <Link key={n.id} to={n.to} className={`nav-item${active === n.id ? ' active' : ''}`} aria-current={active === n.id ? 'page' : undefined}>
      {ICONS[n.id]}<span>{n.label}</span>
    </Link>
  );
  return (
    <aside className="sidebar">
      <p className="brand">Tracker</p>
      <nav className="nav" aria-label="Main">
        {MAIN.map(item)}
        <span className="nav-spacer" />
        {item({ id: 'settings', to: 'settings', label: 'Settings' })}
      </nav>
    </aside>
  );
}
