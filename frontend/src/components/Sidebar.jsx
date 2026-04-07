import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderPlus,
  MessageSquare,
  MessageSquarePlus,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Modal from './Modal';
import SearchableMultiSelect from './SearchableMultiSelect';

const initialCaseForm = {
  name: '',
  summary: '',
  contactIds: [],
};

const initialContactForm = {
  name: '',
  email: '',
  phone: '',
  notes: '',
};

export default function Sidebar({ collapsed = false, onToggle }) {
  const navigate = useNavigate();
  const {
    configured,
    cases,
    chats,
    contacts,
    activeCaseId,
    activeChatId,
    setActiveCaseId,
    setActiveChatId,
    startNewChat,
    deleteChat,
    createCase,
    createContact,
    setError,
  } = useApp();

  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [caseForm, setCaseForm] = useState(initialCaseForm);
  const [contactForm, setContactForm] = useState(initialContactForm);
  const [submittingCase, setSubmittingCase] = useState(false);
  const [submittingContact, setSubmittingContact] = useState(false);

  const onBrandHome = () => {
    setActiveCaseId('');
    navigate('/chat');
  };

  const onNewChat = async () => {
    try {
      const chat = await startNewChat(null);
      setActiveCaseId('');
      setActiveChatId(chat.id);
      navigate('/chat');
    } catch (err) {
      setError(err.message);
    }
  };

  const onCreateCase = async (e) => {
    e.preventDefault();
    if (!caseForm.name.trim()) return;
    setSubmittingCase(true);
    try {
      const created = await createCase(caseForm);
      setCaseModalOpen(false);
      setCaseForm(initialCaseForm);
      setActiveCaseId(created.id);
      setActiveChatId('');
      navigate(`/cases/${created.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingCase(false);
    }
  };

  const onCreateContact = async (e) => {
    e.preventDefault();
    setSubmittingContact(true);
    try {
      await createContact(contactForm);
      setContactModalOpen(false);
      setContactForm(initialContactForm);
      navigate('/contacts');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingContact(false);
    }
  };

  return (
    <aside className="sidebar-shell">
      <div className="sidebar-top">
        <button className={`brand ${collapsed ? 'brand-collapsed' : ''}`} onClick={onBrandHome} type="button">
          <span className="brand-mark">C</span>
          {!collapsed && (
            <span>
              <p className="brand-title">CaseDesk</p>
              <p className="brand-subtitle">Cases, contacts, chats</p>
            </span>
          )}
        </button>
        <button className="icon-btn" onClick={onToggle} type="button" title="Toggle sidebar">
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      <div className="sidebar-actions">
        <button className="sidebar-action-btn" onClick={onNewChat} type="button" title="New chat">
          <MessageSquarePlus size={14} />
          {!collapsed && 'New chat'}
        </button>
        <button className="sidebar-action-btn" onClick={() => setCaseModalOpen(true)} type="button" title="New case">
          <FolderPlus size={14} />
          {!collapsed && 'New case'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="sidebar-group">
            <p className="sidebar-label">Cases</p>
            <div className="sidebar-list sidebar-scroll-sm">
              {cases.length === 0 && <p className="sidebar-empty">No cases yet</p>}
              {cases.map((caseItem) => (
                <button
                  key={caseItem.id}
                  className={`sidebar-row ${activeCaseId === caseItem.id ? 'sidebar-row-active' : ''}`}
                  type="button"
                  onClick={() => {
                    setActiveCaseId(caseItem.id);
                    navigate(`/cases/${caseItem.id}`);
                  }}
                >
                  <Folder size={14} />
                  <span className="truncate">{caseItem.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="sidebar-group">
            <p className="sidebar-label">Contacts</p>
            <div className="sidebar-list">
              <button className="sidebar-row" type="button" onClick={() => navigate('/contacts')}>
                <Users size={14} />
                <span>Browse contacts</span>
              </button>
              <button className="sidebar-row" type="button" onClick={() => setContactModalOpen(true)}>
                <Plus size={14} />
                <span>New contact</span>
              </button>
            </div>
          </div>

          <div className="sidebar-group sidebar-grow">
            <p className="sidebar-label">Chats</p>
            <div className="sidebar-list sidebar-scroll">
              {chats.length === 0 && <p className="sidebar-empty">No chats yet</p>}
              {chats.map((chat) => (
                <div key={chat.id} className="sidebar-chat-row">
                  <button
                    className={`sidebar-row ${activeChatId === chat.id ? 'sidebar-row-active' : ''}`}
                    type="button"
                    onClick={() => {
                      setActiveChatId(chat.id);
                      if (chat.case_id) {
                        setActiveCaseId(chat.case_id);
                        navigate(`/cases/${chat.case_id}`);
                      } else {
                        setActiveCaseId('');
                        navigate('/chat');
                      }
                    }}
                  >
                    <MessageSquare size={14} />
                    <span className="truncate">{chat.title || 'Chat'}</span>
                  </button>
                  <button
                    className="icon-btn icon-danger"
                    type="button"
                    title="Delete chat"
                    onClick={() => deleteChat(chat.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {collapsed && (
        <div className="collapsed-list">
          <button className="icon-btn" onClick={() => navigate('/contacts')} type="button" title="Contacts">
            <Users size={15} />
          </button>
          <button className="icon-btn" onClick={() => setCaseModalOpen(true)} type="button" title="New case">
            <FolderPlus size={15} />
          </button>
          <button className="icon-btn" onClick={() => setContactModalOpen(true)} type="button" title="New contact">
            <Plus size={15} />
          </button>
        </div>
      )}

      <Modal open={caseModalOpen} title="Create case" onClose={() => setCaseModalOpen(false)} width="max-w-2xl">
        <form className="grid gap-4" onSubmit={onCreateCase}>
          {!configured && (
            <p className="rounded-lg border border-[#4a2f2f] bg-[#2a1a1a] px-3 py-2 text-xs text-[#f7b4b4]">
              Supabase env vars are missing. Set frontend env before creating records.
            </p>
          )}
          <div className="grid gap-4">
            <div>
              <label className="label mb-1.5 block">Case name</label>
              <input
                className="input"
                required
                placeholder="Ex: GST Reply for AY 2023-24"
                value={caseForm.name}
                onChange={(e) => setCaseForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="label mb-1.5 block">Initial summary</label>
              <textarea
                className="input min-h-28"
                placeholder="Short context to start with"
                value={caseForm.summary}
                onChange={(e) => setCaseForm((prev) => ({ ...prev, summary: e.target.value }))}
              />
            </div>
            <div>
              <label className="label mb-1.5 block">Contacts</label>
              <SearchableMultiSelect
                options={contacts}
                selectedIds={caseForm.contactIds}
                onChange={(contactIds) => setCaseForm((prev) => ({ ...prev, contactIds }))}
                placeholder="Search and select contacts"
                searchPlaceholder="Search contacts"
                emptyText="No contacts found"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button className="btn btn-primary" disabled={submittingCase || !caseForm.name.trim()} type="submit">
              {submittingCase ? 'Creating...' : 'Create and open case'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={contactModalOpen} title="Create contact" onClose={() => setContactModalOpen(false)} width="max-w-lg">
        <form className="grid gap-3" onSubmit={onCreateContact}>
          <div>
            <label className="label mb-1.5 block">Name</label>
            <input
              className="input"
              placeholder="Contact name"
              required
              value={contactForm.name}
              onChange={(e) => setContactForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="label mb-1.5 block">Email</label>
            <input
              className="input"
              placeholder="name@example.com"
              value={contactForm.email}
              onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="label mb-1.5 block">Phone</label>
            <input
              className="input"
              placeholder="+91..."
              value={contactForm.phone}
              onChange={(e) => setContactForm((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>
          <div>
            <label className="label mb-1.5 block">Notes</label>
            <textarea
              className="input min-h-20"
              placeholder="Optional notes"
              value={contactForm.notes}
              onChange={(e) => setContactForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end">
            <button className="btn btn-primary" disabled={submittingContact || !contactForm.name.trim()} type="submit">
              {submittingContact ? 'Saving...' : 'Save contact'}
            </button>
          </div>
        </form>
      </Modal>
    </aside>
  );
}
