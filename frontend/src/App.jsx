import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import { useApp } from './context/AppContext';
import ChatPage from './pages/ChatPage';
import ContactsPage from './pages/ContactsPage';
import CaseWorkspacePage from './pages/CaseWorkspacePage';
import CaseDocumentsPage from './pages/CaseDocumentsPage';

function InlineError() {
  const { error, setError } = useApp();
  if (!error) return null;
  return (
    <div className="mb-3 flex items-center justify-between rounded-xl border border-[#6b3030] bg-[#2d1919] px-3 py-2 text-sm text-[#f7c2c2]">
      <div className="flex items-center gap-2">
        <AlertCircle size={14} />
        <span>{error}</span>
      </div>
      <button className="text-xs text-[#ffd0d0]" onClick={() => setError('')} type="button">
        Dismiss
      </button>
    </div>
  );
}

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="app-shell">
      <div className={sidebarCollapsed ? 'app-grid app-grid-collapsed' : 'app-grid'}>
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((prev) => !prev)} />
        <main className="main-shell">
          <div className="mx-auto flex h-full w-full max-w-none flex-col px-7 py-6">
            <Header />
            <InlineError />
            <div className="flex-1 overflow-hidden">
              <Routes>
                <Route path="/" element={<Navigate replace to="/chat" />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/contacts" element={<ContactsPage />} />
                <Route path="/cases/:caseId" element={<CaseWorkspacePage />} />
                <Route path="/cases/:caseId/documents" element={<CaseDocumentsPage />} />
                <Route path="*" element={<Navigate replace to="/chat" />} />
              </Routes>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
