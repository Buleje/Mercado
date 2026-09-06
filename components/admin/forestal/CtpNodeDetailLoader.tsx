"use client";

/**
 * CtpNodeDetailLoader — abre la ficha completa de un nodo del radar.
 *
 * El grafo de trazabilidad sólo carga datos mínimos por nodo (para dibujar); la
 * ficha completa vive en los modales de cada sección, que piden el objeto
 * entero. Este loader trae ese objeto por id (de la misma API que alimenta cada
 * tabla — no clona queries) y monta el modal correcto: ingreso →
 * CtpEntryDetailModal, corrida → Producción, despacho → Despacho.
 */

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "@buleje/design-system/icons";
import CtpEntryDetailModal from "./CtpEntryDetailModal";
import CtpProduccionDetalleModal from "./CtpProduccionDetalleModal";
import CtpDespachoDetalleModal from "./CtpDespachoDetalleModal";
import type { WoodEntry } from "./ctp-shared";
import type { CtpEntry } from "./CtpSectionViews";

export type NodeKind = "ingreso" | "corrida" | "despacho";
export interface DetailTarget {
  kind: NodeKind;
  id: string;
  gtf?: string | null;
}

export default function CtpNodeDetailLoader({ target, onClose }: { target: DetailTarget; onClose: () => void }) {
  const [entry, setEntry] = useState<WoodEntry | CtpEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url =
          target.kind === "ingreso"
            ? `/api/admin/forestal/wood-entries?gtf=${encodeURIComponent(target.gtf ?? "")}&limit=100`
            : `/api/admin/forestal/ctp?section=${target.kind === "corrida" ? "produccion" : "despacho"}`;
        const r = await fetch(url, { credentials: "include" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const rows = ((await r.json()).entries ?? []) as (WoodEntry | CtpEntry)[];
        const found = rows.find((e) => e.id === target.id) ?? null;
        if (!alive) return;
        if (!found) setError("No se encontró la ficha (puede estar fuera del período o anulada).");
        else setEntry(found);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { alive = false; };
  }, [target]);

  if (error) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-[70] mx-auto flex max-w-md items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)] shadow-xl">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="flex-1"><strong>No se pudo abrir la ficha:</strong> {error}</div>
        <button type="button" onClick={onClose} className="shrink-0 text-xs font-bold underline">Cerrar</button>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30">
        <div className="flex items-center gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-4 text-sm font-bold text-[var(--text-primary)] shadow-xl">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" /> Abriendo la ficha…
        </div>
      </div>
    );
  }

  if (target.kind === "ingreso") return <CtpEntryDetailModal entry={entry as WoodEntry} onClose={onClose} />;
  if (target.kind === "corrida") return <CtpProduccionDetalleModal entry={entry as CtpEntry} onClose={onClose} />;
  return <CtpDespachoDetalleModal entry={entry as CtpEntry} onClose={onClose} />;
}
