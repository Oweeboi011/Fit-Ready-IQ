"use client";

import { useState, useRef, useEffect } from "react";
import {
  MessageCircle,
  X,
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  Minimize2,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const WELCOME: Message = {
  role: "assistant",
  content:
    "Hey! I'm your adventure readiness assistant. Ask me about trails, mountain difficulty, gear recommendations, or how to train for your next big adventure.",
};

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setHasUnread(false);
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, sessionId }),
      });

      const data = await res.json();
      if (typeof data.sessionId === "string" && data.sessionId.length > 0) {
        setSessionId(data.sessionId);
      }
      const reply: Message = {
        role: "assistant",
        content: res.ok ? data.message : (data.error ?? "Something went wrong. Please try again."),
      };
      setMessages((prev) => [...prev, reply]);
      if (!isOpen) setHasUnread(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Could not reach the AI service. Check your connection and try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={`fixed bottom-5 right-5 z-50 relative flex h-13 w-13 items-center justify-center rounded-2xl shadow-lg transition-all active:scale-95 ${
          isOpen
            ? "bg-slate-800 border border-white/10 hover:bg-slate-700 shadow-black/40"
            : "bg-gradient-to-br from-blue-500 to-blue-700 hover:scale-105 hover:shadow-xl shadow-blue-900/50 hover:shadow-blue-900/60"
        }`}
        aria-label={isOpen ? "Close AI assistant" : "Open AI assistant"}
        style={{ height: "3.25rem", width: "3.25rem" }}
      >
        {isOpen ? (
          <Minimize2 className="h-5 w-5 text-slate-300" />
        ) : (
          <MessageCircle className="h-6 w-6 text-white" fill="white" />
        )}
        {hasUnread && !isOpen && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-slate-950" />
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div
          className="fixed bottom-20 right-5 z-50 flex h-[520px] w-[360px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl shadow-black/60"
          style={{ animation: "cardEnter 0.2s ease-out" }}
        >
          {/* Header */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] bg-slate-950/80 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow shadow-blue-900/40">
                <Sparkles className="h-4 w-4 text-white" />
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
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 px-4 py-4" style={{ scrollbarWidth: "thin" }}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex items-end gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                style={{ animation: "cardEnter 0.15s ease-out" }}
              >
                {/* Avatar */}
                <div
                  className={`flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full ${
                    msg.role === "assistant"
                      ? "bg-blue-500/15 border border-blue-500/30"
                      : "bg-white/[0.06] border border-white/10"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <Bot className="h-3.5 w-3.5 text-blue-400" />
                  ) : (
                    <User className="h-3.5 w-3.5 text-slate-400" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={`max-w-[76%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-white/[0.06] text-slate-200 rounded-bl-sm border border-white/[0.06]"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex items-end gap-2">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/15 border border-blue-500/30">
                  <Bot className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-white/[0.06] bg-white/[0.06] px-3.5 py-2.5">
                  <Loader2 className="h-3 w-3 animate-spin text-slate-500" />
                  <span className="text-xs text-slate-500">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-white/[0.06] bg-slate-950/50 p-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 transition-all focus-within:border-blue-500/40 focus-within:bg-white/[0.06]">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="Ask about trails, fitness, gear..."
                className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none"
                disabled={isLoading}
                maxLength={500}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-slate-700">
              Fit Ready IQ AI · Gemini 1.5 Flash
            </p>
          </div>
        </div>
      )}
    </>
  );
}
