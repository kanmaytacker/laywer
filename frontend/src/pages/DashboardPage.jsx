import { useNavigate } from 'react-router-dom';
import StatCard from '../components/StatCard';
import { useApp } from '../context/AppContext';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { matters, documents, artifacts, insights, setActiveMatterId } = useApp();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Matters" value={matters.length} tone="amber" />
        <StatCard title="Documents" value={documents.length} tone="teal" />
        <StatCard title="Artifacts" value={artifacts.length} tone="indigo" />
        <StatCard title="Keywords" value={(insights.keywords || []).slice(0, 3).join(', ') || '-'} tone="slate" />
      </div>

      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg text-slateblue">Recent Matters</h3>
          <button className="btn" onClick={() => navigate('/matters')} type="button">
            Open Matters
          </button>
        </div>
        <div className="grid gap-2">
          {matters.length === 0 && <p className="text-sm text-slate-500">No matters yet.</p>}
          {matters.slice(0, 8).map((m) => (
            <button
              key={m.id}
              type="button"
              className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-tide/60"
              onClick={() => {
                setActiveMatterId(m.id);
                navigate('/documents');
              }}
            >
              <p className="font-semibold text-slate-800">{m.title}</p>
              <p className="text-xs text-slate-500">{m.forum} | {m.stage || 'stage n/a'} | #{m.id}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
