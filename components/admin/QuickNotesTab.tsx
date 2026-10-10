"use client";
import { CardTitle, EmptyState, LoadingState } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { StickyNote, Plus, Trash2, Pin, Edit3, Check, Search } from "@buleje/design-system/icons";
import TituloDeVista from "@/components/admin/rrhh/TituloDeVista";
import BotonIconoTip from "@/components/admin/shared/boton-icono-tip";
import { button } from "@/components/ui-system/button-variants";
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

/**
 * Un color por nota, con el MISMO token en la tarjeta y en su punto. Antes
 * «green», «blue» y «purple» pintaban el mismo `bg-primary/10` (tres puntos
 * iguales, casi blancos) y el oscuro usaba `yellow-950`/`pink-950` crudos.
 * Las claves son las guardadas en la base: no cambian, sólo cómo se ven
 * (el DS no tiene naranja: «orange» es gris).
 */
const PALETA: Record<NoteColor, { nombre: string; tarjeta: string; punto: string }> = {
  yellow: { nombre: "Amarillo", tarjeta: "bg-[var(--data-warning-500)]/10 border-[var(--data-warning-500)]/40", punto: "bg-[var(--data-warning-500)]" },
  green: { nombre: "Turquesa", tarjeta: "bg-[var(--data-5)]/10 border-[var(--data-5)]/40", punto: "bg-[var(--data-5)]" },
  blue: { nombre: "Azul", tarjeta: "bg-[var(--data-6)]/10 border-[var(--data-6)]/40", punto: "bg-[var(--data-6)]" },
  pink: { nombre: "Rojo", tarjeta: "bg-[var(--data-error-500)]/10 border-[var(--data-error-500)]/40", punto: "bg-[var(--data-error-500)]" },
  purple: { nombre: "Morado", tarjeta: "bg-[var(--data-8)]/10 border-[var(--data-8)]/40", punto: "bg-[var(--data-8)]" },
  orange: { nombre: "Gris", tarjeta: "bg-[var(--surface-sunken)] border-[var(--rule-base)]", punto: "bg-[var(--data-3)]" },
};
const COLORES = Object.keys(PALETA) as NoteColor[];

/** Los puntos para elegir el color: 32 px de dedo, nombre en el lector y el elegido marcado. */
function ElegirColor({ valor, onChange }: { valor: NoteColor; onChange: (c: NoteColor) => void }) {
  return (
    <div role="group" aria-label="Color de la nota" className="flex items-center">
      {COLORES.map((c) => (
        <button key={c} type="button" aria-label={PALETA[c].nombre} aria-pressed={valor === c} title={PALETA[c].nombre} onClick={() => onChange(c)} className="grid h-8 w-8 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          <span aria-hidden className={cn("h-5 w-5 rounded-full border-2", PALETA[c].punto, valor === c ? "border-[var(--text-primary)] ring-2 ring-[var(--surface-raised)]" : "border-transparent")} />
        </button>
      ))}
    </div>
  );
}

