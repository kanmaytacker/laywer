import { api } from '../lib/api';
import { useApp } from '../context/AppContext';

export default function ExportsPage() {
  const { activeMatter, artifacts } = useApp();

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="panel space-y-3 p-4">
        <h3 className="text-base font-semibold text-[#efefef]">Filing Bundle PDF</h3>
        <p className="text-sm text-[#a8a8a8]">Export index + drafts + annexures for active case.</p>
        <a
          className={`btn btn-primary w-fit ${!activeMatter ? 'pointer-events-none opacity-50' : ''}`}
          href={activeMatter ? api.bundlePdfUrl(activeMatter.id) : '#'}
          target="_blank"
          rel="noreferrer"
        >
          Download Bundle
        </a>
      </section>

      <section className="panel p-4">
        <h3 className="mb-3 text-base font-semibold text-[#efefef]">Artifact DOCX Exports</h3>
        <div className="grid max-h-[62vh] gap-2 overflow-auto pr-1">
          {artifacts.length === 0 && <p className="text-sm text-[#a8a8a8]">No artifacts available.</p>}
          {artifacts.map((a) => (
            <article key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#3f3f3f] bg-[#2b2b2b] p-3">
              <div>
                <p className="font-medium text-[#f1f1f1]">{a.title}</p>
                <p className="text-xs text-[#a8a8a8]">{a.artifact_type} | v{a.version_number}</p>
              </div>
              <a className="btn" href={api.artifactDocxUrl(a.matter_id, a.id)} target="_blank" rel="noreferrer">
                DOCX
              </a>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
