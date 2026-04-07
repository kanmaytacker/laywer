export default function StatCard({ title, value, tone = 'slate' }) {
  const map = {
    slate: 'from-slate-50 to-slate-100 text-slate-700',
    amber: 'from-amber-50 to-amber-100 text-amber-700',
    teal: 'from-teal-50 to-teal-100 text-teal-700',
    indigo: 'from-indigo-50 to-indigo-100 text-indigo-700',
  };

  return (
    <article className={`panel bg-gradient-to-br p-4 ${map[tone] || map.slate}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </article>
  );
}
