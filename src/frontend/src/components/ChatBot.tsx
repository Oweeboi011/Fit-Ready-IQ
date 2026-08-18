'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, Sparkles, Minimize2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const WELCOME: Message = {
  role: 'assistant',
  content:
    "Hey! I'm your adventure readiness assistant. Ask me about trails, mountain difficulty, gear recommendations, or how to train for your next big adventure.",
};

/**
 * Openers offered as chips on an empty thread.
 *
 * The panel used to open with a welcome sentence and a blank input, which is
 * the hardest possible moment to think of a question. These are the three
 * things the product can actually answer well.
 */
const SUGGESTED_PROMPTS = [
  'Am I ready for a 15 km hike with 1,000 m of gain?',
  'What gear do I need for an overnight climb?',
  'How should I train for a summit in 8 weeks?',
];

/** The server keeps history under this id; regenerating it orphaned the thread. */
const SESSION_KEY = 'fri_chat_session';
const HISTORY_KEY = 'fri_chat_history';

/** A conversation the user has walked away from should not come back. */
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Neither the client fetch nor the Gemini call had any timeout, so a stalled
 * request left "Thinking…" on screen and the input disabled indefinitely.
 */
const CHAT_TIMEOUT_MS = 30_000;

/** Input cap. Surfaced as a counter once it is close, rather than silently biting. */
const MAX_INPUT = 500;

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [sessionId, setSessionId] = useState<string>('');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [restored, setRestored] = useState(false);
  /** The last message that failed, so it can be retried without retyping. */
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The server persists every exchange to Firestore under `sessionId`, but the
  // client regenerated that id on each mount — so navigating to the admin page
  // and back silently orphaned the conversation. Restore it after mount rather
  // than in a useState initializer, which would break hydration.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { ts: number; messages: Message[] };
        if (Date.now() - saved.ts < HISTORY_TTL_MS && Array.isArray(saved.messages)) {
          setMessages(saved.messages);
        }
      }
      setSessionId(localStorage.getItem(SESSION_KEY) ?? crypto.randomUUID());
    } catch {
      setSessionId(crypto.randomUUID());
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      if (sessionId) localStorage.setItem(SESSION_KEY, sessionId);
      localStorage.setItem(HISTORY_KEY, JSON.stringify({ ts: Date.now(), messages }));
    } catch {
      /* private mode — the thread just won't survive a reload */
    }
  }, [messages, sessionId, restored]);

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const sendMessage = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setFailedMessage(null);
    setIsLoading(true);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, sessionId }),
        signal: controller.signal,
      });

      const data = await res.json();
      if (typeof data.sessionId === 'string' && data.sessionId.length > 0) {
        setSessionId(data.sessionId);
      }
      // `data.error` is written for developers ("Add GEMINI_API_KEY to your
      // environment") and used to land verbatim in the chat. Log it, show the
      // user something they can act on.
      if (!res.ok) {
        console.error('Chat request failed:', data.error ?? res.status);
        setFailedMessage(text);
      }
      const reply: Message = {
        role: 'assistant',
        content: res.ok
          ? data.message
          : res.status === 429
            ? "I'm getting a lot of questions right now. Give me a moment and ask again."
            : "I couldn't answer that just now. Please try again in a moment.",
      };
      setMessages((prev) => [...prev, reply]);
    } catch (err: unknown) {
      const timedOut = err instanceof DOMException && err.name === 'AbortError';
      setFailedMessage(text);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: timedOut
            ? 'That took too long to come back. Try asking again.'
            : 'Could not reach the AI service. Check your connection and try again.',
        },
      ]);
    } finally {
      clearTimeout(timer);
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={`fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg transition-all active:scale-95 ${
          isOpen
            ? 'border border-ink/10 bg-slate-800 shadow-black/40 hover:bg-slate-700'
            : 'bg-gradient-to-br from-blue-500 to-blue-700 shadow-blue-900/50 hover:scale-105 hover:shadow-xl hover:shadow-blue-900/60'
        }`}
        aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
        style={{ height: '3.25rem', width: '3.25rem' }}
      >
        {isOpen ? (
          <Minimize2 aria-hidden="true" className="h-5 w-5 text-slate-300" />
        ) : (
          <MessageCircle aria-hidden="true" className="h-6 w-6 text-white" fill="white" />
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Adventure Assistant"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsOpen(false);
          }}
          // Was a hardcoded 360px panel offset 20px from the right edge, so on a
          // 360px phone it overflowed the viewport.
          className="fixed inset-x-3 bottom-20 z-50 flex h-[min(520px,70vh)] flex-col overflow-hidden rounded-2xl border border-ink/[0.08] bg-slate-900 shadow-2xl shadow-black/60 sm:inset-x-auto sm:right-5 sm:w-[360px]"
          style={{ animation: 'cardEnter 0.2s ease-out' }}
        >
          {/* Header */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-ink/[0.06] bg-slate-950/80 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow shadow-blue-900/40">
                <Sparkles aria-hidden="true" className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Adventure Assistant</p>
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <p className="text-[10px] text-slate-500">Powered by Gemini</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-ink/[0.06] hover:text-slate-300"
              aria-label="Close"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            style={{ scrollbarWidth: 'thin' }}
          >
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                style={{ animation: 'cardEnter 0.15s ease-out' }}
              >
                {/* Avatar */}
                <div
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                    msg.role === 'assistant'
                      ? 'border border-blue-500/30 bg-blue-500/15'
                      : 'border border-ink/10 bg-ink/[0.06]'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <Bot aria-hidden="true" className="h-3.5 w-3.5 text-blue-400" />
                  ) : (
                    <User aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={`max-w-[76%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'rounded-br-sm bg-blue-600 text-white'
                      : 'rounded-bl-sm border border-ink/[0.06] bg-ink/[0.06] text-slate-200'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex items-end gap-2">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/15">
                  <Bot aria-hidden="true" className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-ink/[0.06] bg-ink/[0.06] px-3.5 py-2.5">
                  <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin text-slate-500" />
                  <span className="text-xs text-slate-500">Thinking…</span>
                </div>
              </div>
            )}

            {/* A failed message used to sit in the thread with no way forward
                but retyping it. */}
            {failedMessage && !isLoading && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    const retry = failedMessage;
                    setFailedMessage(null);
                    // Drop the failed exchange so the retry is not a duplicate.
                    setMessages((prev) => prev.slice(0, -2));
                    sendMessage(retry);
                  }}
                  className="rounded-full border border-ink/10 bg-ink/[0.06] px-3 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-ink/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Openers, shown only while the thread is untouched. */}
            {messages.length === 1 && !isLoading && (
              <div className="space-y-1.5 pt-1">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    className="block w-full rounded-xl border border-ink/[0.08] bg-ink/[0.03] px-3 py-2 text-left text-xs text-slate-300 transition-colors hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-ink/[0.06] bg-slate-950/50 p-3">
            <div className="flex items-center gap-2 rounded-xl border border-ink/[0.08] bg-ink/[0.04] px-3 py-2 transition-all focus-within:border-blue-500/40 focus-within:bg-ink/[0.06]">
              <input
                ref={inputRef}
                type="text"
                aria-label="Ask the adventure assistant"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Ask about trails, fitness, gear..."
                className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none"
                disabled={isLoading}
                maxLength={MAX_INPUT}
              />
              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Send message"
              >
                <Send aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* The header already carries the attribution. This line repeated
                it with a model version that had drifted out of date. */}
            <div className="mt-1.5 flex items-center justify-center gap-2 text-[10px] text-slate-500">
              <span>AI can make mistakes — check anything safety-critical.</span>
              {input.length > MAX_INPUT * 0.8 && (
                <span
                  aria-live="polite"
                  className={input.length >= MAX_INPUT ? 'text-amber-400' : 'text-slate-500'}
                >
                  {input.length}/{MAX_INPUT}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
