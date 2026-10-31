"use client";

/**
 * «Papeles del plan 096» en el Archivo: si la carpeta abierta es la de un plan
 * del Libro TH (o está adentro de ella), el camino de vuelta a su lista de
 * papeles. La raíz del plan lleva `plan:<id>` (ADR-467); su nombre es el N°
 * del plan. Sin carpeta de plan en el camino no se dibuja nada.
 *
 * El libro abre en ESE plan y en su pestaña Papeles: `dejarElegidosLosPapeles`
 * escribe las dos preferencias antes de navegar.
 */

import { ArrowRight, ClipboardCheck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { dejarElegidosLosPapeles, URL_VISTA_PLAN } from "@/components/admin/forestal/plan-papeles/abrir-papeles";
import { useTenantSlug } from "@/contexts/tenant-context";
import { tagRaizPlan } from "@/lib/forestal/plan-documentos-tipos";
import type { DbDocumentFolder } from "@/lib/types/documents";

const PREFIJO_PLAN = tagRaizPlan("");

/** El plan de la carpeta abierta: la más honda del camino con `plan:<id>`. */
export function planDeLaRuta(ruta: readonly Pick<DbDocumentFolder, "name" | "tags">[]): { planId: string; nombre: string } | null {
  for (let i = ruta.length - 1; i >= 0; i--) {
    const tag = (ruta[i].tags ?? []).find((t) => t.startsWith(PREFIJO_PLAN) && t.length > PREFIJO_PLAN.length);
    if (tag) return { planId: tag.slice(PREFIJO_PLAN.length), nombre: ruta[i].name };
  }
  return null;
}

export default function EnlacePapelesDelPlan({ ruta }: { ruta: readonly Pick<DbDocumentFolder, "name" | "tags">[] }) {
  const slug = useTenantSlug();
  const plan = planDeLaRuta(ruta);
  if (!plan) return null;
  return (
    <div
      data-papeles-del-plan={plan.planId}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2"
    >
      <ClipboardCheck className="h-5 w-5 shrink-0 text-[var(--accent-ink)]" aria-hidden="true" />
      <span className="min-w-0 text-sm font-semibold text-[var(--text-primary)]">Papeles del plan {plan.nombre}</span>
      <InfoTip
        title={`Papeles del plan ${plan.nombre}`}
        what="Esta carpeta es la de un plan del Libro TH. Allá ves qué papeles te pueden pedir (resolución, título, acta de la comunidad…), cuál falta y cuándo vence cada uno."
        affects="Lo que subas acá cuenta allá: es la misma carpeta."
        example="Plan 096: Certificado ✓ · Título ✓ · Acta de la comunidad: falta."
      />
      <a
        href={URL_VISTA_PLAN}
        className={button({ variant: "secondary", className: "ml-auto" })}
        onClick={(e) => {
          dejarElegidosLosPapeles(slug, plan.planId);
          // Ctrl/⌘/rueda: otra pestaña, como cualquier enlace (ya quedó elegido).
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          irAEnlace(URL_VISTA_PLAN);
        }}
      >
        Ver los papeles
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </a>
    </div>
  );
}
