import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function ContactsPage() {
  const { contacts, getCasesForContact, updateContact, setError } = useApp();
  const [query, setQuery] = useState('');
  const [activeContactId, setActiveContactId] = useState(contacts[0]?.id || '');
  const [saving, setSaving] = useState(false);

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((contact) => [contact.name, contact.email, contact.phone].join(' ').toLowerCase().includes(q));
  }, [contacts, query]);

  const active = useMemo(() => {
    return contacts.find((contact) => contact.id === activeContactId) || filteredContacts[0] || null;
  }, [contacts, activeContactId, filteredContacts]);

  const linkedCases = active ? getCasesForContact(active.id) : [];

  const onUpdateNotes = async (value) => {
    if (!active) return;
    setSaving(true);
    try {
      await updateContact(active.id, { notes: value });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid h-full gap-4 xl:grid-cols-[340px_1fr]">
      <div className="panel p-4">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-[#f3f6fa]">All contacts</h2>
        <input
          className="input mb-3"
          placeholder="Search contacts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-[calc(100vh-260px)] space-y-2 overflow-auto pr-1">
          {!filteredContacts.length && <p className="text-sm text-[#8f98a8]">No contacts found.</p>}
          {filteredContacts.map((contact) => (
            <button
              key={contact.id}
              className={`w-full rounded-lg border px-3 py-2 text-left ${
                active?.id === contact.id
                  ? 'border-[#2e7d5a] bg-[#143024]'
                  : 'border-[#27303d] bg-[#121a24] hover:bg-[#172231]'
              }`}
              type="button"
              onClick={() => setActiveContactId(contact.id)}
            >
              <p className="truncate text-sm font-medium text-[#eef2f8]">{contact.name}</p>
              <p className="truncate text-xs text-[#9aa4b4]">{contact.email || 'No email'} • {contact.phone || 'No phone'}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {!active && (
          <div className="panel center-empty h-full">
            <p className="text-sm text-[#8f98a8]">Select a contact to view details.</p>
          </div>
        )}

        {active && (
          <>
            <div className="panel p-5">
              <h3 className="text-xl font-semibold text-[#f5f7fc]">{active.name}</h3>
              <p className="mt-1 text-sm text-[#9ea8b8]">{active.email || 'No email'} • {active.phone || 'No phone'}</p>
            </div>

            <div className="panel p-5">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold tracking-wide text-[#f2f5fa]">Associated cases</h4>
                <span className="text-xs text-[#8f99aa]">{linkedCases.length} linked</span>
              </div>
              <div className="space-y-2">
                {!linkedCases.length && <p className="text-sm text-[#8f98a8]">No associated cases.</p>}
                {linkedCases.map((caseItem) => (
                  <Link
                    key={caseItem.id}
                    className="block rounded-xl border border-[#27303d] bg-[#121a24] px-3 py-2 text-sm text-[#dde4ef] hover:bg-[#172231]"
                    to={`/cases/${caseItem.id}`}
                  >
                    <p className="font-medium">{caseItem.name}</p>
                    <p className="text-xs text-[#9aa4b4]">{caseItem.forum || 'Forum not set'} • {caseItem.stage || 'Stage not set'}</p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="panel p-5">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold tracking-wide text-[#f2f5fa]">Additional details</h4>
                {saving && <span className="text-xs text-[#93a0b1]">Saving...</span>}
              </div>
              <textarea
                key={active.id}
                className="input min-h-28"
                defaultValue={active.notes || ''}
                placeholder="Optional notes for this contact"
                onBlur={(e) => onUpdateNotes(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
