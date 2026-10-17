"use client";

import { m, AnimatePresence } from "@/components/admin/providers";
import { Bookmark, Trash2, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { diaYFecha, type NCTemplate } from "@/components/admin/notas-credito/nc-compartido";
import { revisarPlantilla } from "@/components/admin/notas-credito/nc-plantillas";

/**
 * Plantillas guardadas (F14, 17-10): nombre, motivo, alcance, versión y cuándo se guardó. Una que no sirve
 * para esta nota (motivo fuera del catálogo o que pide documento y no hay) se ve pero «Usar» queda apagado.
 */
export default function NcPlantillas({ templates, abierto, setAbierto, onUsar, onQuitar, conDocumento }: {
  templates: readonly NCTemplate[];
  abierto: boolean;
  setAbierto: (f: (v: boolean) => boolean) => void;
  onUsar: (t: NCTemplate) => void;
  onQuitar: (id: string) => void;
  conDocumento: boolean;
}) {
  if (templates.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2">
      <button type="button" onClick={() => setAbierto((s) => !s)} aria-expanded={abierto}
        className="flex min-h-12 w-full items-center gap-2 rounded-lg px-2 text-sm font-bold text-[var(--text-primary)]">
        <Bookmark className="h-4 w-4" aria-hidden />
        Mis plantillas ({templates.length})
        <span className="ml-auto text-sm text-[var(--text-secondary)]">{abierto ? "Ocultar" : "Ver"}</span>
      </button>
      <AnimatePresence>
        {abierto && (
          <m.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1 overflow-hidden">
            {templates.map((t) => {
              const { bloquea, aviso } = revisarPlantilla(t, conDocumento);
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-[var(--surface-raised)] px-3 py-2">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm text-[var(--text-primary)]">
                      <strong>{t.name}</strong> · {t.codigoMotivo} {t.descripcionMotivo}
                    </p>
                    <p className="text-sm text-[var(--text-tertiary)]">
                      v{t.version ?? 1}
                      {t.actualizada ? ` · ${diaYFecha(t.actualizada)}` : ""}
                      {t.alcance === "con-documento" ? " · pide el documento" : " · con o sin documento"}
                    </p>
                    {(bloquea || aviso) && (
                      <p className={cn("flex items-start gap-1 text-sm", bloquea ? "text-[var(--data-error-500)]" : "text-[var(--data-warning-ink)]")}>
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {bloquea ?? aviso}
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={() => onUsar(t)} disabled={!!bloquea}
                    className="min-h-12 shrink-0 rounded-xl px-3 text-sm font-bold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline">
                    Usar
                  </button>
                  <button type="button" onClick={() => onQuitar(t.id)} aria-label={`Quitar la plantilla ${t.name}`}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--data-error-500)] hover:bg-[var(--data-error-50)]">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </m.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
