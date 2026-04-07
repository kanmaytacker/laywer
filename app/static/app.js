const state = {
  userId: 1,
  matters: [],
  activeMatterId: null,
  docs: [],
  artifacts: [],
  audit: [],
  currentView: "dashboard",
};

const viewMeta = {
  dashboard: ["Dashboard", "Overview of your active matter and outputs"],
  matters: ["Matters", "Create, review and switch case workspaces"],
  documents: ["Documents", "Upload and manage source records"],
  drafting: ["Drafting", "Generate brief, chronology, issues and response drafts"],
  search: ["Search", "Find facts inside active matter documents"],
  exports: ["Exports", "Produce filing-ready bundles and downloadable drafts"],
  audit: ["Audit", "Review activity logs for accountability"],
};

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2100);
}

function headers(extra = {}) {
  return { "X-User-Id": String(state.userId), ...extra };
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: headers(opts.headers || {}),
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      detail = data.detail || JSON.stringify(data);
    } catch {
      // noop
    }
    throw new Error(detail);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res;
}

function setView(view) {
  state.currentView = view;
  document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.remove("active"));
  $(`view-${view}`).classList.add("active");
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add("active");
  const [title, subtitle] = viewMeta[view] || ["MatterDesk", ""];
  $("viewTitle").textContent = title;
  $("viewSubtitle").textContent = subtitle;
}

function selectedMatter() {
  return state.matters.find((m) => m.id === state.activeMatterId) || null;
}

function renderMatterChip() {
  const m = selectedMatter();
  $("activeMatterChip").textContent = m ? `#${m.id} ${m.title} (${m.forum})` : "No active matter";
}

function renderMatters() {
  const list = $("matterList");
  const recent = $("recentMatters");
  list.innerHTML = "";
  recent.innerHTML = "";
  $("matterCount").textContent = String(state.matters.length);
  $("kpiMatters").textContent = String(state.matters.length);

  if (!state.matters.length) {
    list.innerHTML = '<div class="item"><small>No matters yet.</small></div>';
    recent.innerHTML = '<div class="item"><small>No recent matter.</small></div>';
    return;
  }

  state.matters.forEach((m, idx) => {
    const row = document.createElement("button");
    row.className = `item ${m.id === state.activeMatterId ? "active" : ""}`;
    row.innerHTML = `<strong>${m.title}</strong><small>${m.forum} | ${m.stage || "stage n/a"}</small><small>ID ${m.id}</small>`;
    row.onclick = async () => {
      state.activeMatterId = m.id;
      renderMatters();
      renderMatterChip();
      await refreshMatterData();
      toast(`Switched to #${m.id}`);
    };
    list.appendChild(row);

    if (idx < 5) {
      const rec = row.cloneNode(true);
      rec.onclick = row.onclick;
      recent.appendChild(rec);
    }
  });
}

function renderDocuments() {
  const wrap = $("docList");
  wrap.innerHTML = "";
  $("kpiDocs").textContent = String(state.docs.length);
  if (!state.docs.length) {
    wrap.innerHTML = '<div class="item"><small>No documents in active matter.</small></div>';
    return;
  }
  state.docs.forEach((d) => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<strong>${d.title}</strong><small>tag: ${d.tag}</small><small>type: ${d.doc_type}</small>`;
    wrap.appendChild(row);
  });
}

function renderArtifacts() {
  const wrap = $("artifactList");
  wrap.innerHTML = "";
  $("kpiArtifacts").textContent = String(state.artifacts.length);
  if (!state.artifacts.length) {
    wrap.innerHTML = '<div class="item"><small>No artifacts generated.</small></div>';
    return;
  }
  state.artifacts.forEach((a) => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <strong>${a.title}</strong>
      <small>type: ${a.artifact_type} | version ${a.version_number}</small>
      <small>${(a.content || "").slice(0, 180)}...</small>
      <div class="actions">
        <a class="btn" href="/matters/${a.matter_id}/export/artifact/${a.id}/docx" target="_blank" rel="noopener">Export DOCX</a>
      </div>
    `;
    wrap.appendChild(row);
  });
}

