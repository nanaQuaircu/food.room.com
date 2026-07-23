'use client';

import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchApi } from '@/lib/client/fetch-api';

type Phase = 'welcome' | 'form' | 'chat';

type ChatMessage = {
  id: string;
  from: 'bot' | 'guest';
  text: string;
};

type Props = {
  slug: string;
  hotelName: string;
};

const DEFAULT_AVATAR = '/guest/chat-avatar.jpg';

type TextBlock =
  | { type: 'p'; text: string }
  | { type: 'ol'; items: string[] };

/** Normalize bot markdown (* / - / 1.) into clean numbered lists for display. */
function parseChatBlocks(text: string): TextBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: TextBlock[] = [];
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    const t = para.join(' ').trim();
    if (t) blocks.push({ type: 'p', text: t });
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: 'ol', items: list });
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      flushPara();
      continue;
    }
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (bullet) {
      flushPara();
      list.push(bullet[1].trim());
      continue;
    }
    flushList();
    para.push(line);
  }
  flushList();
  flushPara();
  return blocks.length ? blocks : [{ type: 'p', text }];
}

/** Turn [Label](/path) or bare /slug/... into readable inline links. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\[([^\]]+)\]\((\/[^)\s]+)\)|(\/(?:[a-z0-9-]+\/)+(?:[a-z0-9-]+)?)/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    if (match[1] && match[2]) {
      nodes.push(
        <Link key={`l-${key++}`} href={match[2]} className="guest-chat__inline-link">
          {match[1]}
        </Link>
      );
    } else if (match[3]) {
      const href = match[3];
      const label = href.split('/').filter(Boolean).slice(1).join(' › ') || 'page';
      nodes.push(
        <Link key={`l-${key++}`} href={href} className="guest-chat__inline-link">
          {label}
        </Link>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : [text];
}

function ChatMessageBody({ text, className }: { text: string; className?: string }) {
  const blocks = parseChatBlocks(text);
  return (
    <div className={className ? `guest-chat__bubble-body ${className}` : 'guest-chat__bubble-body'}>
      {blocks.map((b, i) =>
        b.type === 'ol' ? (
          <ol key={i} className="guest-chat__list">
            {b.items.map((item, j) => (
              <li key={j}>{renderInline(item)}</li>
            ))}
          </ol>
        ) : (
          <p key={i}>{renderInline(b.text)}</p>
        )
      )}
    </div>
  );
}

/**
 * LiveChat-style floating guest concierge powered by Groq (via server API).
 */
