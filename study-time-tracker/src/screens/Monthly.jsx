import { useStore } from '../store.jsx';
import { Page } from '../ui.jsx';
import MonthReport from './MonthReport.jsx';

// Monthly = historical month summaries. Opens on the newest month that has finished days.
export default function Monthly() {
  const { derived } = useStore();
  const { months } = derived;
  if (months.length === 0) {
    return <Page title="Monthly"><p className="empty">Monthly reports appear after your first finished day.</p></Page>;
  }
  return <MonthReport monthKey={months[0].monthKey} showAll />;
}
