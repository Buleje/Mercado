"use client";

import { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Message = { id: string; sender: string; message: string; createdAt: string };

export default function AdminChatTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sender] = useState(() => {
    try {
      const s = document.cookie.match(/admin-session=([^;]+)/);
      if (s) { const d = JSON.parse(atob(s[1].split(".")[0])); if (d.user) return d.user as string; }
    } catch { /* */ }
    return "admin";
  });
  const [tick, setTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/admin-chat")
      .then(r => r.ok ? r.json() : [])
      .then((msgs: Message[]) => { if (active) { setMessages(msgs); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tick]);

  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    await fetch("/api/admin-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sender, message: text.trim() }) });
    setText("");
    setTick(v => v + 1);
    setSending(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-100">
      <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2 mb-4"><MessageSquare className="h-6 w-6 text-primary" />Chat Interno</h2>

      <div className="flex-1 overflow-y-auto bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 space-y-3">
        {messages.length === 0 && <p className="text-center text-gray-400 dark:text-muted py-12">No hay mensajes aún. ¡Inicia la conversación!</p>}
        {messages.map(m => {
          const isMe = m.sender === sender;
          return (
            <div key={m.id} className={cn("flex flex-col max-w-[75%]", isMe ? "ml-auto items-end" : "items-start")}>
              <span className="text-[10px] font-bold text-gray-400 dark:text-muted mb-0.5">{m.sender}</span>
              <div className={cn("px-4 py-2 rounded-2xl text-sm", isMe ? "bg-primary text-white rounded-br-md" : "bg-gray-100 dark:bg-surface text-gray-800 dark:text-foreground rounded-bl-md")}>
                {m.message}
              </div>
              <span className="text-[10px] text-gray-300 dark:text-muted mt-0.5">{new Date(m.createdAt).toLocaleTimeString()}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 mt-3">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Escribe un mensaje..."
          className="flex-1 px-4 py-3 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm"
        />
        <button onClick={send} disabled={!text.trim() || sending} className="bg-primary text-white px-4 py-3 rounded-xl hover:bg-primary/90 transition disabled:opacity-50">
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
