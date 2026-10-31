"use client";

/**
 * ADR-119 + ADR-502 — Bloque "Documentos" para la ficha de una entidad.
 * Cliente/proveedor se enlazan por FK (`Document.customerId/supplierId`); las
 * entidades del cableado único (tercero/permiso/colaborador/trámite) por TAG
 * (`tagEntidad`, ver `lib/documentos/enlaces-entidad.ts`). Lado inverso del
 * picker del modal: ver/descargar sin salir de la ficha, y —en un tercero—
 * "Guardar estado de cuenta" archiva su cuenta corriente en PDF.
 */

import { useCallback, useEffect, useState } from "react";
import { FileText, Download, Clock, Plus, Loader2, ArrowUpRight, FolderArchive } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { getSignedDownloadUrl } from "@/hooks/use-documents";
import { csrfHeaders } from "@/lib/csrf-client";
import { type TipoEntidad, tagEntidad } from "@/lib/documentos/enlaces-entidad";
import { TAG_FOTO_ASISTENCIA } from "@/lib/rrhh/asistencia-fotos";
import type { DbDocument } from "@/lib/types/documents";
import { ExpedienteModal } from "./ExpedienteModal";
import type { FuenteDelModal } from "./expediente/use-expediente";

type Entity = "customer" | "supplier" | TipoEntidad;

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** La URL con la que se listan los documentos de la entidad. */
function urlDeDocumentos(entity: Entity, id: string): string {
  if (entity === "customer") return `/api/admin/documents?customerId=${encodeURIComponent(id)}`;
  if (entity === "supplier") return `/api/admin/documents?supplierId=${encodeURIComponent(id)}`;
  const base = `/api/admin/documents?tags=${encodeURIComponent(tagEntidad(entity, id))}`;
  // Colaborador comparte su tag (`colaborador:<id>`) con las fotos de asistencia
  // (una sola identidad, ADR-502): acá queremos sus PAGOS, no cada selfie diario.
  if (entity === "colaborador") return `${base}&excluir=${encodeURIComponent(TAG_FOTO_ASISTENCIA)}`;
  return base;
}

