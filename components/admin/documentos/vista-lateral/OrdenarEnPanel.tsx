"use client";

/**
 * «Ordenar» dentro del panel de vista previa (Brandon 31-10): mientras miras el
 * papel, dejarlo en su lugar sin abrir nada más.
 *
 * - La carpeta que sugirió la IA (sólo si el papel está suelto y la carpeta
 *   existe: la misma regla del aviso «N por ordenar»), con Mover o No.
 * - El vencimiento que la IA leyó del papel o sugirió, con Anotar: un
 *   vencimiento sin anotar es un aviso que nunca llega (el cron mira `expiresAt`).
 * - Poner la fecha a mano: ves «Fecha de caducidad 12/05/2030» en el DNI de la
 *   izquierda y la escribes acá mismo.
 * - Carpeta… y Etiquetas, con las ventanas de siempre.
 */

import { useState } from "react";
import { CalendarClock, Check, FolderInput, Loader2, Tag, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import type { DbDocument } from "@/lib/types/documents";
import type { ModeloArchivo } from "../archivo/use-archivo";

type Sugerencia = { folderId?: string; folderName?: string; expiresAt?: string };
type Leido = { fecha?: string; anotado?: boolean; motivo?: string };

const ddmmaaaa = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
/** Mediodía UTC: la fecha cae en el mismo día en Lima y en el servidor (igual que las sugerencias). */
const aIso = (fecha: string) => `${fecha}T12:00:00.000Z`;

const SECUNDARIO = button({ variant: "secondary", className: "gap-1.5 px-3" });
const ICONO = button({ variant: "secondary", size: "icon", className: "shrink-0" });
const PRIMARIO = button({ variant: "primary", className: "gap-1 px-3" });

export default function OrdenarEnPanel({ arch, doc, detalle }: { arch: ModeloArchivo; doc: DbDocument; detalle: DbDocument | null }) {
  const { folderById, aplicarSugerencia, descartarSugerencia, sugDescartadas, setMovingDoc, setTagDocId, patch } = arch;
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [fechaAMano, setFechaAMano] = useState<string | null>(null);

  const meta = (detalle ?? doc).ocrMetadata as { sugerencias?: Sugerencia | null; vencimientoLeido?: Leido | null } | null;
  const sug = meta?.sugerencias ?? null;
  const descartada = sugDescartadas.has(doc.id);
  const carpeta = !descartada && sug?.folderId && !doc.folderId && folderById.has(sug.folderId)
    ? { id: sug.folderId, nombre: folderById.get(sug.folderId)!.name }
    : null;
  // Lo leído del papel gana a lo sugerido; un comprobante (fecha de pago) no es vencimiento.
  const leido = meta?.vencimientoLeido;
  const venceLeido = leido?.fecha && !leido.anotado && leido.motivo !== "comprobante" ? leido.fecha : null;
  const vence = !doc.expiresAt && !descartada ? (venceLeido ?? sug?.expiresAt ?? null) : null;

  const hacer = async (clave: string, fn: () => Promise<unknown>) => {
    setOcupado(clave);
    try { await fn(); } finally { setOcupado(null); }
  };

  return (
    <div className="space-y-2 rounded-xl border border-[var(--rule-soft)] p-3">
      <p className="text-xs font-bold text-[var(--text-secondary)]">Ordenar</p>

      {carpeta && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/5 px-2 py-1.5">
          <FolderInput className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">Va a <b className="break-words">{carpeta.nombre}</b></span>
          <button type="button" disabled={!!ocupado} onClick={() => void hacer("carpeta", () => aplicarSugerencia(doc.id, { folderId: carpeta.id }))} className={PRIMARIO}>
            {ocupado === "carpeta" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Mover
          </button>
          <button type="button" onClick={() => descartarSugerencia(doc.id)} className={ICONO} aria-label="No, dejarlo donde está" title="No, dejarlo donde está">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {vence && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--data-warning-100)] px-2 py-1.5 text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 text-sm">Vence el <b>{ddmmaaaa(vence)}</b>{venceLeido ? " (leído del papel)" : " (sugerido)"}</span>
          <button type="button" disabled={!!ocupado} onClick={() => void hacer("vence", () => aplicarSugerencia(doc.id, { expiresAt: vence.length === 10 ? aIso(vence) : vence }))} className={PRIMARIO}>
            {ocupado === "vence" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Anotar
          </button>
        </div>
      )}

      {fechaAMano !== null ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={fechaAMano}
            onChange={(e) => setFechaAMano(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setFechaAMano(null); }}
            aria-label="Fecha de vencimiento"
            className="h-12 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            disabled={!fechaAMano || !!ocupado}
            onClick={() => void hacer("mano", async () => { await patch(doc.id, { expiresAt: aIso(fechaAMano) }); setFechaAMano(null); })}
            className={PRIMARIO}
          >
            {ocupado === "mano" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
          </button>
          {doc.expiresAt && (
            <button type="button" disabled={!!ocupado} onClick={() => void hacer("mano", async () => { await patch(doc.id, { expiresAt: null }); setFechaAMano(null); })} className={SECUNDARIO}>
              Quitar
            </button>
          )}
          <button type="button" onClick={() => setFechaAMano(null)} className={ICONO} aria-label="Cancelar">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMovingDoc(doc)} className={cn(SECUNDARIO, "flex-1")} title="Mover a otra carpeta">
            <FolderInput className="h-4 w-4" /> Carpeta…
          </button>
          <button type="button" onClick={() => setTagDocId(doc.id)} className={cn(SECUNDARIO, "flex-1")} title="Poner o quitar etiquetas">
            <Tag className="h-4 w-4" /> Etiquetas
          </button>
          <button type="button" onClick={() => setFechaAMano(doc.expiresAt?.slice(0, 10) ?? "")} className={cn(SECUNDARIO, "flex-1")} title="Poner o cambiar la fecha de vencimiento: avisa antes de que venza">
            <CalendarClock className="h-4 w-4" /> Vence…
          </button>
        </div>
      )}
    </div>
  );
}
