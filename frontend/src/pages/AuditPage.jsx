import { useApp } from '../context/AppContext';

export default function AuditPage() {
  const { audit } = useApp();

  return (
    <section className="panel p-4">
      <h3 className="mb-3 text-base font-semibold text-[#efefef]">Audit Trail</h3>
      <div className="grid max-h-[72vh] gap-2 overflow-auto pr-1">
        {audit.length === 0 && <p className="text-sm text-[#a8a8a8]">No audit events.</p>}
        {audit.map((e) => (
          <article key={e.id} className="rounded-xl border border-[#3f3f3f] bg-[#2b2b2b] p-3">
            <p className="font-medium text-[#f1f1f1]">
              {e.action} {e.entity_type}
            </p>
            <p className="text-xs text-[#a8a8a8]">{e.created_at}</p>
            <p className="text-xs text-[#a8a8a8]">entity: {e.entity_id} | user: {e.user_id}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
