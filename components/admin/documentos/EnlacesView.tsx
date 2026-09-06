"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link2, Folder, FileText, Ban, Copy, Check, ExternalLink, Loader2, Lock, Eye, ShieldAlert,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbSharedLink } from "@/lib/types/documents";
import { fetchSharedLinks, revokeAllSharedLinks, revokeSharedLink } from "@/hooks/use-documents";

type Estado = "activo" | "vencido" | "revocado";

// Los tints --data-*-50 NO se remapean en dark dentro del panel: la variante
// `dark:` explícita es obligatoria. El alpha se mantiene bajo (/10) para que el
// chip no le coma contraste al texto — medido sobre pixeles, no a ojo.
const ESTADO_META: Record<Estado, { label: string; cls: string }> = {
  activo: {
    label: "Activo",
    cls: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/10 dark:text-[var(--data-success-500)]",
  },
  vencido: {
    label: "Vencido",
    cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]",
  },
  revocado: {
    label: "Cortado",
    cls: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
  },
};

function estadoDe(l: DbSharedLink): Estado {
  if (l.revokedAt) return "revocado";
  if (new Date(l.expiresAt).getTime() < Date.now()) return "vencido";
  return "activo";
}

/** Ruta pública del enlace: /d/ para documentos, /c/ para carpetas. */
function rutaDe(l: DbSharedLink): string {
  return l.kind === "folder" ? `/c/${l.token}` : `/d/${l.token}`;
}

