"use client";
import { CardTitle, SectionTitle } from "@buleje/design-system";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from "react";
import { Send, CheckCheck, Clock, Trash2, Bell } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type ShiftNote = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  read: boolean;
};

// ── Constants ────────────────────────────────────────────────────────────────

const LS_NOTES = "buleje_shift_notes";
const LS_USER = "buleje_shift_user";

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date().toDateString();
  if (d.toDateString() === today) {
    return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ShiftNotes() {
  const [notes, setNotes] = useState<ShiftNote[]>([]);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("Cajero");

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_NOTES);
      if (raw) setNotes(JSON.parse(raw));
      const savedUser = localStorage.getItem(LS_USER);
      if (savedUser) setAuthor(savedUser);
    } catch {}
  }, []);

  const saveNotes = (next: ShiftNote[]) => {
    setNotes(next);
    try {
      localStorage.setItem(LS_NOTES, JSON.stringify(next));
    } catch {}
  };

  const saveUser = (name: string) => {
    setAuthor(name);
    try {
      localStorage.setItem(LS_USER, name);
    } catch {}
  };

  const handleSend = () => {
    if (!text.trim()) return;
    const note: ShiftNote = {
      id: Date.now().toString(),
      author: author.trim() || "Cajero",
      text: text.trim(),
      createdAt: new Date().toISOString(),
      read: false,
    };
    const next = [note, ...notes].slice(0, 10);
    saveNotes(next);
    setText("");
  };

  const markAsRead = (id: string) => {
    saveNotes(notes.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = () => {
    saveNotes(notes.map((n) => ({ ...n, read: true })));
  };

  const removeNote = (id: string) => {
    saveNotes(notes.filter((n) => n.id !== id));
  };

  const unreadCount = notes.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <SectionTitle className="text-xl font-bold text-[var(--text-primary)]">
              Notas de Turno
            </SectionTitle>
            <p className="text-sm text-[var(--text-tertiary)]">
              Mensajes entre turnos del personal
            </p>
          </div>
          {unreadCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-[var(--data-warning-500)] px-3 py-1 text-xs font-bold text-white">
              <Bell className="h-3.5 w-3.5" />
              {unreadCount} nueva{unreadCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 text-sm text-primary hover:underline dark:text-[var(--data-success-500)]"
          >
            <CheckCheck className="h-4 w-4" />
            Marcar todo como leido
          </button>
        )}
      </div>

      {/* New note form */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-white p-5 dark:border-[var(--rule-base)] dark:bg-gray-900">
        <CardTitle className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
          Dejar una nota para el siguiente turno
        </CardTitle>

        {/* Author */}
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-[var(--text-tertiary)]">
            Tu nombre
          </label>
          <input
            value={author}
            onChange={(e) => saveUser(e.target.value)}
            placeholder="Ej: Maria, Juan cajero turno manana..."
            className="w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-white"
          />
        </div>

        {/* Text */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey) handleSend();
          }}
          rows={3}
          placeholder="Escribe aqui tu nota... (Ctrl+Enter para enviar)"
          className="w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-white"
        />

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-[var(--text-tertiary)]">
            {text.length}/500 caracteres
          </p>
          <button
            onClick={handleSend}
            disabled={!text.trim() || text.length > 500}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Enviar nota
          </button>
        </div>
      </div>

      {/* Notes list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-[var(--text-secondary)]">
            Notas recientes
          </CardTitle>
          <span className="text-xs text-[var(--text-tertiary)]">
            Mostrando las ultimas {notes.length} notas
          </span>
        </div>

        {notes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--rule-base)] py-10 text-center dark:border-[var(--rule-base)]">
            <Clock className="h-8 w-8 text-[var(--text-tertiary)] dark:text-[var(--text-primary)]" />
            <p className="text-sm text-[var(--text-tertiary)]">
              No hay notas de turno todavia. Escribe la primera nota arriba.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className={cn(
                  "group relative rounded-xl border p-4 transition",
                  note.read
                    ? "border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900"
                    : "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] dark:border-[var(--data-warning-500)]/30 dark:bg-[var(--data-warning-500)]/10"
                )}
              >
                {/* Unread dot */}
                {!note.read && (
                  <div className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-[var(--data-warning-500)]" />
                )}

                {/* Author & time */}
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    {(note.author[0] ?? "C").toUpperCase()}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {note.author}
                    </span>
                    <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                      {fmtDate(note.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Text */}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
                  {note.text}
                </p>

                {/* Actions */}
                <div className="mt-3 flex items-center gap-3">
                  {!note.read && (
                    <button
                      onClick={() => markAsRead(note.id)}
                      className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline dark:text-[var(--data-success-500)]"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Marcar como leido
                    </button>
                  )}
                  {note.read && (
                    <span className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                      <CheckCheck className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
                      Leido
                    </span>
                  )}
                  <button
                    onClick={() => removeNote(note.id)}
                    className="ml-auto flex items-center gap-1 text-xs text-[var(--text-tertiary)] opacity-0 transition-opacity hover:text-[var(--data-error-500)] group-hover:opacity-100 dark:text-[var(--text-secondary)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
