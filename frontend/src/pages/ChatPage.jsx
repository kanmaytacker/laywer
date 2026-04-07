import { useEffect, useMemo, useState } from 'react';
import { Globe, Loader2, SendHorizontal } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function ChatPage() {
  const {
    me,
    chats,
    activeChatId,
    setActiveChatId,
    startNewChat,
    loadMessages,
    sendMessage,
    setError,
  } = useApp();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(true);

  const generalChats = useMemo(() => chats.filter((chat) => !chat.case_id), [chats]);

  useEffect(() => {
    if (!me) return;
    if (activeChatId) return;
    const first = generalChats[0];
    if (first) {
      setActiveChatId(first.id);
    } else {
      setMessages([]);
    }
  }, [me, activeChatId, generalChats, setActiveChatId]);

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    loadMessages(activeChatId)
      .then(setMessages)
      .catch((e) => setError(e.message));
  }, [activeChatId, loadMessages, setError]);

  const onSend = async (e) => {
    e.preventDefault();
    if (!activeChatId || !input.trim()) return;
    const text = input.trim();
    setInput('');
    const optimistic = [...messages, { id: `temp-${Date.now()}`, role: 'user', content: text }];
    setMessages(optimistic);
    setLoading(true);
    try {
      await sendMessage({
        chatId: activeChatId,
        message: text,
        useWebSearch,
        contextPrompt: 'You are a practical legal operations assistant for Indian litigation teams.',
      });
      const latest = await loadMessages(activeChatId);
      setMessages(latest);
    } catch (err) {
      setError(err.message);
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  if (!me) {
    return (
      <section className="center-empty">
        <h2 className="text-2xl font-semibold text-[#f1f5f9]">Sign in to start chatting</h2>
        <p className="mt-2 text-sm text-[#9aa4b2]">Use the login button in the header.</p>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col gap-4">
      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[#f3f7fd]">General chat</h2>
          <button
            className="btn"
            type="button"
            onClick={() =>
              startNewChat(null)
                .then((chat) => setActiveChatId(chat.id))
                .catch((e) => setError(e.message))
            }
          >
            New chat
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {generalChats.slice(0, 10).map((chat) => (
            <button
              key={chat.id}
              className={`rounded-full border px-3 py-1 text-xs ${
                chat.id === activeChatId
                  ? 'border-[#2e7d5a] bg-[#173127] text-[#d0f4e4]'
                  : 'border-[#2f3948] bg-[#141b25] text-[#aeb9ca] hover:bg-[#1a2330]'
              }`}
              type="button"
              onClick={() => setActiveChatId(chat.id)}
            >
              {chat.title || 'New chat'}
            </button>
          ))}
          {!generalChats.length && <span className="text-xs text-[#8a95a8]">No general chats yet</span>}
        </div>
      </div>

      <div className="chat-shell">
        <div className="chat-messages">
          {!messages.length && !loading && (
            <div className="center-empty gap-3">
              <p className="text-sm text-[#9ca7b6]">No chat selected.</p>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  startNewChat(null)
                    .then((chat) => setActiveChatId(chat.id))
                    .catch((e) => setError(e.message))
                }
              >
                New chat
              </button>
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`chat-row ${message.role === 'user' ? 'chat-row-user' : ''}`}>
              <div className={`chat-bubble ${message.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
                {message.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="chat-row">
              <div className="chat-bubble chat-bubble-ai inline-flex items-center gap-2">
                <Loader2 className="animate-spin" size={14} />
                Thinking...
              </div>
            </div>
          )}
        </div>
        <form className="chat-composer" onSubmit={onSend}>
          <textarea
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message CaseDesk"
          />
          <div className="chat-controls">
            <button className={`chip ${useWebSearch ? 'chip-active' : ''}`} type="button" onClick={() => setUseWebSearch((prev) => !prev)}>
              <Globe size={13} />
              Web
            </button>
            <button className="btn btn-primary" disabled={loading || !input.trim() || !activeChatId} type="submit">
              <SendHorizontal size={14} />
              Send
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
