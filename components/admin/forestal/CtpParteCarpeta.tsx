"use client";

import { useEffect, useState } from "react";
import { ArrowRight, FolderOpen, Star } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { hrefDe } from "@/lib/admin/enlaces-panel";
import { claveVinculo } from "@/lib/documentos/terceros-vinculo";
import { TAG_ESENCIAL } from "@/lib/documentos/esenciales";
import { logger } from "@/lib/logger";

interface CarpetaMin {
  id: string;
  name: string;
  tags?: string[] | null;
}

type Estado = { parteId: string; carpetas: CarpetaMin[] | null; fallo: boolean };

/** Esencial → su panel en Esenciales; si no, la carpeta en el Archivo. */
function hrefDeCarpeta(c: CarpetaMin): string | null {
  if ((c.tags ?? []).includes(TAG_ESENCIAL)) return `/admin?tab=documentos&vista=esenciales&esencial=${encodeURIComponent(c.id)}`;
  return hrefDe("carpeta", c.id);
}

/**
 * Desde la ficha de la comunidad, su carpeta (Brandon 24-10): las carpetas del
 * Archivo ligadas a esta parte (ADR-502, etiqueta `parte:<id>`). Sólo las que
 * el rol ve: la lista sale de `GET /api/admin/documents/folders`, que ya
 * filtra por rol y candado.
 */
export default function CtpParteCarpeta({ parteId }: { parteId: string }) {
  const [estado, setEstado] = useState<Estado>({ parteId: "", carpetas: null, fallo: false });

  useEffect(() => {
    const corte = new AbortController();
    const clave = claveVinculo("comunidad", parteId);
    fetch("/api/admin/documents/folders", { credentials: "include", signal: corte.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const cuerpo = (await r.json()) as { folders?: CarpetaMin[] };
        const ligadas = (cuerpo.folders ?? []).filter((c) => (c.tags ?? []).some((t) => t.trim().toLowerCase() === clave));
        setEstado({ parteId, carpetas: ligadas, fallo: false });
      })
      .catch((err: unknown) => {
        if (corte.signal.aborted) return;
        logger.warn("[forestal.parte] no trajo su carpeta del Archivo", { error: String(err) });
        setEstado({ parteId, carpetas: null, fallo: true });
      });
    return () => corte.abort();
  }, [parteId]);

  if (estado.parteId !== parteId) return <div className="h-12 animate-pulse rounded-xl bg-[var(--surface-sunken)]" aria-busy="true" />;
  if (estado.fallo || !estado.carpetas) return <p className="text-sm text-[var(--text-secondary)]">No se pudo ver su carpeta.</p>;
  if (estado.carpetas.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">Sin carpeta ligada. Lígala desde Documentos › Esenciales («Ligar a…»).</p>;
  }

  return (
    <ul className="grid gap-2" data-qa="parte-carpeta">
      {estado.carpetas.map((c) => {
        const esencial = (c.tags ?? []).includes(TAG_ESENCIAL);
        return (
          <li key={c.id}>
            <EnlacePanel
              href={hrefDeCarpeta(c)}
              apariencia="heredada"
              className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-[var(--rule-base)] px-3 py-2 text-left hover:border-[var(--accent)] hover:no-underline"
            >
              <FolderOpen className="h-5 w-5 shrink-0 text-[var(--accent-ink)]" />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">{c.name}</span>
              {esencial && (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--text-tertiary)]">
                  <Star className="h-4 w-4" /> Esencial
                </span>
              )}
              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
            </EnlacePanel>
          </li>
        );
      })}
    </ul>
  );
}
