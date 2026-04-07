import { api } from '../lib/api';
import { useApp } from '../context/AppContext';

const types = [
  ['brief', 'Matter Brief'],
  ['chronology', 'Chronology'],
  ['issues', 'Issue List'],
  ['draft', 'First Draft Response'],
  ['annexure_index', 'Annexure Index'],
];

export default function DraftingPage() {
  const { userId, activeMatter, artifacts, loadActiveMatterData, setError } = useApp();

  const generate = async (type) => {
    if (!activeMatter) return;
    setError('');
    try {
      await api.generateArtifact(userId, activeMatter.id, type);
      await loadActiveMatterData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h3 className="text-base font-semibold text-[#efefef]">Generate Drafting Artifacts</h3>
        <p className="mb-3 text-sm text-[#a8a8a8]">{activeMatter ? `Active: ${activeMatter.title}` : 'Select a case first'}</p>
        <div className="flex flex-wrap gap-2">
          {types.map(([value, label]) => (
            <button key={value} className="btn" type="button" onClick={() => generate(value)} disabled={!activeMatter}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel p-4">
        <h3 className="mb-3 text-base font-semibold text-[#efefef]">Artifacts</h3>
        <div className="grid max-h-[62vh] gap-2 overflow-auto pr-1">
          {artifacts.length === 0 && <p className="text-sm text-[#a8a8a8]">No artifacts generated.</p>}
          {artifacts.map((a) => (
            <article key={a.id} className="rounded-xl border border-[#3f3f3f] bg-[#2b2b2b] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-medium text-[#f1f1f1]">{a.title}</p>
                <a className="btn" href={api.artifactDocxUrl(a.matter_id, a.id)} target="_blank" rel="noreferrer">
                  DOCX
                </a>
              </div>
              <p className="text-xs text-[#a8a8a8]">{a.artifact_type} | v{a.version_number}</p>
              <p className="mt-2 text-sm text-[#d0d0d0]">{(a.content || '').slice(0, 280)}...</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
