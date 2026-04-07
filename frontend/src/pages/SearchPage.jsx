import { useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';

export default function SearchPage() {
  const { userId, activeMatter, setError } = useApp();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);

  const run = async (e) => {
    e.preventDefault();
    if (!activeMatter) return;
    setError('');
    try {
      const data = await api.searchMatter(userId, activeMatter.id, q);
      setResults(data.hits || []);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={run} className="panel space-y-3 p-4">
        <h3 className="text-base font-semibold text-[#efefef]">Search Active Case</h3>
        <p className="text-sm text-[#a8a8a8]">{activeMatter ? `Active: ${activeMatter.title}` : 'Select a case first'}</p>
        <div className="flex gap-2">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search phrase" required disabled={!activeMatter} />
          <button className="btn btn-primary" type="submit" disabled={!activeMatter}>
            Search
          </button>
        </div>
      </form>

      <section className="panel p-4">
        <h3 className="mb-3 text-base font-semibold text-[#efefef]">Results</h3>
        <div className="grid max-h-[62vh] gap-2 overflow-auto pr-1">
          {results.length === 0 && <p className="text-sm text-[#a8a8a8]">No results.</p>}
          {results.map((r, idx) => (
            <article key={`${r.document_id}-${idx}`} className="rounded-xl border border-[#3f3f3f] bg-[#2b2b2b] p-3">
              <p className="font-medium text-[#f1f1f1]">{r.document_title}</p>
              <p className="text-xs text-[#a8a8a8]">Version {r.version}</p>
              <p className="mt-2 text-sm text-[#d0d0d0]">{r.snippet}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
