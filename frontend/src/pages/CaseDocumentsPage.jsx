import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function CaseDocumentsPage() {
  const { caseId } = useParams();
  const { getCaseById, loadCaseDocuments, setError } = useApp();
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState('');

  const caseItem = getCaseById(caseId);

  useEffect(() => {
    if (!caseId) return;
    loadCaseDocuments(caseId)
      .then(setDocuments)
      .catch((err) => setError(err.message));
  }, [caseId, loadCaseDocuments, setError]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((doc) => [doc.title, doc.doc_type].join(' ').toLowerCase().includes(q));
  }, [documents, query]);

  return (
    <section className="space-y-4">
      <div className="panel flex items-center justify-between px-5 py-4">
        <div>
          <h2 className="text-2xl font-semibold text-[#f4f6fb]">Documents</h2>
          <p className="text-sm text-[#96a1b1]">{caseItem?.name || 'Case'} • {documents.length} files</p>
        </div>
        <Link className="btn" to={`/cases/${caseId}`}>
          Back to case
        </Link>
      </div>

      <div className="panel p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-2.5 text-[#778297]" size={14} />
          <input
            className="input pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents"
          />
        </div>
      </div>

      <div className="panel p-2">
        <div className="max-h-[calc(100vh-310px)] overflow-auto">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-b border-[#232a34] text-left text-xs uppercase tracking-wide text-[#8e98a8]">
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Open</th>
              </tr>
            </thead>
            <tbody>
              {!filtered.length && (
                <tr>
                  <td className="px-3 py-6 text-sm text-[#8f98a8]" colSpan={4}>
                    No documents found.
                  </td>
                </tr>
              )}
              {filtered.map((doc) => (
                <tr key={doc.id} className="border-b border-[#1b212a] text-sm text-[#e5eaf2]">
                  <td className="truncate px-3 py-2">{doc.title}</td>
                  <td className="px-3 py-2 capitalize text-[#a5afbf]">{doc.doc_type || 'document'}</td>
                  <td className="px-3 py-2 text-[#a5afbf]">{(doc.size_bytes || 0).toLocaleString()} bytes</td>
                  <td className="px-3 py-2">
                    {doc.file_url ? (
                      <a className="text-[#99c9ff] hover:underline" href={doc.file_url} rel="noreferrer" target="_blank">
                        Open
                      </a>
                    ) : (
                      <span className="text-[#6f7785]">Unavailable</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
