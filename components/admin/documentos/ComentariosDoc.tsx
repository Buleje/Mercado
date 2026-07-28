"use client";

/**
 * ComentariosDoc — las observaciones sobre el documento, junto al documento.
 *
 * Revisar un contrato entre dos personas terminaba en WhatsApp ("fijate la
 * cláusula 4"): lejos del archivo, sin quedar registrado y perdido a la semana.
 * Acá la observación vive con el documento y la ve quien lo abra, con quién la
 * dejó y cuándo. Lo atendido se marca resuelto en vez de borrarse: al mes
 * siguiente importa saber que se revisó, no que alguien escribió algo.
 */

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Check, Loader2, RotateCcw, User, Trash2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

interface Comentario {
  id: string;
  autor: string;
  texto: string;
  creadoEn: string;
  resueltoPor?: string | null;
  resueltoEn?: string | null;
}

function cuando(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

export default function ComentariosDoc({ docId }: { docId: string }) {
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [verResueltos, setVerResueltos] = useState(false);

  const base = `/api/admin/documents/${docId}/comentarios`;

  const cargar = useCallback(() => {
    setCargando(true);
    fetch(base, { credentials: "include", headers: csrfHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setComentarios(d.comentarios ?? []))
      .catch(() => setComentarios([]))
      .finally(() => setCargando(false));
  }, [base]);
  useEffect(() => { cargar(); }, [cargar]);

  const comentar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      const r = await fetch(base, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ texto: t }),
      });
      if (r.ok) {
        const d = await r.json();
        setComentarios(d.comentarios ?? []);
        setTexto("");
      }
    } finally {
      setEnviando(false);
    }
  };

  const borrar = async (id: string) => {
    if (!confirm("¿Borrar esta observación?")) return;
    const r = await fetch(`${base}?comentarioId=${encodeURIComponent(id)}`, {
      method: "DELETE", credentials: "include", headers: csrfHeaders(),
    });
    if (r.ok) setComentarios((await r.json()).comentarios ?? []);
  };

  const resolver = async (id: string, resuelto: boolean) => {
    const r = await fetch(base, {
      method: "PATCH",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ comentarioId: id, resuelto }),
    });
    if (r.ok) setComentarios((await r.json()).comentarios ?? []);
  };

  const abiertos = comentarios.filter((c) => !c.resueltoEn);
  const resueltos = comentarios.filter((c) => c.resueltoEn);
  const visibles = verResueltos ? comentarios : abiertos;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-5">
      <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          <MessageCircle className="h-4 w-4 text-primary" /> Dejar una observación
        </p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) comentar(); }}
          rows={3}
          placeholder="Ej.: falta la firma del arrendador en la página 3"
          className="w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Ctrl + Enter para publicar</span>
          <button
            onClick={comentar}
            disabled={!texto.trim() || enviando}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Publicar
          </button>
        </div>
      </section>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-extrabold text-[var(--text-primary)]">{abiertos.length}</span>{" "}
          {abiertos.length === 1 ? "observación abierta" : "observaciones abiertas"}
          {resueltos.length > 0 && ` · ${resueltos.length} resuelta${resueltos.length === 1 ? "" : "s"}`}
        </p>
        {resueltos.length > 0 && (
          <button
            onClick={() => setVerResueltos((v) => !v)}
            className="text-xs font-bold text-[var(--text-tertiary)] hover:text-primary"
          >
            {verResueltos ? "Ver solo las abiertas" : "Ver también las resueltas"}
          </button>
        )}
      </div>

      {cargando ? (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </p>
      ) : visibles.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
          Nadie dejó observaciones sobre este documento.
        </p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((c) => (
            <li
              key={c.id}
              className={cn(
                "rounded-2xl border p-3",
                c.resueltoEn
                  ? "border-[var(--rule-soft)] bg-[var(--surface-sunken)] opacity-75"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)]",
              )}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-sm font-bold text-[var(--text-primary)]">
                  <User className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /> {c.autor}
                </span>
                <span className="text-xs text-[var(--text-tertiary)]">{cuando(c.creadoEn)}</span>
                {c.resueltoEn && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--data-success-50)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]">
                    <Check className="h-3 w-3" /> resuelta por {c.resueltoPor}
                  </span>
                )}
                <button
                  onClick={() => resolver(c.id, !c.resueltoEn)}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary"
                >
                  {c.resueltoEn ? <><RotateCcw className="h-3.5 w-3.5" /> Reabrir</> : <><Check className="h-3.5 w-3.5" /> Marcar resuelta</>}
                </button>
                <button
                  onClick={() => borrar(c.id)}
                  title="Borrar la observación (sólo la tuya)"
                  aria-label="Borrar la observación"
                  className="rounded-lg p-1 text-[var(--text-tertiary)] hover:text-[var(--data-error)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{c.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
