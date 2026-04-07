import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Clock3,
  Download,
  FileText,
  Globe,
  Loader2,
  MessageSquarePlus,
  PlayCircle,
  SendHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import SearchableMultiSelect from '../components/SearchableMultiSelect';
import ListboxSelect from '../components/ui/ListboxSelect';

function isCaseChat(chat, caseId) {
  return chat.case_id === caseId;
}

export default function CaseWorkspacePage() {
  const { caseId } = useParams();
  const {
    chats,
    contacts,
    getCaseById,
    getContactsForCase,
    getCaseContactIds,
    setContactsForCase,
    setActiveCaseId,
    activeChatId,
    setActiveChatId,
    startNewChat,
    deleteChat,
    loadMessages,
    sendMessage,
    loadCaseDocuments,
    uploadCaseDocument,
    updateCase,
    generateSummary,
    runCaseProcessing,
    listCaseJobs,
    listCaseArtifacts,
    buildCaseBundle,
    setError,
  } = useApp();

  const caseItem = getCaseById(caseId);
  const [activeTab, setActiveTab] = useState('documents');
  const [documents, setDocuments] = useState([]);
  const [generatedDocuments, setGeneratedDocuments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [docForm, setDocForm] = useState({ title: '', docType: 'evidence', file: null });
  const [uploading, setUploading] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [autoSummaryCaseId, setAutoSummaryCaseId] = useState('');
  const [processing, setProcessing] = useState(false);
  const [buildingBundle, setBuildingBundle] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({ forum: '', stage: '', parties: '' });

  const linkedContacts = useMemo(() => getContactsForCase(caseId), [getContactsForCase, caseId]);
  const linkedContactIds = useMemo(() => getCaseContactIds(caseId), [getCaseContactIds, caseId]);
  const caseChats = useMemo(() => chats.filter((chat) => isCaseChat(chat, caseId)), [chats, caseId]);
  const selectedCaseChat = useMemo(
    () => caseChats.find((chat) => chat.id === activeChatId) || caseChats[0] || null,
    [caseChats, activeChatId],
  );
  const latestJob = jobs[0] || null;
  const docTypeOptions = useMemo(
    () => [
      { value: 'notice', label: 'Notice' },
      { value: 'evidence', label: 'Evidence' },
      { value: 'order', label: 'Order' },
      { value: 'correspondence', label: 'Correspondence' },
    ],
    [],
  );
  const chatOptions = useMemo(
    () => caseChats.map((chat, index) => ({ value: chat.id, label: chat.title || `Chat ${index + 1}` })),
    [caseChats],
  );

  const refreshCaseData = async () => {
    if (!caseId) return;
    const [docs, jobRows, artifactRows] = await Promise.all([
      loadCaseDocuments(caseId),
      listCaseJobs(caseId),
      listCaseArtifacts(caseId),
    ]);
    setDocuments(docs);
    setJobs(jobRows);
    setGeneratedDocuments(artifactRows);
  };

  useEffect(() => {
    if (!caseId) return;
    setActiveCaseId(caseId);
  }, [caseId, setActiveCaseId]);

  useEffect(() => {
    if (!caseItem) return;
    setSummaryDraft(caseItem.summary || '');
    setDetailsForm({
      forum: caseItem.forum || '',
      stage: caseItem.stage || '',
      parties: caseItem.parties || '',
    });
  }, [caseItem]);

  useEffect(() => {
    refreshCaseData().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  useEffect(() => {
    if (!latestJob) return;
    if (!['queued', 'running'].includes(latestJob.status)) return;
    const timer = setInterval(() => {
      refreshCaseData().catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestJob?.id, latestJob?.status]);

  useEffect(() => {
    if (!caseItem || autoSummaryCaseId === caseItem.id) return;
    if ((caseItem.summary || '').trim()) return;
    if (!documents.length) return;
    setAutoSummaryCaseId(caseItem.id);
    setGeneratingSummary(true);
    generateSummary(caseItem, documents, linkedContacts)
      .then((summary) => setSummaryDraft(summary))
      .catch((err) => {
        setAutoSummaryCaseId('');
        setError(err.message);
      })
      .finally(() => setGeneratingSummary(false));
  }, [caseItem, documents, linkedContacts, generateSummary, setError, autoSummaryCaseId]);

  useEffect(() => {
    if (!caseId) return;
    const selected = chats.find((chat) => chat.id === activeChatId);
    if (selected && isCaseChat(selected, caseId)) return;
    if (caseChats[0]) {
      setActiveChatId(caseChats[0].id);
    } else {
      setActiveChatId('');
      setMessages([]);
    }
  }, [caseId, chats, caseChats, activeChatId, setActiveChatId]);

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    loadMessages(activeChatId)
      .then(setMessages)
      .catch((err) => setError(err.message));
  }, [activeChatId, loadMessages, setError]);

  if (!caseItem) {
    return (
      <section className="center-empty h-full rounded-xl border border-[#202730] bg-[#10151c]">
        <p className="text-sm text-[#99a4b4]">Case not found.</p>
      </section>
    );
  }

  const onUploadDocument = async (e) => {
    e.preventDefault();
    if (!docForm.file || !docForm.title.trim()) return;
    setUploading(true);
    try {
      await uploadCaseDocument(caseId, {
        title: docForm.title.trim(),
        docType: docForm.docType,
        file: docForm.file,
      });
      setDocForm({ title: '', docType: 'evidence', file: null });
      await refreshCaseData();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const onRunProcessing = async () => {
    setProcessing(true);
    try {
      await runCaseProcessing(caseId, false);
      await refreshCaseData();
      setActiveTab('generated');
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const onBuildBundle = async () => {
    setBuildingBundle(true);
    try {
      const result = await buildCaseBundle(caseId);
      if (result?.url) {
        window.open(result.url, '_blank', 'noopener,noreferrer');
      }
      await refreshCaseData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBuildingBundle(false);
    }
  };

  const onSendChat = async (e) => {
    e.preventDefault();
    if (!activeChatId || !chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput('');
    const optimistic = [...messages, { id: `tmp-${Date.now()}`, role: 'user', content: text }];
    setMessages(optimistic);
    setChatLoading(true);
    try {
      await sendMessage({
        chatId: activeChatId,
        message: text,
        useWebSearch,
        contextPrompt: [
          `Case: ${caseItem.name}`,
          `Forum: ${caseItem.forum || 'Not set'}`,
          `Stage: ${caseItem.stage || 'Not set'}`,
          `Parties: ${caseItem.parties || 'Not set'}`,
          `Summary: ${summaryDraft || 'Not set'}`,
          `Documents: ${documents.map((doc) => `${doc.title} (${doc.doc_type || 'document'})`).join('; ') || 'None'}`,
        ].join('\n'),
      });
      const latest = await loadMessages(activeChatId);
      setMessages(latest);
    } catch (err) {
      setError(err.message);
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const onCreateCaseChat = async () => {
    try {
      const created = await startNewChat(caseId);
      setActiveChatId(created.id);
      const latest = await loadMessages(created.id);
      setMessages(latest);
    } catch (err) {
      setError(err.message);
    }
  };

  const onDeleteCaseChat = async () => {
    if (!activeChatId) return;
    const fallback = caseChats.find((chat) => chat.id !== activeChatId) || null;
    try {
      await deleteChat(activeChatId);
      if (fallback) {
        setActiveChatId(fallback.id);
        const latest = await loadMessages(fallback.id);
        setMessages(latest);
        return;
      }
      setActiveChatId('');
      setMessages([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const onGenerateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const summary = await generateSummary(caseItem, documents, linkedContacts);
      setSummaryDraft(summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingSummary(false);
    }
  };

  const onSaveSummary = async () => {
    try {
      await updateCase(caseItem.id, { summary: summaryDraft });
      await refreshCaseData();
    } catch (err) {
      setError(err.message);
    }
  };

  const onSaveDetails = async () => {
    setSavingDetails(true);
    try {
      await updateCase(caseItem.id, detailsForm);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingDetails(false);
    }
  };

  const onChangeLinkedContacts = async (next) => {
    try {
      await setContactsForCase(caseId, next);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-5">
      <div className="panel px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[34px] font-semibold leading-none text-[#f4f7fc]">{caseItem.name}</h2>
              {caseItem.stage ? <span className="chip">{caseItem.stage}</span> : null}
            </div>
            <p className="mt-2 truncate text-sm text-[#9aa6b7]">
              {caseItem.forum || 'Forum not set'}
              {caseItem.parties ? ` • ${caseItem.parties}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="chip">{documents.length} documents</span>
              <span className="chip">{linkedContacts.length} contacts</span>
              <span className="chip">{caseChats.length} chats</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn" to={`/cases/${caseId}/documents`}>
              Documents view
            </Link>
            <button className="btn" type="button" onClick={onRunProcessing} disabled={processing}>
              {processing ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
              Generate documents
            </button>
            <button className="btn" type="button" onClick={onBuildBundle} disabled={buildingBundle}>
              {buildingBundle ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Bundle
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="panel flex min-h-0 flex-col p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[#9faabd]" />
              <h3 className="text-sm font-semibold tracking-wide text-[#f0f4fa]">Case summary</h3>
            </div>

            <div className="flex items-center gap-2">
              <button className="btn" onClick={onGenerateSummary} type="button" disabled={generatingSummary}>
                {generatingSummary ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    Generating
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Generate
                  </>
                )}
              </button>
              <button className="btn btn-primary" type="button" onClick={onSaveSummary}>
                Save
              </button>
            </div>
          </div>

          <textarea
            className="input min-h-[340px] flex-1 resize-none"
            value={summaryDraft}
            onChange={(e) => setSummaryDraft(e.target.value)}
            placeholder="Generate or write a concise case summary."
          />

          <div className="mt-5 rounded-xl bg-[#141a23] px-4 py-3">
            <div className="mb-1 flex items-center gap-2">
              <Clock3 size={14} className="text-[#95a2b6]" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#9aa6b7]">Processing status</p>
            </div>
            {latestJob ? (
              <p className="text-sm text-[#d5deea]">
                {latestJob.status}
                {latestJob.error_message ? ` • ${latestJob.error_message}` : ''}
              </p>
            ) : (
              <p className="text-sm text-[#97a3b5]">No jobs yet.</p>
            )}
          </div>
        </div>

        <div className="panel flex min-h-0 flex-col p-5">
          <div className="tab-strip w-fit">
            <button className={`tab-btn ${activeTab === 'documents' ? 'tab-btn-active' : ''}`} type="button" onClick={() => setActiveTab('documents')}>Documents</button>
            <button className={`tab-btn ${activeTab === 'contacts' ? 'tab-btn-active' : ''}`} type="button" onClick={() => setActiveTab('contacts')}>Contacts</button>
            <button className={`tab-btn ${activeTab === 'details' ? 'tab-btn-active' : ''}`} type="button" onClick={() => setActiveTab('details')}>Details</button>
            <button className={`tab-btn ${activeTab === 'generated' ? 'tab-btn-active' : ''}`} type="button" onClick={() => setActiveTab('generated')}>Generated</button>
          </div>

          <div className="mt-5 min-h-0 flex-1 overflow-auto pr-1">
            {activeTab === 'documents' && (
              <div className="space-y-5">
                <form className="grid gap-3" onSubmit={onUploadDocument}>
                  <input className="input" placeholder="Document title" value={docForm.title} onChange={(e) => setDocForm((prev) => ({ ...prev, title: e.target.value }))} />
                  <div className="grid gap-2 md:grid-cols-2">
                    <ListboxSelect
                      value={docForm.docType}
                      onChange={(next) => setDocForm((prev) => ({ ...prev, docType: next }))}
                      options={docTypeOptions}
                    />
                    <input className="input" type="file" onChange={(e) => setDocForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))} />
                  </div>
                  <button className="btn btn-primary justify-center" disabled={uploading || !docForm.file || !docForm.title.trim()} type="submit">
                    <Upload size={14} />
                    {uploading ? 'Uploading...' : 'Upload document'}
                  </button>
                </form>

                <div className="space-y-2">
                  {!documents.length && <p className="py-6 text-sm text-[#8f9aac]">No documents uploaded.</p>}
                  {documents.map((doc) => (
                    <a key={doc.id} className="block rounded-xl border border-[#2a313d] bg-[#141a23] px-3 py-3 hover:bg-[#19202b]" href={doc.file_url || '#'} target="_blank" rel="noreferrer">
                      <p className="text-sm font-medium text-[#edf2fb]">{doc.title}</p>
                      <p className="text-xs text-[#9aa5b6]">{doc.doc_type || 'document'} • {(doc.size_bytes || 0).toLocaleString()} bytes</p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'contacts' && (
              <div className="space-y-5">
                <div>
                  <label className="label mb-1.5 block">Attach contacts</label>
                  <SearchableMultiSelect
                    options={contacts}
                    selectedIds={linkedContactIds}
                    onChange={onChangeLinkedContacts}
                    placeholder="Search and add contacts"
                    searchPlaceholder="Search contacts"
                    emptyText="No contacts found"
                  />
                </div>

                <div className="space-y-2">
                  {!linkedContacts.length && <p className="py-4 text-sm text-[#8f9aac]">No contacts linked.</p>}
                  {linkedContacts.map((contact) => (
                    <div key={contact.id} className="rounded-xl border border-[#2a313d] bg-[#141a23] px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Users size={14} className="text-[#95a2b4]" />
                        <p className="text-sm font-medium text-[#eff4fc]">{contact.name}</p>
                      </div>
                      <p className="mt-1 text-xs text-[#99a4b4]">{contact.email || 'No email'} • {contact.phone || 'No phone'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'details' && (
              <div className="space-y-3">
                <div>
                  <label className="label mb-1.5 block">Forum</label>
                  <input className="input" value={detailsForm.forum} onChange={(e) => setDetailsForm((prev) => ({ ...prev, forum: e.target.value }))} placeholder="ITAT / GST / NFAC" />
                </div>
                <div>
                  <label className="label mb-1.5 block">Stage</label>
                  <input className="input" value={detailsForm.stage} onChange={(e) => setDetailsForm((prev) => ({ ...prev, stage: e.target.value }))} placeholder="Notice / Appeal / Hearing" />
                </div>
                <div>
                  <label className="label mb-1.5 block">Parties</label>
                  <textarea className="input min-h-24" value={detailsForm.parties} onChange={(e) => setDetailsForm((prev) => ({ ...prev, parties: e.target.value }))} placeholder="Assessee vs Department" />
                </div>
                <div className="flex justify-end">
                  <button className="btn btn-primary" type="button" onClick={onSaveDetails} disabled={savingDetails}>
                    {savingDetails ? 'Saving...' : 'Save details'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'generated' && (
              <div className="space-y-3">
                {!generatedDocuments.length && <p className="py-6 text-sm text-[#8f9aac]">Generate documents to populate this section.</p>}
                {generatedDocuments.map((doc) => (
                  <div key={doc.id} className="rounded-xl border border-[#2a313d] bg-[#141a23] px-3 py-3">
                    <p className="text-sm font-medium text-[#f0f5fc]">{doc.title} (v{doc.version || 1})</p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-[#a1acbc]">{doc.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold tracking-wide text-[#f2f6fb]">Case chat</h3>
          <div className="flex items-center gap-2">
            <ListboxSelect
              className="w-[220px]"
              value={selectedCaseChat?.id || ''}
              onChange={(next) => setActiveChatId(next)}
              options={chatOptions}
              placeholder="No case chats"
              disabled={!chatOptions.length}
            />
            <button className="icon-btn" type="button" title="New chat" onClick={onCreateCaseChat}>
              <MessageSquarePlus size={14} />
            </button>
            <button className="icon-btn icon-danger" type="button" title="Delete selected chat" onClick={onDeleteCaseChat} disabled={!activeChatId}>
              <Trash2 size={14} />
            </button>
            <button className={`chip ${useWebSearch ? 'chip-active' : ''}`} type="button" onClick={() => setUseWebSearch((prev) => !prev)}>
              <Globe size={13} />
              Web
            </button>
          </div>
        </div>

        <div className="chat-dock-messages min-h-[88px]">
          {!messages.length && !chatLoading && (
            <p className="text-sm text-[#8f9aac]">
              {activeChatId ? 'Ask about this case.' : 'Create a case chat with the + button.'}
            </p>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`chat-row ${message.role === 'user' ? 'chat-row-user' : ''}`}>
              <div className={`chat-bubble ${message.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>{message.content}</div>
            </div>
          ))}
          {chatLoading && (
            <div className="chat-row">
              <div className="chat-bubble chat-bubble-ai inline-flex items-center gap-2">
                <Loader2 className="animate-spin" size={14} />
                Thinking...
              </div>
            </div>
          )}
        </div>

        <form className="chat-dock-compose" onSubmit={onSendChat}>
          <input className="input" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask questions, draft arguments, or summarize evidence" />
          <button className="btn btn-primary" type="submit" disabled={!activeChatId || !chatInput.trim() || chatLoading}>
            <SendHorizontal size={14} />
            Send
          </button>
        </form>
      </div>
    </section>
  );
}
