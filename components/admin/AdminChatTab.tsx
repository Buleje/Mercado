"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Send, Loader2, Users, ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Message = { id: string; sender: string; message: string; createdAt: string };
type Conversation = { phone: string; name: string; lastMessage: string; lastAt: string; unread: number };
type ChatMsg = { id: string; sender: "customer" | "admin"; message: string; createdAt: string };

export default function AdminChatTab() {
  const [tab, setTab] = useState<"internal" | "customers">("internal");
  const [expanded, setExpanded] = useState(false);
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

  // Customer chat state
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

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

  // Customer chat
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/chat");
      if (res.ok) setConvos(await res.json());
    } catch { /* */ }
  }, []);

  const fetchChatMessages = useCallback(async (phone: string) => {
    try {
      const res = await fetch(`/api/admin/chat?phone=${phone}`);
      if (res.ok) setChatMsgs(await res.json());
    } catch { /* */ }
  }, []);

  useEffect(() => {
    if (tab === "customers") fetchConversations();
  }, [tab, tick, fetchConversations]);

  useEffect(() => {
    if (activePhone) fetchChatMessages(activePhone);
  }, [activePhone, tick, fetchChatMessages]);

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);

  const sendChatReply = async () => {
    if (!chatText.trim() || !activePhone || chatSending) return;
    setChatSending(true);
    await fetch("/api/admin/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: activePhone, message: chatText.trim() }) });
    setChatText("");
    await fetchChatMessages(activePhone);
    setChatSending(false);
  };

  const totalUnread = convos.reduce((s, c) => s + c.unread, 0);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className={cn("flex flex-col min-h-100", expanded ? "fixed inset-0 z-50 bg-white dark:bg-card p-4" : "h-[calc(100vh-280px)]")}>
      {expanded && (
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200 dark:border-card-border">
          <h2 className="text-lg font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" /> Chat expandido
          </h2>
          <button onClick={() => setExpanded(false)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-surface transition-colors">
            <Minimize2 className="h-5 w-5 text-gray-500" />
          </button>
        </div>
      )}
      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><MessageSquare className="h-6 w-6 text-primary" />Chat</h2>
        <div className="ml-auto flex flex-wrap gap-1 bg-gray-100 dark:bg-surface rounded-xl p-1">
          <button onClick={() => setTab("internal")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition", tab === "internal" ? "bg-white dark:bg-card shadow text-primary" : "text-gray-500 dark:text-muted")}>
            Interno
          </button>
          <button onClick={() => { setTab("customers"); setActivePhone(null); }} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition relative", tab === "customers" ? "bg-white dark:bg-card shadow text-green-600" : "text-gray-500 dark:text-muted")}>
            <Users className="w-3.5 h-3.5 inline mr-1" />Clientes
            {totalUnread > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1">{totalUnread}</span>}
          </button>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition-colors text-gray-500 hover:text-primary"
          title={expanded ? "Minimizar" : "Expandir chat"}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Internal Chat */}
      {tab === "internal" && (
        <>
          <div className="flex-1 overflow-y-auto bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 space-y-3">
            {messages.length === 0 && <p className="text-center text-gray-400 dark:text-muted py-12">No hay mensajes aún. ¡Inicia la conversación!</p>}
            {messages.map(m => {
              const isMe = m.sender === sender;
              return (
                <div key={m.id} className={cn("flex flex-col max-w-[75%]", isMe ? "ml-auto items-end" : "items-start")}>
                  <span className="text-[10px] font-bold text-gray-400 dark:text-muted mb-0.5">{m.sender}</span>
                  <div className={cn("px-2 sm:px-4 py-1.5 sm:py-2 rounded-2xl text-sm", isMe ? "bg-primary text-white rounded-br-md" : "bg-gray-100 dark:bg-surface text-gray-800 dark:text-foreground rounded-bl-md")}>
                    {m.message}
                  </div>
                  <span className="text-[10px] text-gray-300 dark:text-muted mt-0.5">{new Date(m.createdAt).toLocaleTimeString()}</span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Escribe un mensaje..."
              className="flex-1 px-2 sm:px-4 py-2 sm:py-3 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm"
            />
            <button onClick={send} disabled={!text.trim() || sending} className="bg-primary text-white px-2 sm:px-4 py-2 sm:py-3 rounded-xl hover:bg-primary/90 transition disabled:opacity-50">
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </>
      )}

      {/* Customer Chat */}
      {tab === "customers" && !activePhone && (
        <div className="flex-1 overflow-y-auto bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
          {convos.length === 0 && <p className="text-center text-gray-400 dark:text-muted py-12">No hay conversaciones de clientes aún.</p>}
          {convos.map(c => (
            <button key={c.phone} onClick={() => setActivePhone(c.phone)}
              className="w-full flex flex-wrap items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-surface transition text-left border-b border-gray-100 dark:border-card-border last:border-0"
            >
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-green-700 dark:text-green-300 font-bold text-sm">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-gray-900 dark:text-foreground">{c.name}</span>
                  <span className="text-[10px] text-gray-400 dark:text-muted">{new Date(c.lastAt).toLocaleDateString("es-PE")}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-muted truncate">{c.lastMessage}</p>
              </div>
              {c.unread > 0 && <span className="min-w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">{c.unread}</span>}
            </button>
          ))}
        </div>
      )}

      {tab === "customers" && activePhone && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button onClick={() => setActivePhone(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition"><ArrowLeft className="w-4 h-4" /></button>
            <span className="font-semibold text-sm">{convos.find(c => c.phone === activePhone)?.name || activePhone}</span>
            <span className="text-xs text-gray-400 dark:text-muted">({activePhone})</span>
          </div>
          <div className="flex-1 overflow-y-auto bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 space-y-3">
            {chatMsgs.map(m => (
              <div key={m.id} className={cn("flex flex-col max-w-[75%]", m.sender === "admin" ? "ml-auto items-end" : "items-start")}>
                <div className={cn("px-2 sm:px-4 py-1.5 sm:py-2 rounded-2xl text-sm", m.sender === "admin" ? "bg-green-600 text-white rounded-br-md" : "bg-gray-100 dark:bg-surface text-gray-800 dark:text-foreground rounded-bl-md")}>
                  {m.message}
                </div>
                <span className="text-[10px] text-gray-300 dark:text-muted mt-0.5">{new Date(m.createdAt).toLocaleTimeString()}</span>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <input
              value={chatText}
              onChange={e => setChatText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatReply(); } }}
              placeholder="Responder al cliente..."
              className="flex-1 px-2 sm:px-4 py-2 sm:py-3 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm"
            />
            <button onClick={sendChatReply} disabled={!chatText.trim() || chatSending} className="bg-green-600 text-white px-2 sm:px-4 py-2 sm:py-3 rounded-xl hover:bg-green-700 transition disabled:opacity-50">
              {chatSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

