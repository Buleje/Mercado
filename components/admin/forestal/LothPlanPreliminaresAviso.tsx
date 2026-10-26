"use client";

/**
 * Las observaciones del plan por las GTF preliminares (Brandon 25-10): cada
 * pendiente queda como algo por hacer —«GTF 001-0000123 (LT 2): falta
 * registrarla en SERFOR y en el libro»— hasta que se registre o se anule.
 * Las acciones están en el bloque de las preliminares; «Ver» lleva ahí.
 */

import { ArrowRight, FileWarning } from "@buleje/design-system/icons";
import { avisoDePreliminar, type GtfPreliminarVista } from "@/lib/forestal/loth-plan-preliminares";
import { Btn } from "./ctp-shared";

export default function LothPlanPreliminaresAviso({ guias, onVer }: { guias: readonly GtfPreliminarVista[] | null | undefined; onVer?: () => void }) {
  const avisos = (guias ?? []).flatMap((g) => {
    const t = avisoDePreliminar(g);
    return t ? [{ id: g.id, t }] : [];
  });
  if (avisos.length === 0) return null;
  return (
    <div
      data-testid="aviso-preliminares"
      className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] px-4 py-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
    >
      <FileWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          {avisos.length === 1 ? "Una GTF preliminar pendiente" : `${avisos.length} GTF preliminares pendientes`}
        </p>
        <ul className="font-medium">
          {avisos.map((a) => (
            <li key={a.id}>{a.t}</li>
          ))}
        </ul>
      </div>
      {onVer && (
        <Btn variant="ghost" size="sm" onClick={onVer} className="shrink-0">
          Ver <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Btn>
      )}
    </div>
  );
}
