import { useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';

const init = {
  title: '',
  forum: '',
  parties: '',
  ay_fy_period: '',
  sections: '',
  counsel: '',
  stage: '',
  internal_owner: '',
};

export default function MattersPage() {
  const { userId, matters, setActiveMatterId, activeMatterId, loadMatters, setError } = useApp();
  const [form, setForm] = useState(init);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const created = await api.createMatter(userId, form);
      await loadMatters();
      setActiveMatterId(created.id);
      setForm(init);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
      <section className="panel p-4">
        <h3 className="mb-3 text-base font-semibold text-[#efefef]">Cases</h3>
        <div className="grid max-h-[68vh] gap-2 overflow-auto pr-1">
          {matters.length === 0 && <p className="text-sm text-[#a7a7a7]">No cases found.</p>}
          {matters.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => setActiveMatterId(m.id)}
              className={`rounded-xl border p-3 text-left ${
                activeMatterId === m.id ? 'border-[#5a5a5a] bg-[#323232]' : 'border-[#3f3f3f] bg-[#2b2b2b] hover:bg-[#313131]'
              }`}
            >
              <p className="font-medium text-[#f0f0f0]">{m.title}</p>
              <p className="text-xs text-[#b0b0b0]">{m.forum} | {m.parties}</p>
              <p className="text-xs text-[#8f8f8f]">#{m.id}</p>
            </button>
          ))}
        </div>
      </section>

      <form className="panel space-y-3 p-4" onSubmit={onSubmit}>
        <h3 className="text-base font-semibold text-[#efefef]">Create Case</h3>
        <input className="input" placeholder="Case title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input className="input" placeholder="Forum" required value={form.forum} onChange={(e) => setForm({ ...form, forum: e.target.value })} />
        <input className="input" placeholder="Parties" required value={form.parties} onChange={(e) => setForm({ ...form, parties: e.target.value })} />
        <input className="input" placeholder="AY/FY/Period" value={form.ay_fy_period} onChange={(e) => setForm({ ...form, ay_fy_period: e.target.value })} />
        <input className="input" placeholder="Sections" value={form.sections} onChange={(e) => setForm({ ...form, sections: e.target.value })} />
        <input className="input" placeholder="Counsel" value={form.counsel} onChange={(e) => setForm({ ...form, counsel: e.target.value })} />
        <input className="input" placeholder="Stage" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} />
        <input className="input" placeholder="Internal owner" value={form.internal_owner} onChange={(e) => setForm({ ...form, internal_owner: e.target.value })} />
        <button className="btn btn-primary w-full justify-center" type="submit" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Case'}
        </button>
      </form>
    </div>
  );
}