export default function GuestChatWidget({ slug, hotelName }: Props) {
  const [open, setOpen] = useState(false);
  const [teaserVisible, setTeaserVisible] = useState(true);
  const [phase, setPhase] = useState<Phase>('welcome');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'greet',
      from: 'bot',
      text: 'Hi! What can I do for you?',
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);
  const botName = `${hotelName.split(' ')[0] || 'Hotel'} Concierge`;
  const avatar = DEFAULT_AVATAR;

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, phase]);

  function openPanel() {
    setOpen(true);
    setTeaserVisible(false);
  }

  function closePanel() {
    setOpen(false);
  }

  function historyForApi(list: ChatMessage[]) {
    return list
      .filter((m) => m.id !== 'greet')
      .map((m) => ({
        role: (m.from === 'guest' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text,
      }));
  }

  async function startChat(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError('Name and e-mail are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid e-mail.');
      return;
    }
    setPhase('chat');
    setMessages((prev) => [
      ...prev,
      {
        id: `bot-ready-${Date.now()}`,
        from: 'bot',
        text: `Thanks ${name.trim().split(' ')[0]}! Ask me about rooms, dining, amenities, or booking — I’m here to help.`,
      },
    ]);
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setDraft('');
    const guestMsg: ChatMessage = { id: `g-${Date.now()}`, from: 'guest', text };
    const nextMessages = [...messages, guestMsg];
    setMessages(nextMessages);

    try {
      const res = await fetchApi<{ reply: string }>(`/api/public/${slug}/chat`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: text,
          history: historyForApi(nextMessages.slice(0, -1)),
        }),
      });

      if (!res.success || !res.data?.reply) {
        setError(res.message || 'Could not reach concierge.');
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-err-${Date.now()}`,
            from: 'bot',
            text: 'Sorry — I could not reply just now. Please try again, or use the Contact page.',
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-ok-${Date.now()}`,
            from: 'bot',
            text: res.data!.reply,
          },
        ]);
        // Soft handoff: also log longer asks for staff follow-up
        if (text.length > 80 || /call me|email me|human|manager|complaint/i.test(text)) {
          void fetchApi(`/api/public/${slug}/contact`, {
            method: 'POST',
            body: JSON.stringify({
              name: name.trim(),
              email: email.trim(),
              subject: 'Chat follow-up request',
              message: text,
            }),
          }).catch(() => undefined);
        }
      }
    } catch {
      setError('Network error. Please try again.');
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-net-${Date.now()}`,
          from: 'bot',
          text: 'Connection issue. Please check your network and try again.',
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="guest-chat">
      <AnimatePresence>
        {!open && teaserVisible ? (
          <motion.div
            key="teaser"
            className="guest-chat__teaser"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.28 }}
          >
            <button
              type="button"
              className="guest-chat__teaser-close"
              aria-label="Dismiss"
              onClick={() => setTeaserVisible(false)}
            >
              ×
            </button>
            <button type="button" className="guest-chat__teaser-open" onClick={openPanel}>
              <img src={avatar} alt="" className="guest-chat__avatar" />
              <div className="guest-chat__teaser-copy">
                <strong>{botName}</strong>
                <span className="guest-chat__bubble">Hi! What can I do for you?</span>
              </div>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open ? (
          <motion.aside
            key="panel"
            className="guest-chat__panel"
            role="dialog"
            aria-label={`${botName} chat`}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.28 }}
          >
            <header className="guest-chat__header">
              <div className="guest-chat__header-actions">
                <button
                  type="button"
                  aria-label="Back"
                  onClick={() => (phase === 'form' ? setPhase('welcome') : closePanel())}
                >
                  ←
                </button>
                <button type="button" aria-label="Minimize" onClick={closePanel}>
                  −
                </button>
              </div>
              <div className="guest-chat__identity">
                <span className="guest-chat__avatar-wrap">
                  <img src={avatar} alt="" className="guest-chat__avatar" />
                  <span className="guest-chat__online" aria-hidden="true" />
                </span>
                <strong>{botName}</strong>
              </div>
            </header>

            <div className="guest-chat__body" ref={listRef}>
              {messages.map((m) => (
                <div key={m.id} className={`guest-chat__msg guest-chat__msg--${m.from}`}>
                  {m.from === 'bot' ? (
                    <img src={avatar} alt="" className="guest-chat__msg-avatar" />
                  ) : null}
                  {m.from === 'bot' ? <ChatMessageBody text={m.text} /> : <p>{m.text}</p>}
                </div>
              ))}

              {sending ? (
                <div className="guest-chat__msg guest-chat__msg--bot">
                  <img src={avatar} alt="" className="guest-chat__msg-avatar" />
                  <p className="guest-chat__typing">Typing…</p>
                </div>
              ) : null}

              {phase === 'welcome' ? (
                <div className="guest-chat__cta-wrap">
                  <button type="button" className="guest-chat__cta" onClick={() => setPhase('form')}>
                    Let&apos;s chat
                  </button>
                </div>
              ) : null}

              {phase === 'form' ? (
                <form className="guest-chat__preform" onSubmit={startChat}>
                  <div className="guest-chat__preform-card">
                    <p>
                      Have a question? Please fill in the form below, and our chat agent will gladly help
                      you!
                    </p>
                    <label htmlFor="guest-chat-name">
                      Name: <span>*</span>
                    </label>
                    <input
                      id="guest-chat-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                    <label htmlFor="guest-chat-email">
                      E-mail: <span>*</span>
                    </label>
                    <input
                      id="guest-chat-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                    {error ? <p className="guest-chat__error">{error}</p> : null}
                    <button type="submit" className="guest-chat__cta">
                      Start the chat
                    </button>
                  </div>
                </form>
              ) : null}
            </div>

            {phase === 'chat' ? (
              <form className="guest-chat__composer" onSubmit={sendMessage}>
                {error ? <p className="guest-chat__error">{error}</p> : null}
                <input
                  type="text"
                  placeholder="Type a message…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={sending}
                  aria-label="Message"
                />
                <button type="submit" disabled={sending || !draft.trim()}>
                  Send
                </button>
              </form>
            ) : (
              <footer className="guest-chat__footer">
                <span>Powered by {hotelName}</span>
              </footer>
            )}
          </motion.aside>
        ) : null}
      </AnimatePresence>

      {!open ? (
        <button type="button" className="guest-chat__fab" aria-label="Open chat" onClick={openPanel}>
          <img src="/guest/chat-fab.svg" alt="" width={58} height={58} />
        </button>
      ) : null}
    </div>
  );
}