/** Abajo del editor (nueva o editando): el color a la izquierda, Cancelar y Guardar a la derecha. */
function PieDeEditor({ color, onColor, onCancelar, onGuardar, puedeGuardar }: { color: NoteColor; onColor: (c: NoteColor) => void; onCancelar: () => void; onGuardar: () => void; puedeGuardar: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <ElegirColor valor={color} onChange={onColor} />
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={onCancelar} className={button({ variant: "ghost", className: "px-4" })}>Cancelar</button>
        <button type="button" onClick={onGuardar} disabled={!puedeGuardar} className={button({ variant: "accent", className: "px-4" })}>
          <Check className="h-4 w-4" aria-hidden /> Guardar
        </button>
      </div>
    </div>
  );
}

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
      if (!res.ok) {
        toast.error(`No se pudo crear la nota (error ${res.status})`);
        return;
      }
      const n = await res.json();
      setNotes(prev => [{ ...n, createdAt: n.createdAt.slice(0, 16).replace("T", " "), updatedAt: n.updatedAt.slice(0, 16).replace("T", " ") }, ...prev]);
      toast.success("Nota creada");
      setNewTitle(""); setNewContent(""); setNewColor("yellow"); setShowNew(false);
    } catch {
      toast.error("Error al crear la nota — revisa tu conexión.");
    }
  };

  const handleDelete = async (id: string) => {
    const previous = notes;
    setNotes(prev => prev.filter(n => n.id !== id));
    try {
      const res = await fetch(`/api/notes?id=${id}`, { method: "DELETE", headers: csrfHeaders() });
      if (!res.ok) {
        setNotes(previous);
        toast.error(`No se pudo eliminar la nota (error ${res.status})`);
        return;
      }
      toast.success("Nota eliminada");
    } catch {
      setNotes(previous);
      toast.error("Error al eliminar la nota — revisa tu conexión.");
    }
  };

  const handlePin = async (id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const newPinned = !note.pinned;
    const previous = notes;
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: newPinned } : n));
    try {
      const res = await fetch(`/api/notes?id=${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pinned: newPinned }),
      });
      if (!res.ok) {
        setNotes(previous);
        toast.error(`No se pudo actualizar la nota (error ${res.status})`);
      }
    } catch {
      setNotes(previous);
      toast.error("Error al actualizar la nota — revisa tu conexión.");
    }
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id); setEditTitle(note.title); setEditContent(note.content); setEditColor(note.color);
  };

  const saveEdit = async () => {
    if (!editingId || !editTitle.trim()) return;
    const now = new Date().toISOString().slice(0, 16).replace("T", " ");
    const previous = notes;
    setNotes(prev => prev.map(n => n.id === editingId ? { ...n, title: editTitle.trim(), content: editContent.trim(), color: editColor, updatedAt: now } : n));
    try {
      const res = await fetch(`/api/notes?id=${editingId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ title: editTitle.trim(), content: editContent.trim(), color: editColor }),
      });
      if (!res.ok) {
        setNotes(previous);
        toast.error(`No se pudo guardar la nota (error ${res.status})`);
        return;
      }
      toast.success("Nota guardada");
      setEditingId(null);
    } catch {
      setNotes(previous);
      toast.error("Error al guardar la nota — revisa tu conexión.");
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* El título de la vista con el buscador y la acción principal en la
          misma fila (Equipo › Notas; antes, AdminModuleHeader con subtítulo). */}
      <TituloDeVista
        titulo="Apuntes y recordatorios"
        ayuda={{
          what: "Notas rápidas del equipo: recordatorios, pendientes y avisos del turno.",
          affects: "Las fijadas van primero. Las ve todo el que entra a Equipo › Notas.",
          example: "«Llega el camión de gaseosas el lunes a las 7»: la fijas y nadie se olvida.",
        }}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar notas" aria-label="Buscar notas" className="pl-9 pr-4 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm outline-none focus:border-primary w-48" />
        </div>
        <button type="button" onClick={() => setShowNew(true)} className={button({ variant: "accent" })}>
          <Plus className="h-4 w-4" aria-hidden /> Nueva nota
        </button>
      </TituloDeVista>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <span className="text-[var(--text-secondary)] dark:text-muted">{notes.length} notas</span>
        <span className="text-[var(--data-warning-ink)] font-semibold">{notes.filter(n => n.pinned).length} fijadas</span>
      </div>

      {/* Notes grid */}
      {loading ? (
        <LoadingState message="Cargando las notas..." />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
            {/* New note card */}
            {showNew && (
              <div className="bg-[var(--surface-raised)] rounded-xl border-2 border-primary/50 p-4">
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Título de la nota" aria-label="Título de la nota" className="w-full text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-transparent outline-none mb-2 placeholder:text-[var(--text-tertiary)]" autoFocus />
                <textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Contenido" aria-label="Contenido de la nota" rows={3} className="w-full text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-transparent outline-none resize-none mb-3 placeholder:text-[var(--text-tertiary)]" />
                <PieDeEditor color={newColor} onColor={setNewColor} onCancelar={() => { setShowNew(false); setNewTitle(""); setNewContent(""); }} onGuardar={handleAdd} puedeGuardar={!!newTitle.trim()} />
              </div>
            )}

            {/* Note cards */}
            {filtered.map(note => {
              const isEditing = editingId === note.id;
              return (
                <div key={note.id} className={cn("rounded-xl border p-4 transition-shadow hover:shadow-[var(--shadow-sm)]", PALETA[note.color]?.tarjeta ?? PALETA.yellow.tarjeta)}>
                  {isEditing ? (
                    <>
                      <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} aria-label="Título de la nota" className="w-full text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-transparent outline-none mb-2" />
                      <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3} aria-label="Contenido de la nota" className="w-full text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-transparent outline-none resize-none mb-3" />
                      <PieDeEditor color={editColor} onColor={setEditColor} onCancelar={() => setEditingId(null)} onGuardar={saveEdit} puedeGuardar={!!editTitle.trim()} />
                    </>
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-2">
                        <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm leading-snug pr-2">{note.title}</CardTitle>
                        <BotonIconoTip
                          label={note.pinned ? "Quitar de fijadas" : "Fijar nota"}
                          icon={Pin}
                          aria-pressed={note.pinned}
                          tamano="sm"
                          onClick={() => handlePin(note.id)}
                          className={note.pinned ? "text-[var(--data-warning-ink)]" : undefined}
                        />
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] dark:text-muted leading-relaxed mb-3 line-clamp-4">{note.content}</p>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{note.updatedAt}</p>
                        <div className="flex items-center gap-1">
                          <BotonIconoTip label="Editar" icon={Edit3} tamano="sm" onClick={() => startEdit(note)} />
                          <BotonIconoTip label="Eliminar" icon={Trash2} tamano="sm" tono="peligro" onClick={() => handleDelete(note.id)} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && !showNew && (
            <EmptyState icon={StickyNote} title={search ? `Ninguna nota coincide con «${search}»` : "Todavía no hay notas"} />
          )}
        </>
      )}
    </div>
  );
}