export function LinkedDocumentsSection({
  entity,
  id,
  nombre,
  estadoDeCuenta = false,
  reloadSignal,
  tag,
  titulo,
  abrirEnArchivo = true,
}: {
  entity?: Entity;
  id?: string;
  /** Nombre de la entidad (para archivar su estado de cuenta y el deep-link). */
  nombre?: string;
  /** En un tercero: muestra "Guardar estado de cuenta" (POST a /estado-cuenta). */
  estadoDeCuenta?: boolean;
  /** Al cambiar, vuelve a leer: para cuando algo de AFUERA archiva un documento
   *  de esta entidad (p. ej. «PDF al Drive» del trámite). */
  reloadSignal?: number;
  /** Modo tag crudo: lista por un tag arbitrario (p. ej. la semana de pagos del
   *  equipo). Mutuamente excluyente con entity/id. */
  tag?: string;
  /** Encabezado del bloque (por defecto «Documentos»). */
  titulo?: string;
  /** Muestra «Abrir en el Archivo» (deep-link al drive filtrado por el tag). */
  abrirEnArchivo?: boolean;
}) {
  const [docs, setDocs] = useState<DbDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [expediente, setExpediente] = useState<FuenteDelModal | null>(null);

  /** El tag que define qué documentos son de esta entidad/semana (ADR-502):
   *  lista inversa + deep-link al Archivo. Cliente/proveedor van por FK, no tag. */
  const tagActivo =
    tag ?? (entity && entity !== "customer" && entity !== "supplier" && id ? tagEntidad(entity, id) : null);

  const cargar = useCallback(async () => {
    const u = tag
      ? `/api/admin/documents?tags=${encodeURIComponent(tag)}`
      : entity && id
        ? urlDeDocumentos(entity, id)
        : null;
    if (!u) {
      setLoading(false);
      return;
    }
    try {
      const r = await fetch(u, { credentials: "include" });
      const d = r.ok ? await r.json() : { documents: [] };
      setDocs(d.documents ?? []);
    } catch {
      /* la ficha sigue funcionando sin documentos */
    } finally {
      setLoading(false);
    }
  }, [tag, entity, id]);

  useEffect(() => {
    void cargar();
  }, [cargar, reloadSignal]);

  function abrirEnElArchivo() {
    if (!tagActivo) return;
    const q = new URLSearchParams({ tab: "documentos", sub: "all", etiqueta: tagActivo });
    const label = titulo || nombre;
    if (label) q.set("et", label);
    window.location.href = `/admin?${q.toString()}`;
  }

  async function guardarEstadoDeCuenta() {
    if (guardando || !nombre || !id) return;
    setGuardando(true);
    try {
      const r = await fetch("/api/admin/documents/estado-cuenta", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ terceroId: id, nombre }),
      });
      if (r.ok) await cargar();
    } catch {
      /* la ficha sigue; el usuario puede reintentar */
    } finally {
      setGuardando(false);
    }
  }

  async function download(doc: DbDocument) {
    try {
      const { url, filename } = await getSignedDownloadUrl(doc.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      /* link no disponible */
    }
  }

  // «Armar expediente» con los papeles de la ficha (lo que ves es lo que entra),
  // sin los expedientes ya armados: el PDF nuevo lleva la etiqueta de la entidad
  // para aparecer acá, y no tiene que colarse en el siguiente.
  const papelesDelExpediente = docs.filter((d) => !d.tags?.includes("expediente"));

  // Sin documentos y sin acción: no mostramos el bloque (evita ruido en la ficha).
  if (!loading && docs.length === 0 && !estadoDeCuenta) return null;

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
          <FileText className="h-4 w-4 text-[var(--accent)]" /> {titulo ?? "Documentos"}
          {docs.length > 0 && (
            <span className="text-[length:var(--ts-2xs,11px)] tabular-nums font-bold px-1.5 py-0.5 rounded-md bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
              {docs.length}
            </span>
          )}
          {abrirEnArchivo && tagActivo && docs.length > 0 && (
            <button
              type="button"
              onClick={abrirEnElArchivo}
              className="inline-flex items-center gap-0.5 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--accent)] hover:underline"
              title="Ver todos estos documentos en el Archivo, con buscador y vista previa"
            >
              Abrir en el Archivo <ArrowUpRight className="h-3 w-3" />
            </button>
          )}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {papelesDelExpediente.length >= 2 && (
            <button
              type="button"
              onClick={() =>
                setExpediente({
                  tipo: "ids",
                  ids: papelesDelExpediente.map((d) => d.id),
                  nombre: nombre ?? titulo ?? undefined,
                  etiqueta: tagActivo ?? undefined,
                  customerId: entity === "customer" && id ? id : undefined,
                  supplierId: entity === "supplier" && id ? id : undefined,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              title="Un solo PDF con portada, índice y estos papeles en orden"
            >
              <FolderArchive className="h-3.5 w-3.5" aria-hidden /> Armar expediente
            </button>
          )}
          {estadoDeCuenta && (
            <button
              type="button"
              onClick={guardarEstadoDeCuenta}
              disabled={guardando || !nombre}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
            >
              {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Guardar estado de cuenta
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-9 bg-[var(--surface-sunken)] rounded-lg" />)}
        </div>
      ) : docs.length === 0 ? (
        <p className="text-xs text-[var(--text-tertiary)]">Aún no hay documentos archivados. «Guardar estado de cuenta» crea el primero.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => {
            const n = daysUntil(d.expiresAt);
            return (
              <li
                key={d.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-sunken)] shrink-0">
                  <FileText className="h-4 w-4 text-[var(--text-tertiary)]" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{d.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)] capitalize">{d.category} · {fmtBytes(d.size)}</span>
                    {n !== null && (
                      <span className={cn(
                        "inline-flex items-center gap-1 text-[length:var(--ts-2xs,11px)] font-bold px-1.5 py-0.5 rounded-md",
                        n < 0 ? "bg-[var(--data-error-50,#fef2f2)] text-[var(--data-error-600,#dc2626)]"
                          : n <= 7 ? "bg-[var(--data-error-50,#fef2f2)] text-[var(--data-error-600,#dc2626)]"
                          : n <= 30 ? "bg-[var(--data-warning-50,#fffbeb)] text-[var(--data-warning-700,#c93b2c)]"
                          : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                      )}>
                        <Clock className="h-3 w-3" />
                        {n < 0 ? "Vencido" : n === 0 ? "Vence hoy" : `Vence en ${n}d`}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => download(d)}
                  className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
                  aria-label={`Descargar ${d.name}`}
                  title="Descargar"
                >
                  <Download className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {expediente && (
        <ExpedienteModal fuente={expediente} aboveModals onClose={() => setExpediente(null)} onListo={() => void cargar()} />
      )}
    </div>
  );
}
