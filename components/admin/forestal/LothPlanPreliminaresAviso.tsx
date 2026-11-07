"use client";

/**
 * Las observaciones del plan por las GTF preliminares (Brandon 25-10): cada
 * pendiente queda como algo por hacer —«GTF 001-0000123 (LT 2): falta
 * registrarla en SERFOR y en el libro»— hasta que se registre o se anule.
 * Las acciones están en el bloque de las preliminares; «Ver» lleva ahí.
 */

import { ArrowRight, FileWarning } from "@buleje/design-system/icons";
import { avisoDePreliminar, type GtfPreliminarVista } from "@/lib/forestal/loth-plan-preliminares";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Btn } from "./ctp-shared";

export default function LothPlanPreliminaresAviso({ guias, onVer }: { guias: readonly GtfPreliminarVista[] | null | undefined; onVer?: () => void }) {
  const avisos = (guias ?? []).flatMap((g) => {
    const t = avisoDePreliminar(g);
    return t ? [{ id: g.id, t }] : [];
  });
  if (avisos.length === 0) return null;
  const titulo = avisos.length === 1 ? "Una GTF preliminar pendiente" : `${avisos.length} GTF preliminares pendientes`;
  return (
    <div
      data-testid="aviso-preliminares"
      data-aviso-nivel="ambar"
      data-aviso-resumen={titulo}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-2 border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] px-3 py-2 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
    >
      <span className="flex min-w-0 grow basis-[18rem] items-center gap-2">
        <FileWarning className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <span className="font-bold">{titulo}:</span>{" "}
          {/* La primera a la vista; todas, en el ⓘ (Brandon 26-10: una línea por aviso). */}
          <span className="font-medium">{avisos[0].t}</span>
          {avisos.length > 1 && <span className="font-semibold"> (+{avisos.length - 1} más)</span>}
        </span>
        <InfoTip
          title="GTF preliminares por registrar"
          ariaLabel="Ver todas las GTF preliminares pendientes"
          ancho="w-96"
          body={
            <span className="block space-y-1">
              {avisos.map((a) => (
                <span key={a.id} className="block">{a.t}</span>
              ))}
            </span>
          }
        />
      </span>
      {onVer && (
        <Btn variant="ghost" size="sm" onClick={onVer} className="shrink-0">
          Ver <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Btn>
      )}
    </div>
  );
}