function renderAudit() {
  const wrap = $("auditList");
  wrap.innerHTML = "";
  if (!state.audit.length) {
    wrap.innerHTML = '<div class="item"><small>No audit events found for active matter.</small></div>';
    return;
  }
  state.audit.forEach((e) => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<strong>${e.action} ${e.entity_type}</strong><small>${e.created_at}</small><small>entity: ${e.entity_id} | user: ${e.user_id}</small>`;
    wrap.appendChild(row);
  });
}

async function loadMatters() {
  state.matters = await api("/matters");
  if (!state.activeMatterId && state.matters.length) state.activeMatterId = state.matters[0].id;
  if (state.activeMatterId && !state.matters.some((m) => m.id === state.activeMatterId)) {
    state.activeMatterId = state.matters[0]?.id || null;
  }
  renderMatters();
  renderMatterChip();
}

async function loadDocs() {
  if (!state.activeMatterId) {
    state.docs = [];
    renderDocuments();
    return;
  }
  state.docs = await api(`/matters/${state.activeMatterId}/documents`);
  renderDocuments();
}

async function loadArtifacts() {
  if (!state.activeMatterId) {
    state.artifacts = [];
    renderArtifacts();
    return;
  }
  state.artifacts = await api(`/matters/${state.activeMatterId}/artifacts`);
  renderArtifacts();
}

async function loadInsights() {
  if (!state.activeMatterId) {
    $("kpiKeywords").textContent = "-";
    return;
  }
  const data = await api(`/matters/${state.activeMatterId}/insights`);
  $("kpiKeywords").textContent = (data.keywords || []).slice(0, 3).join(", ") || "none";
}

async function loadAudit() {
  if (!state.activeMatterId) {
    state.audit = [];
    renderAudit();
    return;
  }
  const data = await api(`/matters/${state.activeMatterId}/audit`);
  state.audit = data.slice(0, 80);
  renderAudit();
}

async function refreshMatterData() {
  await Promise.all([loadDocs(), loadArtifacts(), loadInsights(), loadAudit()]);
}

async function createMatter(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  const m = await api("/matters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  form.reset();
  await loadMatters();
  state.activeMatterId = m.id;
  renderMatters();
  renderMatterChip();
  await refreshMatterData();
  toast(`Matter #${m.id} created`);
}

async function uploadDocument(form) {
  if (!state.activeMatterId) throw new Error("Select a matter first");
  await api(`/matters/${state.activeMatterId}/documents`, {
    method: "POST",
    body: new FormData(form),
  });
  form.reset();
  await loadDocs();
  await loadInsights();
  toast("Document uploaded");
}

async function generate(type) {
  if (!state.activeMatterId) throw new Error("Select a matter first");
  await api(`/matters/${state.activeMatterId}/generate/${type}`, { method: "POST" });
  await loadArtifacts();
  toast(`${type.replace("_", " ")} generated`);
}

async function runSearch(form) {
  if (!state.activeMatterId) throw new Error("Select a matter first");
  const q = new FormData(form).get("q");
  const data = await api(`/matters/${state.activeMatterId}/search?q=${encodeURIComponent(String(q))}`);
  const wrap = $("searchResults");
  wrap.innerHTML = "";
  if (!data.hits.length) {
    wrap.innerHTML = '<div class="item"><small>No matches.</small></div>';
    return;
  }
  data.hits.forEach((h) => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<strong>${h.document_title}</strong><small>v${h.version}</small><small>${h.snippet}</small>`;
    wrap.appendChild(row);
  });
}

function bind() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.onclick = () => setView(btn.dataset.view);
  });
  document.querySelectorAll("[data-jump]").forEach((btn) => {
    btn.onclick = () => setView(btn.dataset.jump);
  });

  $("loadBtn").onclick = async () => {
    try {
      state.userId = Number($("userIdInput").value || "0");
      if (!state.userId) throw new Error("User ID required");
      await loadMatters();
      await refreshMatterData();
      toast("Session loaded");
    } catch (e) {
      toast(e.message);
    }
  };

  $("matterForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await createMatter(e.currentTarget);
      setView("documents");
    } catch (err) {
      toast(err.message);
    }
  };

  $("docForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await uploadDocument(e.currentTarget);
    } catch (err) {
      toast(err.message);
    }
  };

  document.querySelectorAll("[data-generate]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await generate(btn.dataset.generate);
      } catch (err) {
        toast(err.message);
      }
    };
  });

  $("refreshDocsBtn").onclick = async () => {
    try {
      await loadDocs();
    } catch (err) {
      toast(err.message);
    }
  };

  $("refreshArtifactsBtn").onclick = async () => {
    try {
      await loadArtifacts();
    } catch (err) {
      toast(err.message);
    }
  };

  $("refreshAuditBtn").onclick = async () => {
    try {
      await loadAudit();
    } catch (err) {
      toast(err.message);
    }
  };

  $("searchForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await runSearch(e.currentTarget);
    } catch (err) {
      toast(err.message);
    }
  };

  $("exportBundleBtn").onclick = () => {
    if (!state.activeMatterId) {
      toast("Select a matter first");
      return;
    }
    window.open(`/matters/${state.activeMatterId}/export/bundle.pdf`, "_blank", "noopener");
  };
}

async function bootstrap() {
  bind();
  setView("dashboard");
  try {
    await loadMatters();
    await refreshMatterData();
  } catch {
    toast("Set a valid user id and press Load");
  }
}

bootstrap();
