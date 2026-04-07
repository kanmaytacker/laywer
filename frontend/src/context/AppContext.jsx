import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setBackendToken } from '../lib/api';
import { supabaseApi } from '../lib/supabase';

const TOKEN_KEY = 'md_supabase_token_v1';
const ACTIVE_CASE_KEY = 'md_active_case_v1';
const ACTIVE_CHAT_KEY = 'md_active_chat_v1';

const AppContext = createContext(null);

function loadString(key, fallback = '') {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }) {
  const [token, setToken] = useState(() => loadString(TOKEN_KEY, ''));
  const [me, setMe] = useState(null);
  const [cases, setCases] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [caseContacts, setCaseContacts] = useState({});
  const [chats, setChats] = useState([]);
  const [activeCaseId, setActiveCaseId] = useState(() => loadString(ACTIVE_CASE_KEY, ''));
  const [activeChatId, setActiveChatId] = useState(() => loadString(ACTIVE_CHAT_KEY, ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Ensure API module has the token before child pages issue initial requests.
  setBackendToken(token || '');

  const configured = supabaseApi.isConfigured();

  useEffect(() => {
    localStorage.setItem(TOKEN_KEY, token || '');
  }, [token]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_CASE_KEY, activeCaseId || '');
  }, [activeCaseId]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId || '');
  }, [activeChatId]);

  const hydrateCaseContacts = useCallback(
    async (rows) => {
      if (!token || !rows.length) {
        setCaseContacts({});
        return {};
      }
      const entries = await Promise.all(
        rows.map(async (row) => {
          const links = await supabaseApi.listCaseContactLinks(token, row.id);
          return [row.id, (links || []).map((l) => l.contact_id)];
        }),
      );
      const mapped = Object.fromEntries(entries);
      setCaseContacts(mapped);
      return mapped;
    },
    [token],
  );

  const refreshWorkspace = useCallback(async () => {
    if (!configured || !token) return;
    setLoading(true);
    setError('');
    try {
      const [user, caseRows, contactRows, chatRows] = await Promise.all([
        supabaseApi.getUser(token),
        supabaseApi.listCases(token),
        supabaseApi.listContacts(token),
        supabaseApi.listAllChats(token),
      ]);

      setMe(user);
      setCases(caseRows || []);
      setContacts(contactRows || []);
      setChats(chatRows || []);
      await hydrateCaseContacts(caseRows || []);

      if (activeCaseId && !(caseRows || []).some((c) => c.id === activeCaseId)) {
        setActiveCaseId('');
      }
      if (activeChatId && !(chatRows || []).some((c) => c.id === activeChatId)) {
        setActiveChatId('');
      }
    } catch (e) {
      setError(e.message);
      if (String(e.message).toLowerCase().includes('jwt') || String(e.message).includes('401')) {
        setToken('');
      }
      throw e;
    } finally {
      setLoading(false);
    }
  }, [configured, token, hydrateCaseContacts, activeCaseId, activeChatId]);

  useEffect(() => {
    if (!configured || !token) return;
    refreshWorkspace().catch(() => {});
  }, [configured, token, refreshWorkspace]);

  const login = useCallback(
    async ({ email, password }) => {
      if (!configured) throw new Error('Supabase env vars are missing.');
      const auth = await supabaseApi.signIn({ email, password });
      setToken(auth.access_token);
      setError('');
      return auth;
    },
    [configured],
  );

  const register = useCallback(
    async ({ name, email, password }) => {
      if (!configured) throw new Error('Supabase env vars are missing.');
      const auth = await supabaseApi.signUp({ name, email, password });
      if (!auth.access_token) {
        throw new Error('Signup completed. Confirm your email in Supabase Auth, then login.');
      }
      setToken(auth.access_token);
      setError('');
      return auth;
    },
    [configured],
  );

  const logout = useCallback(async () => {
    try {
      if (token) await supabaseApi.signOut(token);
    } catch {
      // no-op
    } finally {
      setToken('');
      setMe(null);
      setCases([]);
      setContacts([]);
      setCaseContacts({});
      setChats([]);
      setActiveCaseId('');
      setActiveChatId('');
    }
  }, [token]);

  const createCase = useCallback(
    async ({ name, summary, contactIds, forum, stage, parties }) => {
      const created = await supabaseApi.createCase(token, {
        name,
        summary,
        forum,
        stage,
        parties,
      });
      await supabaseApi.replaceCaseContacts(token, created.id, contactIds || []);
      if ((summary || '').trim()) {
        api.indexVectorSection({
          case_id: created.id,
          content: summary.trim(),
          source: 'summary',
          metadata: { name, forum, stage },
        }).catch(() => {});
      }
      await refreshWorkspace();
      setActiveCaseId(created.id);
      return created;
    },
    [token, refreshWorkspace],
  );

  const updateCase = useCallback(
    async (caseId, patch) => {
      const row = await supabaseApi.updateCase(token, caseId, patch);
      setCases((prev) => prev.map((item) => (item.id === caseId ? { ...item, ...row } : item)));
      if (typeof patch.summary === 'string' && patch.summary.trim()) {
        api.indexVectorSection({
          case_id: caseId,
          content: patch.summary.trim(),
          source: 'summary_update',
        }).catch(() => {});
      }
      return row;
    },
    [token],
  );

  const setContactsForCase = useCallback(
    async (caseId, contactIds) => {
      await supabaseApi.replaceCaseContacts(token, caseId, contactIds);
      setCaseContacts((prev) => ({ ...prev, [caseId]: contactIds }));
      return contactIds;
    },
    [token],
  );

  const createContact = useCallback(
    async (payload) => {
      const created = await supabaseApi.createContact(token, payload);
      setContacts((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      return created;
    },
    [token],
  );

  const updateContact = useCallback(
    async (contactId, patch) => {
      const updated = await supabaseApi.updateContact(token, contactId, patch);
      setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, ...updated } : c)));
      return updated;
    },
    [token],
  );

  const startNewChat = useCallback(
    async (caseId = null) => {
      const caseName = caseId ? (cases.find((c) => c.id === caseId)?.name || 'Case chat') : 'General chat';
      const chat = await supabaseApi.createChat(token, {
        case_id: caseId || null,
        title: caseId ? `${caseName} chat` : 'New chat',
      });
      setChats((prev) => [chat, ...prev]);
      setActiveChatId(chat.id);
      return chat;
    },
    [token, cases],
  );

  const deleteChat = useCallback(
    async (chatId) => {
      await supabaseApi.deleteChat(token, chatId);
      setChats((prev) => prev.filter((chat) => chat.id !== chatId));
      if (activeChatId === chatId) {
        setActiveChatId('');
      }
    },
    [token, activeChatId],
  );

  const loadMessages = useCallback(
    async (chatId) => {
      if (!chatId) return [];
      return supabaseApi.listMessages(token, chatId);
    },
    [token],
  );

  const sendMessage = useCallback(
    async ({ chatId, message, useWebSearch = true, contextPrompt = '' }) => {
      if (!chatId || !message.trim()) return null;

      const userMessage = await supabaseApi.createMessage(token, {
        chat_id: chatId,
        role: 'user',
        content: message.trim(),
      });
      const history = await supabaseApi.listMessages(token, chatId);
      const payloadMessages = [
        ...(contextPrompt ? [{ role: 'system', content: contextPrompt }] : []),
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ];
      const chat = chats.find((item) => item.id === chatId);
      const caseId = chat?.case_id || null;

      const response = caseId
        ? await api.chatCase(caseId, {
            model: 'gpt-4.1-mini',
            use_web_search: useWebSearch,
            citations_required: true,
            messages: payloadMessages,
          })
        : await api.chatFreeform({
            model: 'gpt-4.1-mini',
            use_web_search: useWebSearch,
            messages: payloadMessages,
          });

      const citations = response.citations || [];
      const citationText = citations.length
        ? `\n\nCitations:\n${citations
            .map((c) => `- ${c.id} doc:${c.doc_id || 'n/a'} chunk:${c.chunk_index ?? 'n/a'} score:${(c.score ?? 0).toFixed?.(3) || c.score}`)
            .join('\n')}`
        : '';

      const assistantMessage = await supabaseApi.createMessage(token, {
        chat_id: chatId,
        role: 'assistant',
        content: `${response.output_text || 'No response.'}${citationText}`,
      });

      if (chat && (!chat.title || chat.title === 'New chat')) {
        await supabaseApi.updateChat(token, chatId, { title: message.slice(0, 56) });
      } else {
        await supabaseApi.updateChat(token, chatId, { updated_at: new Date().toISOString() });
      }
      const updatedChats = await supabaseApi.listAllChats(token);
      setChats(updatedChats || []);

      return { userMessage, assistantMessage, response };
    },
    [token, chats],
  );

  const loadCaseDocuments = useCallback(
    async (caseId) => {
      if (!caseId) return [];
      const docs = await supabaseApi.listDocuments(token, caseId);
      const hydrated = await Promise.all(
        (docs || []).map(async (doc) => ({
          ...doc,
          file_url: doc.file_path ? await supabaseApi.getSignedDocumentUrl(token, doc.file_path).catch(() => '') : '',
        })),
      );
      return hydrated;
    },
    [token],
  );

  const uploadCaseDocument = useCallback(
    async (caseId, payload) => {
      const uploaded = await supabaseApi.uploadDocument(token, caseId, payload.file, payload.title, payload.docType);
      api.indexVectorSection({
        case_id: caseId,
        content: `${payload.title}\nType: ${payload.docType}`,
        source: 'document',
        metadata: { document_id: uploaded.id, path: uploaded.file_path || '' },
      }).catch(() => {});
      return uploaded;
    },
    [token],
  );

  const generateSummary = useCallback(
    async (caseItem, docs, linkedContacts) => {
      const result = await api.summarizeCaseById(caseItem.id).catch(async () =>
        api.summarizeCase({
          case_name: caseItem.name,
          forum: caseItem.forum || '',
          stage: caseItem.stage || '',
          parties: caseItem.parties || '',
          current_summary: caseItem.summary || '',
          contacts: (linkedContacts || []).map((c) => c.name),
          documents: (docs || []).map((d) => ({ title: d.title, tag: d.doc_type || d.tag || '' })),
        }),
      );
      const summary = result.summary || '';
      await updateCase(caseItem.id, { summary });
      return summary;
    },
    [updateCase],
  );

  const runCaseProcessing = useCallback(
    async (caseId, force = false) => {
      return api.runCaseProcessing(caseId, { force });
    },
    [],
  );

  const listCaseJobs = useCallback(
    async (caseId) => {
      return api.listCaseJobs(caseId);
    },
    [],
  );

  const listCaseArtifacts = useCallback(
    async (caseId) => {
      return api.listCaseArtifacts(caseId);
    },
    [],
  );

  const buildCaseBundle = useCallback(
    async (caseId) => {
      return api.buildCaseBundle(caseId);
    },
    [],
  );

  const getCaseById = useCallback(
    (caseId) => cases.find((item) => item.id === caseId) || null,
    [cases],
  );

  const getCaseContactIds = useCallback(
    (caseId) => caseContacts[caseId] || [],
    [caseContacts],
  );

  const getContactsForCase = useCallback(
    (caseId) => {
      const ids = new Set(caseContacts[caseId] || []);
      return contacts.filter((c) => ids.has(c.id));
    },
    [caseContacts, contacts],
  );

  const getCasesForContact = useCallback(
    (contactId) => {
      return cases.filter((caseItem) => (caseContacts[caseItem.id] || []).includes(contactId));
    },
    [cases, caseContacts],
  );

  const activeCase = useMemo(() => getCaseById(activeCaseId), [getCaseById, activeCaseId]);

  const value = {
    configured,
    token,
    me,
    cases,
    contacts,
    chats,
    caseContacts,
    activeCaseId,
    setActiveCaseId,
    activeCase,
    activeChatId,
    setActiveChatId,
    loading,
    error,
    setError,
    refreshWorkspace,
    login,
    register,
    logout,
    createCase,
    updateCase,
    setContactsForCase,
    createContact,
    updateContact,
    startNewChat,
    deleteChat,
    loadMessages,
    sendMessage,
    loadCaseDocuments,
    uploadCaseDocument,
    generateSummary,
    runCaseProcessing,
    listCaseJobs,
    listCaseArtifacts,
    buildCaseBundle,
    getCaseById,
    getCaseContactIds,
    getContactsForCase,
    getCasesForContact,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
