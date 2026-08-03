"use client";
import { CardTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { StickyNote, Plus, Trash2, Pin, PinOff, Edit3, Check, X, Search } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { csrfHeaders } from "@/lib/csrf-client";

/* ── types ──────────────────────────────────────────────────── */
type Note = {
  id: string;
  title: string;
  content: string;
  color: NoteColor;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

type NoteColor = "yellow" | "green" | "blue" | "pink" | "purple" | "orange";

const COLOR_MAP: Record<NoteColor, { bg: string; border: string; darkBg: string; darkBorder: string }> = {
  yellow: { bg: "bg-[var(--data-warning-50)]", border: "border-[var(--data-warning-500)]", darkBg: "dark:bg-yellow-950/20", darkBorder: "dark:border-yellow-800" },
  green:  { bg: "bg-primary/10", border: "border-[var(--data-success-500)]/30", darkBg: "dark:bg-primary/15", darkBorder: "dark:border-[var(--data-success-500)]/30" },
  blue:   { bg: "bg-primary/10", border: "border-[var(--data-success-500)]/30", darkBg: "dark:bg-primary/15", darkBorder: "dark:border-[var(--data-success-500)]/30" },
  pink:   { bg: "bg-[var(--surface-sunken)]", border: "border-[var(--data-info-500)]", darkBg: "dark:bg-pink-950/20", darkBorder: "dark:border-pink-800" },
  purple: { bg: "bg-[var(--surface-sunken)]", border: "border-[var(--rule-base)]", darkBg: "dark:bg-primary/15", darkBorder: "dark:border-[var(--rule-base)]" },
  orange: { bg: "bg-[var(--data-warning-50)]", border: "border-[var(--data-warning-500)]", darkBg: "dark:bg-orange-950/20", darkBorder: "dark:border-orange-800" },
};

const COLOR_DOTS: Record<NoteColor, string> = {
  yellow: "bg-[var(--data-warning-500)]", green: "bg-primary/10", blue: "bg-primary/10",
  pink: "bg-[var(--data-info-500)]", purple: "bg-primary/10", orange: "bg-[var(--data-warning-500)]",
};

/* ── seed notes ─────────────────────────────────────────────── */
const INITIAL_NOTES: Note[] = [];

/* ── component ──────────────────────────────────────────────── */
export default function QuickNotesTab() {
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editColor, setEditColor] = useState<NoteColor>("yellow");
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newColor, setNewColor] = useState<NoteColor>("yellow");

  // Load notes from API on mount
  useEffect(() => {
    let active = true;
    fetch("/api/notes")
      .then(r => r.ok ? r.json() : [])
      .then((data: Note[]) => {
        if (active) {
          setNotes(data.map(n => ({
            ...n,
            createdAt: n.createdAt?.slice(0, 16).replace("T", " ") ?? "",
            updatedAt: n.updatedAt?.slice(0, 16).replace("T", " ") ?? "",
          })));
        }
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = notes
    .filter(n => !search || n.title.toLowerCase().includes(search.toLowerCase()) || n.content.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim(), color: newColor, pinned: false }),
      });
      if (res.ok) {
        const n = await res.json();
        setNotes(prev => [{ ...n, createdAt: n.createdAt.slice(0, 16).replace("T", " "), updatedAt: n.updatedAt.slice(0, 16).replace("T", " ") }, ...prev]);
        toast.success("Nota creada");
      } else { toast.error("Error al crear la nota"); }
    } catch { toast.error("Error al crear la nota"); }
    setNewTitle(""); setNewContent(""); setNewColor("yellow"); setShowNew(false);
  };

  const handleDelete = async (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    try {
      await fetch(`/api/notes?id=${id}`, { method: "DELETE", headers: csrfHeaders() });
      toast.success("Nota eliminada");
    } catch { toast.error("Error al eliminar la nota"); }
  };

  const handlePin = async (id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const newPinned = !note.pinned;
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: newPinned } : n));
    try {
      await fetch(`/api/notes?id=${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pinned: newPinned }),
      });
    } catch { toast.error("Error al actualizar la nota"); }
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id); setEditTitle(note.title); setEditContent(note.content); setEditColor(note.color);
  };

  const saveEdit = async () => {
    if (!editingId || !editTitle.trim()) return;
    const now = new Date().toISOString().slice(0, 16).replace("T", " ");
    setNotes(prev => prev.map(n => n.id === editingId ? { ...n, title: editTitle.trim(), content: editContent.trim(), color: editColor, updatedAt: now } : n));
    try {
      await fetch(`/api/notes?id=${editingId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ title: editTitle.trim(), content: editContent.trim(), color: editColor }),
      });
      toast.success("Nota guardada");
    } catch { toast.error("Error al guardar la nota"); }
    setEditingId(null);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <AdminModuleHeader
        title="Notas Rápidas"
        description="Apuntes, recordatorios y pendientes del día a día"
        icon={StickyNote}
        noBorder
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar notas..." className="pl-9 pr-4 py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm outline-none focus:border-primary w-48" />
          </div>
          <button onClick={() => setShowNew(true)} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Nueva nota
          </button>
        </div>
      </AdminModuleHeader>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <span className="text-[var(--text-secondary)] dark:text-muted">{notes.length} notas</span>
        <span className="text-[var(--data-warning-500)] font-semibold">{notes.filter(n => n.pinned).length} fijadas</span>
      </div>

      {/* Notes grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-surface rounded-full w-3/4 mb-3" />
              <div className="space-y-2 mb-4">
                <div className="h-3 bg-gray-100 dark:bg-surface/60 rounded-full w-full" />
                <div className="h-3 bg-gray-100 dark:bg-surface/60 rounded-full w-5/6" />
                <div className="h-3 bg-gray-100 dark:bg-surface/60 rounded-full w-2/3" />
              </div>
              <div className="h-2.5 bg-gray-100 dark:bg-surface/60 rounded-full w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
            {/* New note card */}
            {showNew && (
              <div className="bg-[var(--surface-raised)] rounded-xl border-2 border-primary/50 p-4">
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Título de la nota..." className="w-full text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-transparent outline-none mb-2 placeholder:text-[var(--text-tertiary)]" autoFocus />
                <textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Contenido..." rows={3} className="w-full text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-transparent outline-none resize-none mb-3 placeholder:text-[var(--text-tertiary)]" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {(Object.keys(COLOR_DOTS) as NoteColor[]).map(c => (
                      <button key={c} onClick={() => setNewColor(c)} className={cn("w-5 h-5 rounded-full border-2 transition-transform", COLOR_DOTS[c], newColor === c ? "border-gray-900 dark:border-white scale-125" : "border-transparent")} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => { setShowNew(false); setNewTitle(""); setNewContent(""); }} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-gray-100 dark:hover:bg-accent"><X className="h-4 w-4" /></button>
                    <button onClick={handleAdd} disabled={!newTitle.trim()} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50"><Check className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            )}

            {/* Note cards */}
            {filtered.map(note => {
              const colors = COLOR_MAP[note.color];
              const isEditing = editingId === note.id;
              return (
                <div key={note.id} className={cn("rounded-xl border p-4 transition-shadow hover:shadow-[var(--shadow-sm)]", colors.bg, colors.border, colors.darkBg, colors.darkBorder)}>
                  {isEditing ? (
                    <>
                      <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-transparent outline-none mb-2" />
                      <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3} className="w-full text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-transparent outline-none resize-none mb-3" />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {(Object.keys(COLOR_DOTS) as NoteColor[]).map(c => (
                            <button key={c} onClick={() => setEditColor(c)} className={cn("w-5 h-5 rounded-full border-2 transition-transform", COLOR_DOTS[c], editColor === c ? "border-gray-900 dark:border-white scale-125" : "border-transparent")} />
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-gray-100 dark:hover:bg-accent"><X className="h-4 w-4" /></button>
                          <button onClick={saveEdit} className="p-1.5 rounded-lg bg-primary text-white hover:bg-primary/90"><Check className="h-4 w-4" /></button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-2">
                        <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm leading-snug pr-2">{note.title}</CardTitle>
                        <button onClick={() => handlePin(note.id)} className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-warning-500)] transition-colors shrink-0">
                          {note.pinned ? <Pin className="h-3.5 w-3.5 text-[var(--data-warning-500)]" /> : <PinOff className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] dark:text-muted leading-relaxed mb-3 line-clamp-4">{note.content}</p>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{note.updatedAt}</p>
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(note)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-primary hover:bg-white/50 dark:hover:bg-accent transition-colors"><Edit3 className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDelete(note.id)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-white/50 dark:hover:bg-accent transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && !showNew && (
            <div className="text-center py-12">
              <StickyNote className="h-12 w-12 text-[var(--text-tertiary)] dark:text-muted mx-auto mb-3" />
              <p className="text-[var(--text-tertiary)] dark:text-muted font-semibold">No hay notas{search ? " que coincidan" : ""}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
