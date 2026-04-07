const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const MAX_UPLOAD_BYTES = Number(import.meta.env.VITE_MAX_UPLOAD_BYTES || 25 * 1024 * 1024);
const ALLOWED_UPLOAD_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function ensureConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
}

function authHeaders(token, extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`,
    ...extra,
  };
}

function normalizeHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined));
}

function restUrl(path) {
  return `${SUPABASE_URL}${path}`;
}

async function parseResponse(res) {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const payload = await res.json();
      detail = payload.message || payload.error_description || payload.error || JSON.stringify(payload);
    } catch {
      // no-op
    }
    throw new Error(detail);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return null;
}

async function authRequest(path, options = {}) {
  ensureConfigured();
  const res = await fetch(restUrl(`/auth/v1${path}`), {
    ...options,
    headers: normalizeHeaders({
      ...authHeaders(options.token, { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    }),
  });
  return parseResponse(res);
}

async function restRequest(path, token, options = {}) {
  ensureConfigured();
  const res = await fetch(restUrl(`/rest/v1/${path}`), {
    ...options,
    headers: normalizeHeaders({
      ...authHeaders(token, {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      ...(options.headers || {}),
    }),
  });
  return parseResponse(res);
}

async function storageRequest(path, token, options = {}) {
  ensureConfigured();
  const res = await fetch(restUrl(`/storage/v1/${path}`), {
    ...options,
    headers: normalizeHeaders({
      ...authHeaders(token, options.headers || {}),
    }),
  });
  return parseResponse(res);
}

function encodeEq(value) {
  return encodeURIComponent(`eq.${value}`);
}

function publicFileUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

function parseTokenPayload(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {};
  }
}

async function sha256(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const supabaseApi = {
  isConfigured() {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  },

  async signUp({ name, email, password }) {
    return authRequest('/signup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        data: { name: name || '' },
      }),
    });
  },

  async signIn({ email, password }) {
    return authRequest('/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async signOut(token) {
    return authRequest('/logout', { method: 'POST', token });
  },

  async getUser(token) {
    return authRequest('/user', { method: 'GET', token });
  },

  async listCases(token) {
    return restRequest(
      'cases?select=*&order=updated_at.desc',
      token,
      { method: 'GET', headers: { Prefer: undefined } },
    );
  },

  async createCase(token, payload) {
    const jwt = parseTokenPayload(token);
    const tenantId = jwt.tenant_id || jwt?.app_metadata?.tenant_id || jwt.sub;
    const body = {
      tenant_id: tenantId,
      name: payload.name,
      summary: payload.summary || '',
      forum: payload.forum || '',
      stage: payload.stage || '',
      parties: payload.parties || '',
      status: payload.status || 'active',
    };
    const rows = await restRequest('cases', token, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return rows?.[0];
  },

  async updateCase(token, caseId, patch) {
    const rows = await restRequest(`cases?id=${encodeEq(caseId)}`, token, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return rows?.[0];
  },

  async listContacts(token) {
    return restRequest(
      'contacts?select=*&order=name.asc',
      token,
      { method: 'GET', headers: { Prefer: undefined } },
    );
  },

  async createContact(token, payload) {
    const jwt = parseTokenPayload(token);
    const tenantId = jwt.tenant_id || jwt?.app_metadata?.tenant_id || jwt.sub;
    const rows = await restRequest('contacts', token, {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        name: payload.name,
        email: payload.email || '',
        phone: payload.phone || '',
        notes: payload.notes || '',
      }),
    });
    return rows?.[0];
  },

  async updateContact(token, contactId, patch) {
    const rows = await restRequest(`contacts?id=${encodeEq(contactId)}`, token, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return rows?.[0];
  },

  async listCaseContactLinks(token, caseId) {
    return restRequest(
      `case_contacts?case_id=${encodeEq(caseId)}&select=contact_id`,
      token,
      { method: 'GET', headers: { Prefer: undefined } },
    );
  },

  async replaceCaseContacts(token, caseId, contactIds) {
    await restRequest(`case_contacts?case_id=${encodeEq(caseId)}`, token, {
      method: 'DELETE',
      headers: { Prefer: undefined },
    });
    if (!contactIds.length) return [];
    const jwt = parseTokenPayload(token);
    const tenantId = jwt.tenant_id || jwt?.app_metadata?.tenant_id || jwt.sub;
    return restRequest('case_contacts', token, {
      method: 'POST',
      body: JSON.stringify(contactIds.map((contactId) => ({ tenant_id: tenantId, case_id: caseId, contact_id: contactId }))),
    });
  },

  async listDocuments(token, caseId) {
    return restRequest(
      `documents?case_id=${encodeEq(caseId)}&select=*&order=created_at.desc`,
      token,
      { method: 'GET', headers: { Prefer: undefined } },
    );
  },

  async uploadDocument(token, caseId, file, title, docType) {
    if (!file) throw new Error('File is required');
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`File too large. Max size is ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB.`);
    }
    if (file.type && !ALLOWED_UPLOAD_MIME.has(file.type)) {
      throw new Error('Unsupported file type. Use PDF, DOCX, TXT, PNG, JPG, or WEBP.');
    }

    const bucket = 'case-documents';
    const jwt = parseTokenPayload(token);
    const ownerId = jwt.sub || 'unknown-user';
    const tenantId = jwt.tenant_id || jwt?.app_metadata?.tenant_id || ownerId;
    const safeName = `${Date.now()}-${(file.name || 'document').replace(/\s+/g, '_')}`;
    const path = `${ownerId}/${caseId}/${safeName}`;
    const checksum = await sha256(file);

    await storageRequest(`object/${bucket}/${path}`, token, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: file,
    });

    const rows = await restRequest('documents', token, {
      method: 'POST',
      body: JSON.stringify({
        case_id: caseId,
        tenant_id: tenantId,
        title,
        doc_type: docType || 'evidence',
        file_path: path,
        size_bytes: file.size || 0,
        mime_type: file.type || 'application/octet-stream',
        content_checksum: checksum,
      }),
    });

    const doc = rows?.[0];
    return {
      ...doc,
      file_url: publicFileUrl(bucket, path),
    };
  },

  getDocumentPublicUrl(path) {
    return publicFileUrl('case-documents', path);
  },

  async getSignedDocumentUrl(token, path, expiresIn = 3600) {
    const res = await storageRequest(`object/sign/case-documents/${path}`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn }),
    });
    const signed = res?.signedURL || res?.signedUrl || '';
    if (!signed) return '';
    if (signed.startsWith('http://') || signed.startsWith('https://')) return signed;
    return `${SUPABASE_URL}/storage/v1${signed.startsWith('/') ? signed : `/${signed}`}`;
  },

  async listChats(token, caseId = null) {
    const filter = caseId ? `case_id=${encodeEq(caseId)}&` : '';
    return restRequest(
      `chats?${filter}select=*&order=updated_at.desc`,
      token,
      { method: 'GET', headers: { Prefer: undefined } },
    );
  },

  async listAllChats(token) {
    return restRequest(
      'chats?select=*&order=updated_at.desc',
      token,
      { method: 'GET', headers: { Prefer: undefined } },
    );
  },

  async createChat(token, payload) {
    const jwt = parseTokenPayload(token);
    const tenantId = jwt.tenant_id || jwt?.app_metadata?.tenant_id || jwt.sub;
    const rows = await restRequest('chats', token, {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        case_id: payload.case_id || null,
        title: payload.title || 'New chat',
      }),
    });
    return rows?.[0];
  },

  async updateChat(token, chatId, patch) {
    const rows = await restRequest(`chats?id=${encodeEq(chatId)}`, token, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return rows?.[0];
  },

  async deleteChat(token, chatId) {
    await restRequest(`messages?chat_id=${encodeEq(chatId)}`, token, {
      method: 'DELETE',
      headers: { Prefer: undefined },
    });
    await restRequest(`chats?id=${encodeEq(chatId)}`, token, {
      method: 'DELETE',
      headers: { Prefer: undefined },
    });
  },

  async listMessages(token, chatId) {
    return restRequest(
      `messages?chat_id=${encodeEq(chatId)}&select=*&order=created_at.asc`,
      token,
      { method: 'GET', headers: { Prefer: undefined } },
    );
  },

  async createMessage(token, payload) {
    const jwt = parseTokenPayload(token);
    const tenantId = jwt.tenant_id || jwt?.app_metadata?.tenant_id || jwt.sub;
    const rows = await restRequest('messages', token, {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        chat_id: payload.chat_id,
        role: payload.role,
        content: payload.content,
      }),
    });
    return rows?.[0];
  },
};
