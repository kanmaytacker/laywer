import { useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';

export default function DocumentsPage() {
  const { userId, activeMatter, documents, loadActiveMatterData, setError } = useApp();
  const [title, setTitle] = useState('');
  const [tag, setTag] = useState('notice');
  const [file, setFile] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!activeMatter || !file) return;
    setError('');
    try {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('tag', tag);
      fd.append('file', file);
      await api.uploadDocument(userId, activeMatter.id, fd);
      setTitle('');
      setTag('notice');
      setFile(null);
      e.target.reset();
      await loadActiveMatterData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <form className="panel space-y-3 p-4" onSubmit={submit}>
        <h3 className="text-base font-semibold text-[#efefef]">Upload Document</h3>
        <p className="text-sm text-[#a8a8a8]">{activeMatter ? `Active case: ${activeMatter.title}` : 'Select a case first'}</p>
        <input className="input" placeholder="Document title" required value={title} onChange={(e) => setTitle(e.target.value)} disabled={!activeMatter} />
        <select className="input" value={tag} onChange={(e) => setTag(e.target.value)} disabled={!activeMatter}>
          <option value="notice">Notice</option>
          <option value="evidence">Evidence</option>
          <option value="order">Order</option>
          <option value="case-law">Case-law</option>
          <option value="correspondence">Correspondence</option>
        </select>
        <input className="input" type="file" required onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={!activeMatter} />
        <button className="btn btn-primary w-full justify-center" type="submit" disabled={!activeMatter}>
          Upload
        </button>
      </form>

      <section className="panel p-4">
        <h3 className="mb-3 text-base font-semibold text-[#efefef]">Documents</h3>
        <div className="grid max-h-[68vh] gap-2 overflow-auto pr-1">
          {documents.length === 0 && <p className="text-sm text-[#a8a8a8]">No documents available.</p>}
          {documents.map((d) => (
            <article key={d.id} className="rounded-xl border border-[#3f3f3f] bg-[#2b2b2b] p-3">
              <p className="font-medium text-[#f1f1f1]">{d.title}</p>
              <p className="text-xs text-[#a9a9a9]">{d.tag} | {d.doc_type}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