function vigencia(l: DbSharedLink, estado: Estado): string {
  if (estado === "revocado") return "cortado a mano";
  const dias = Math.ceil((new Date(l.expiresAt).getTime() - Date.now()) / 86_400_000);
  if (estado === "vencido") return `vencido hace ${Math.abs(dias)} d`;
  if (dias <= 1) return "vence hoy";
  return `vence en ${dias} d`;
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

/**
 * Centro de enlaces compartidos: todo lo que hoy está publicado hacia afuera
 * (documentos y carpetas), quién lo abrió y el botón para cortarlo.
 */
export function EnlacesView({ onOpenDoc }: { onOpenDoc?: (docId: string) => void }) {
  const [links, setLinks] = useState<DbSharedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloActivos, setSoloActivos] = useState(true);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [cortando, setCortando] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchSharedLinks()
      .then(setLinks)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const activos = useMemo(() => links.filter((l) => estadoDe(l) === "activo"), [links]);
  const abiertos = useMemo(() => activos.filter((l) => !l.hasPassword).length, [activos]);
  const visibles = useMemo(
    () => (soloActivos ? activos : links),
    [soloActivos, activos, links]
  );

  const copiar = async (l: DbSharedLink) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${rutaDe(l)}`);
      setCopiado(l.id);
      setTimeout(() => setCopiado((prev) => (prev === l.id ? null : prev)), 1800);
    } catch (err) {
      console.warn("[enlaces] no se pudo copiar", err);
    }
  };

  const cortar = async (l: DbSharedLink) => {
    const que = l.kind === "folder" ? "de la carpeta" : "del documento";
    if (!confirm(`¿Cortar el enlace ${que} "${l.targetName}"?\n\nQuien lo tenga deja de ver el archivo al instante. No se puede reactivar: hay que compartirlo de nuevo.`)) return;
    setCortando(l.id);
    try {
      await revokeSharedLink(l.id, l.kind);
      setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, revokedAt: new Date().toISOString() } : x)));
    } catch (e) {
      alert(`No se pudo cortar el enlace: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCortando(null);
    }
  };

  const cortarTodos = async () => {
    if (activos.length === 0) return;
    if (!confirm(`¿Cortar los ${activos.length} enlaces activos?\n\nTodo lo que compartiste deja de abrirse al instante. Es irreversible.`)) return;
    setCortando("all");
    try {
      await revokeAllSharedLinks();
      load();
    } catch (e) {
      alert(`No se pudieron cortar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCortando(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-white p-10 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando enlaces…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] p-6 text-sm text-[var(--data-error)] dark:bg-[var(--data-error-500)]/15">
        No se pudieron cargar los enlaces: {error}
        <button onClick={load} className="ml-2 underline">Reintentar</button>
      </div>
    );
  }
  if (links.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-white p-10 text-center">
        <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"><Link2 className="h-7 w-7" /></div>
        <p className="text-lg font-extrabold text-[var(--text-primary)]">No compartiste nada todavía</p>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">Cuando mandes un documento o una carpeta por enlace, acá vas a ver quién puede abrirlo, cuántas veces lo abrieron y vas a poder cortarlo cuando quieras.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {abiertos > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-100)] p-4 text-sm text-[var(--data-warning)] dark:bg-[var(--data-warning-500)]/12">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            <span className="font-extrabold">{abiertos} {abiertos === 1 ? "enlace está abierto" : "enlaces están abiertos"}:</span>{" "}
            cualquiera que tenga el link ve el archivo sin pedir clave. Cortá los que ya no uses, o volvé a compartir poniéndoles una clave.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2.5">
          <p className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
            <Link2 className="h-3.5 w-3.5" /> {activos.length} {activos.length === 1 ? "enlace activo" : "enlaces activos"} de {links.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoloActivos((v) => !v)}
              className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-tertiary)] hover:bg-white hover:text-primary"
            >
              {soloActivos ? "Ver también los cortados" : "Ver solo los activos"}
            </button>
            <button onClick={load} className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-tertiary)] hover:bg-white hover:text-primary">Actualizar</button>
            {activos.length > 0 && (
              <button
                onClick={cortarTodos}
                disabled={cortando === "all"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--data-error-50)] px-2.5 py-1 text-xs font-bold text-[var(--data-error)] hover:bg-[var(--data-error-100)] disabled:opacity-50 dark:bg-[var(--data-error-500)]/10"
              >
                {cortando === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} Cortar todos
              </button>
            )}
          </div>
        </div>

        <ul className="divide-y divide-[var(--rule-soft)]">
          {visibles.map((l) => {
            const estado = estadoDe(l);
            const meta = ESTADO_META[estado];
            const Icono = l.kind === "folder" ? Folder : FileText;
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  l.kind === "folder"
                    ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "bg-primary/15 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                )}>
                  <Icono className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-bold text-[var(--text-primary)]">
                    {l.kind === "doc" && onOpenDoc ? (
                      <button
                        onClick={() => onOpenDoc(l.targetId)}
                        className="truncate text-left hover:underline"
                        title={`Abrir ${l.targetName} en el drive`}
                      >
                        {l.targetName}
                      </button>
                    ) : (
                      <span className="truncate" title={l.targetName}>{l.targetName}</span>
                    )}
                    {l.hasPassword && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]" title="Pide clave para abrirse">
                        <Lock className="h-3 w-3" /> con clave
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-[var(--text-tertiary)]">
                    <span>{l.kind === "folder" ? "Carpeta" : "Documento"}</span>
                    <span aria-hidden>·</span>
                    <span>{vigencia(l, estado)}</span>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{l.accessCount} {l.accessCount === 1 ? "apertura" : "aperturas"}</span>
                    {l.lastAccessAt && (<><span aria-hidden>·</span><span>última {fechaCorta(l.lastAccessAt)}</span></>)}
                    <span aria-hidden>·</span>
                    <span>por {l.createdById}</span>
                  </p>
                </div>

                <span className={cn("shrink-0 rounded-lg px-2 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wide", meta.cls)}>
                  {meta.label}
                </span>

                <div className="flex shrink-0 items-center gap-1">
                  {estado === "activo" && (
                    <>
                      <button onClick={() => copiar(l)} className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary" aria-label={`Copiar el enlace de ${l.targetName}`} title="Copiar el enlace">
                        {copiado === l.id ? <Check className="h-4 w-4 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" /> : <Copy className="h-4 w-4" />}
                      </button>
                      <a href={rutaDe(l)} target="_blank" rel="noopener noreferrer" className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary" aria-label={`Abrir el enlace de ${l.targetName}`} title="Abrir como lo ve quien lo recibe">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </>
                  )}
                  {estado !== "revocado" && (
                    <button
                      onClick={() => cortar(l)}
                      disabled={cortando === l.id}
                      className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error)] disabled:opacity-50"
                      aria-label={`Cortar el enlace de ${l.targetName}`}
                      title="Cortar el enlace"
                    >
                      {cortando === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
