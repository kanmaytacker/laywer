const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';
let backendToken = '';

export function setBackendToken(token) {
  backendToken = token || '';
}

async function request(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };
  if (backendToken) {
    headers.Authorization = `Bearer ${backendToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const payload = await res.json();
      detail = payload.detail || JSON.stringify(payload);
    } catch {
      // no-op
    }
    throw new Error(detail);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

export const api = {
  chatFreeform: (payload) =>
    request('/chat/freeform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  chatCase: (caseId, payload) =>
    request(`/chat/case/${caseId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  proxyChat: (payload) =>
    request('/chat/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  summarizeCase: (payload) =>
    request('/chat/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  summarizeCaseById: (caseId) =>
    request(`/chat/summary/${caseId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),

  indexVectorSection: (payload) =>
    request('/vector/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  runCaseProcessing: (caseId, payload = { force: false }) =>
    request(`/processing/cases/${caseId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  listCaseJobs: (caseId) =>
    request(`/processing/cases/${caseId}/jobs`, {
      method: 'GET',
    }),

  listCaseArtifacts: (caseId) =>
    request(`/processing/cases/${caseId}/artifacts`, {
      method: 'GET',
    }),

  buildCaseBundle: (caseId) =>
    request(`/processing/cases/${caseId}/bundle`, {
      method: 'GET',
    }),
};
