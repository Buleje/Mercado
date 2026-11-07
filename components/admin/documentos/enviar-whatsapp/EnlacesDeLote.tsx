"use client";

import { Link2, Loader2, Check, FileWarning } from "@buleje/design-system/icons";
import { LIMITE_LOTE } from "./compartido";
import type { EstadoEnviar } from "./use-enviar-whatsapp";
export default function EnlacesDeLote({ arch }: { arch: EstadoEnviar }) {
  const { via, multi, creating, listos, docs, links, fallos } = arch;
  return (
    <>
      {via === "enlace" && multi && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            <span className="inline-flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> Enlaces (30 días)
            </span>
            <span className="font-mono tabular-nums">
              {creating ? "generando…" : `${listos}/${docs.length} listos`}
            </span>
          </div>
          <ul className="max-h-44 space-y-1 overflow-y-auto">
            {docs.map((d) => {
              const ok = links.has(d.id);
              const err = fallos.get(d.id);
              return (
                <li
                  key={d.id}
                  className="flex items-center gap-2 rounded-lg bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs"
                >
                  {creating && !ok && !err ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-tertiary)]" />
                  ) : ok ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" />
                  ) : (
                    <FileWarning className="h-3.5 w-3.5 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">
                    {d.name}
                  </span>
                  {err && (
                    <span className="shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                      no se pudo compartir
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {fallos.size > 0 && (
            <p className="mt-2 text-[length:var(--ts-2xs,11px)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              {[...fallos.values()].some((m) => m.includes("límite"))
                ? `El servidor permite ${LIMITE_LOTE} enlaces cada 15 minutos. Manda los que sí se generaron y prueba con el resto más tarde.`
                : "Los documentos marcados no se pudieron compartir. El mensaje lleva sólo los que sí."}
            </p>
          )}
        </div>
      )}
    </>
  );
}
