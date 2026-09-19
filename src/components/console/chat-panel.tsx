"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, Plus, Sparkles, User } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  meta?: { intent?: string; suggestions?: string[] };
  createdAt?: string;
}

interface Conversation {
  id: string;
  title: string;
}

export function ChatPanel() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [booted, setBooted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  const startSession = useCallback(async () => {
    setBusy(true);
    try {
      const list = await fetch("/api/conversations").then((r) => r.json());
      let convo: Conversation | undefined = list.conversations?.[0];
      if (!convo) {
        const created = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Operations session" }),
        }).then((r) => r.json());
        convo = created.conversation;
      }
      if (convo) {
        setConversation(convo);
        const history = await fetch(
          `/api/conversations/${convo.id}/messages`,
        ).then((r) => r.json());
        setMessages(history.messages ?? []);
      }
    } finally {
      setBusy(false);
      setBooted(true);
      scrollToEnd();
    }
  }, [scrollToEnd]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void startSession();
    });
    return () => {
      mounted = false;
    };
  }, [startSession]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || !conversation) return;
    setInput("");
    setBusy(true);
    const optimisticId = `local-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: optimisticId, role: "user", content },
    ]);
    scrollToEnd();
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((m) => [
          ...m,
          {
            id: data.message.id,
            role: "assistant",
            content: data.reply.content,
            meta: data.reply,
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            id: `${optimisticId}-err`,
            role: "system",
            content: `Request failed: ${data.error ?? res.statusText}`,
          },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: `${optimisticId}-err`,
          role: "system",
          content: "Network error while reaching ULTRON core.",
        },
      ]);
    } finally {
      setBusy(false);
      scrollToEnd();
    }
  }

  const lastMessage = messages[messages.length - 1];
  const suggestions =
    lastMessage?.role === "assistant" ? lastMessage.meta?.suggestions ?? [] : [];

  return (
    <div className="panel panel-glow corner flex h-[calc(100vh-160px)] flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
        <div className="flex items-center gap-3">
          <Sparkles size={14} className="text-[var(--cyan)]" />
          <span className="tag !text-[10px]">
            {conversation ? conversation.title : "initializing session"}
          </span>
        </div>
        <button
          onClick={async () => {
            const created = await fetch("/api/conversations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            }).then((r) => r.json());
            if (created.conversation) {
              setConversation(created.conversation);
              setMessages([]);
            }
          }}
          className="btn-ghost inline-flex items-center gap-2 !px-3 !py-1.5 !text-[9px]"
        >
          <Plus size={12} /> New session
        </button>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="scroll-slim flex-1 space-y-5 overflow-y-auto px-5 py-6">
        {booted && messages.length === 0 && (
          <div className="fade-up rounded-lg border border-[var(--line)] bg-[rgba(10,13,22,0.6)] p-5">
            <p className="tag mb-3">ULTRON CORE — deterministic command interface</p>
            <p className="msg-pre text-[var(--ink-dim)]">
              Session established. I report live system facts and guide
              operations — I do not fabricate intelligence.{"\n\n"}Try:
              {"\n"}  /status — live counters{"\n"}  /paths — where your data
              lives{"\n"}  /migrate — legacy data migration guidance
            </p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}
            >
              {m.role !== "user" && (
                <span
                  className="mt-1 inline-block h-6 w-6 shrink-0 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle at 35% 30%, #fff, var(--cyan) 45%, rgba(34,211,238,0.15) 78%)",
                    boxShadow: "0 0 12px rgba(34,211,238,0.6)",
                  }}
                />
              )}
              <div
                className={`max-w-[82%] rounded-lg border px-4 py-3 ${
                  m.role === "user"
                    ? "border-[rgba(139,92,246,0.35)] bg-[rgba(139,92,246,0.09)]"
                    : m.role === "system"
                      ? "border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.06)]"
                      : "border-[rgba(103,232,249,0.22)] bg-[rgba(34,211,238,0.05)]"
                }`}
              >
                {m.role === "user" && (
                  <div className="mb-1 flex items-center gap-1.5">
                    <User size={10} className="text-[var(--violet-hot)]" />
                    <span className="tag !text-[8px]">operator</span>
                  </div>
                )}
                <p className="msg-pre text-[var(--ink)]">{m.content}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {busy && (
          <div className="flex gap-3">
            <span
              className="mt-1 inline-block h-6 w-6 rounded-full"
              style={{
                background:
                  "radial-gradient(circle at 35% 30%, #fff, var(--cyan) 45%, rgba(34,211,238,0.15) 78%)",
                boxShadow: "0 0 12px rgba(34,211,238,0.6)",
              }}
            />
            <p className="thinking msg-pre text-[var(--ink-dim)]">processing</p>
          </div>
        )}
      </div>

      {/* suggestions */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-[var(--line)] px-5 py-2.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="chip transition-colors hover:border-[var(--line-bright)] hover:text-[var(--cyan-hot)]"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-3 border-t border-[var(--line)] px-5 py-4"
      >
        <span className="font-data text-[var(--cyan)]">›</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="issue a command — /help for capabilities"
          className="input-core flex-1"
          maxLength={4000}
          disabled={!booted}
        />
        <button type="submit" className="btn-core !px-4 !py-2.5" disabled={busy || !input.trim()}>
          <CornerDownLeft size={14} />
        </button>
      </form>
    </div>
  );
}
