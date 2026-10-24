"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Link2, Folder, FileText, Ban, Copy, ExternalLink, Loader2, Lock, Eye, ShieldAlert,
  MoreHorizontal, RefreshCw,
} from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ActionMenu } from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import type { DbSharedLink } from "@/lib/types/documents";
import { fetchSharedLinks, revokeAllSharedLinks, revokeSharedLink } from "@/hooks/use-documents";
import { formatDateShort } from "@/lib/format";

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
  return formatDateShort(iso);
}

/**
 * Centro de enlaces compartidos: todo lo que hoy está publicado hacia afuera
 * (documentos y carpetas), quién lo abrió y el botón para cortarlo.
 */
export function EnlacesView({ onOpenDoc }: { onOpenDoc?: (docId: string) => void }) {
  const { confirm } = useConfirm();
  const [links, setLinks] = useState<DbSharedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloActivos, setSoloActivos] = useState(true);
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
      toast.success("Enlace copiado");
    } catch (err) {
      console.warn("[enlaces] no se pudo copiar", err);
    }
  };

  const cortar = async (l: DbSharedLink) => {
    const que = l.kind === "folder" ? "de la carpeta" : "del documento";
    if (!(await confirm({
      title: `¿Cortar el enlace ${que} "${l.targetName}"?`,
      description: "Quien lo tenga deja de ver el archivo al instante. No se puede reactivar: hay que compartirlo de nuevo.",
      intent: "danger",
      confirmLabel: "Sí, cortar",
    }))) return;
    setCortando(l.id);
    try {
      await revokeSharedLink(l.id, l.kind);
      setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, revokedAt: new Date().toISOString() } : x)));
    } catch (e) {
      toast.error(`No se pudo cortar el enlace: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCortando(null);
    }
  };

  const cortarTodos = async () => {
    if (activos.length === 0) return;
    if (!(await confirm({
      title: `¿Cortar los ${activos.length} enlaces activos?`,
      description: "Todo lo que compartiste deja de abrirse al instante. Es irreversible.",
      intent: "danger",
      confirmLabel: "Sí, cortar todos",
    }))) return;
    setCortando("all");
    try {
      await revokeAllSharedLinks();
      load();
    } catch (e) {
      toast.error(`No se pudieron cortar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCortando(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-10 text-sm text-[var(--text-tertiary)]">
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
      <div className="rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-10 text-center">
        <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"><Link2 className="h-7 w-7" /></div>
        <p className="text-lg font-extrabold text-[var(--text-primary)]">No compartiste nada todavía</p>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">Cuando mandes un documento o una carpeta por enlace, acá vas a ver quién puede abrirlo, cuántas veces lo abrieron y vas a poder cortarlo cuando quieras.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {abiertos > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-100)] px-4 py-2.5 text-sm text-[var(--data-warning)] dark:bg-[var(--data-warning-500)]/12">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <p className="min-w-0 flex-1 font-extrabold">
            {abiertos} {abiertos === 1 ? "enlace abierto" : "enlaces abiertos"}, sin clave
          </p>
          <InfoTip
            title="Enlaces sin clave"
            what="Cualquiera que tenga el link ve el archivo sin pedir clave."
            affects="Corta los que ya no uses, o vuelve a compartir poniéndoles una clave."
          />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2">
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)]">
            <Link2 className="h-4 w-4" /> {activos.length} {activos.length === 1 ? "activo" : "activos"} de {links.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoloActivos((v) => !v)}
              aria-pressed={!soloActivos}
              className="h-12 rounded-xl px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-primary"
            >
              {soloActivos ? "Ver cortados" : "Solo activos"}
            </button>
            <ActionMenu
              label="Más"
              icon={MoreHorizontal}
              soloIcono
              size="md"
              className="w-12 shrink-0"
              title="Actualizar y cortar todos"
              actions={[
                { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: load },
                ...(activos.length > 0
                  ? [{ id: "cortar-todos", label: "Cortar todos", hint: "Todo lo compartido deja de abrirse", icon: Ban, tone: "danger" as const, busy: cortando === "all", disabled: cortando === "all", onSelect: () => void cortarTodos() }]
                  : []),
              ]}
            />
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
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-[var(--text-tertiary)]" title={`${l.kind === "folder" ? "Carpeta" : "Documento"} · compartido por ${l.createdById}`}>
                    <span>{vigencia(l, estado)}</span>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{l.accessCount} {l.accessCount === 1 ? "apertura" : "aperturas"}</span>
                    {l.lastAccessAt && (<><span aria-hidden>·</span><span>última {fechaCorta(l.lastAccessAt)}</span></>)}
                  </p>
                </div>

                <span className={cn("shrink-0 rounded-lg px-2 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wide", meta.cls)}>
                  {meta.label}
                </span>

                <div className="flex shrink-0 items-center gap-1">
                  {estado !== "revocado" && (
                    <ActionMenu
                      label={`Más de ${l.targetName}`}
                      icon={MoreHorizontal}
                      soloIcono
                      size="md"
                      className="w-12 shrink-0"
                      title="Copiar, abrir o cortar el enlace"
                      actions={[
                        ...(estado === "activo"
                          ? [{ id: "copiar", label: "Copiar el enlace", icon: Copy, onSelect: () => void copiar(l) }, { id: "abrir", label: "Abrir como lo ve quien lo recibe", icon: ExternalLink, onSelect: () => { window.open(rutaDe(l), "_blank", "noopener,noreferrer"); } }]
                          : []),
                        { id: "cortar", label: "Cortar el enlace", icon: Ban, tone: "danger" as const, busy: cortando === l.id, disabled: cortando === l.id, onSelect: () => void cortar(l) },
                      ]}
                    />
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
