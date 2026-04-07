import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquarePlus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Modal from './Modal';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    configured,
    me,
    login,
    register,
    logout,
    setError,
    startNewChat,
    setActiveCaseId,
  } = useApp();

  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  const title = useMemo(() => {
    if (location.pathname.startsWith('/contacts')) return 'Contacts';
    if (location.pathname.includes('/documents')) return 'Documents';
    if (location.pathname.startsWith('/cases/')) return 'Cases';
    return 'Chats';
  }, [location.pathname]);

  const onAuth = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      setError('');
      if (mode === 'login') {
        await login({ email: form.email, password: form.password });
      } else {
        await register({ name: form.name, email: form.email, password: form.password });
      }
      setAuthOpen(false);
      setForm({ name: '', email: '', password: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const onNewChat = async () => {
    try {
      await startNewChat(null);
      setActiveCaseId('');
      navigate('/chat');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <header className="mb-3 flex items-center justify-between border-b border-[#262d37] pb-3">
        <div>
          <h1 className="text-[14px] font-semibold tracking-wide text-[#eef3fb]">{title}</h1>
          <p className="text-xs text-[#8f9aac]">Workspace</p>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn" type="button" onClick={onNewChat}>
            <MessageSquarePlus size={14} />
            New chat
          </button>
          {me ? (
            <>
              <span className="rounded-full border border-[#2d3642] bg-[#141b26] px-2.5 py-1 text-xs text-[#dce3ed]">
                {me.email}
              </span>
              <button className="btn" type="button" onClick={logout}>
                Logout
              </button>
            </>
          ) : (
            <button className="btn btn-primary" type="button" onClick={() => setAuthOpen(true)}>
              Login
            </button>
          )}
        </div>
      </header>

      <Modal open={authOpen} title={mode === 'login' ? 'Login' : 'Create account'} onClose={() => setAuthOpen(false)} width="max-w-md">
        <form className="grid gap-3" onSubmit={onAuth}>
          {!configured && (
            <p className="rounded-lg border border-[#4a2f2f] bg-[#2a1a1a] px-3 py-2 text-xs text-[#f7b4b4]">
              Supabase env vars are missing. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
            </p>
          )}
          {mode === 'register' && (
            <input
              className="input"
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          )}
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            required
          />
          <div className="flex items-center justify-between">
            <button
              className="text-xs text-[#9da6b4] hover:text-[#dde3ed]"
              type="button"
              onClick={() => setMode((prev) => (prev === 'login' ? 'register' : 'login'))}
            >
              {mode === 'login' ? 'Need an account?' : 'Have an account?'}
            </button>
            <button className="btn btn-primary" disabled={submitting || !configured} type="submit">
              {submitting ? 'Please wait...' : mode === 'login' ? 'Login' : 'Register'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
