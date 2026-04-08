"use client";

import { useRef, useState } from "react";
import { Send, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageComposerProps {
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageComposer({
  onSend,
  disabled = false,
  placeholder = "Escribí tu respuesta…",
}: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setBody("");
      // Refocus
      textareaRef.current?.focus();
    } catch (err) {
      console.error("[MessageComposer] send failed", err);
      window.alert("No se pudo enviar el mensaje. Reintentá.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter → send, Shift+Enter → newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-end gap-2">
        <button
          type="button"
          disabled
          title="Adjuntos (próximamente)"
          className="rounded-full p-2 text-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
          <span className="sr-only">Adjuntar archivo</span>
        </button>

        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || sending}
          rows={1}
          maxLength={4000}
          className={cn(
            "flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm",
            "focus:border-[#00B4A6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/20",
            "dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-900",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
          style={{ minHeight: "40px", maxHeight: "140px" }}
          aria-label="Escribir mensaje"
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || sending || !body.trim()}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full transition",
            "bg-[#00B4A6] text-white hover:bg-[#00B4A6]/90 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40",
            "disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700",
          )}
          aria-label="Enviar mensaje"
        >
          <Send className={cn("h-4 w-4", sending && "animate-pulse")} />
        </button>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
        <span>Enter para enviar · Shift+Enter para salto de línea</span>
        <span>{body.length}/4000</span>
      </div>
    </div>
  );
}
