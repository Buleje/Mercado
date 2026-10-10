"use client";

/**
 * FacturacionModule — la vista «Facturas y boletas» de Comprobantes
 * (`?tab=facturacion&vista=facturas`, ComprobantesHubModule).
 *
 * Hasta la ola 3 del panel unificado era un hub de 5 pestañas dentro de
 * Documentos (Factura electrónica, Impuestos, Obligaciones, Cuentas x Pagar y
 * Conexión SUNAT): un tercer nivel con tres asuntos que no son comprobantes. Se
 * queda sin pantallas propias (regla R5: mover = montar en la casa nueva) y
 * deja el enlace a donde se mudó cada una (R6):
 *
 *   Cuentas x Pagar     → Compras › Por pagar (la misma PayablesTab)
 *   Impuestos + Oblig.  → Mi Plata › Impuestos y reportes (TaxTab + ObligacionesTab)
 *   Conexión SUNAT      → Configuración › Cobros y comprobantes (SunatConexionTab):
 *                         su enlace va en la línea de estado SUNAT de EInvoiceTab
 *
 * Cada enlace se ofrece sólo a quien puede abrir el destino (el origen
 * REGISTRADO de esa vista): uno que lleva a una pestaña cerrada es peor que
 * ninguno. Si no queda ninguno, la sección no se dibuja.
 */

import dynamic from "next/dynamic";
import type { LucideIcon } from "@buleje/design-system/icons";
import { useMemo } from "react";
import { Calculator, ChevronRight, CreditCard } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { useContextoPermiso } from "@/hooks/use-vistas-permitidas";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { origenesDeVista, vistaPermitida } from "@/lib/admin/permiso-vista";
import { vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const EInvoiceTab = dynamic(() => import("@/components/admin/EInvoiceTab"), { loading: S });

interface Mudanza {
  titulo: string;
  /** Dónde vive ahora, como lo lee la barra. */
  donde: string;
  icon: LucideIcon;
  tab: Tab;
  vista: string;
}

const MUDANZAS: readonly Mudanza[] = [
  { titulo: "Cuentas por pagar", donde: "Compras › Por pagar", icon: CreditCard, tab: "compras", vista: "cuentas-por-pagar" },
  { titulo: "Impuestos y obligaciones", donde: "Mi Plata › Impuestos y reportes", icon: Calculator, tab: "plata", vista: "impuestos" },
];

/** El origen con que el panel ofrece esa vista (el registrado; si no hay, la pestaña). */
function origenDe(m: Mudanza): readonly Tab[] {
  const vista = vistasDelModulo(m.tab).find((v) => v.key === m.vista);
  return origenesDeVista(m.tab, vista ?? {}) as readonly Tab[];
}

/** Las mudanzas que esta persona puede abrir; ninguna mientras el rol no se confirma. */
function useMudanzasVisibles(): readonly Mudanza[] {
  const ctx = useContextoPermiso();
  return useMemo(() => (ctx ? MUDANZAS.filter((m) => vistaPermitida(ctx, origenDe(m))) : []), [ctx]);
}

export default function FacturacionModule() {
  const mudanzas = useMudanzasVisibles();
  return (
    <div className="space-y-4">
      <EInvoiceTab />

      {mudanzas.length > 0 && (
        <section aria-labelledby="facturacion-se-mudaron" className="space-y-3 pt-2">
          <div className="flex items-center gap-1.5">
            <CardTitle as="h3" id="facturacion-se-mudaron" className="text-sm font-bold text-[var(--text-primary)]">
              Antes estaban aquí
            </CardTitle>
            <InfoTip
              title="Antes estaban aquí"
              what="Las cuentas por pagar y los impuestos vivían en Documentos › Facturación. No son comprobantes: ahora están donde se usan."
              side="bottom"
            />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mudanzas.map((m) => (
              <li key={m.vista}>
                <EnlacePanel
                  href={hrefDeDestino({ tab: m.tab, params: { vista: m.vista } })}
                  apariencia="heredada"
                  className="group flex min-h-12 items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 transition-colors hover:border-[var(--accent)] hover:no-underline"
                >
                  <m.icon className="h-5 w-5 shrink-0 text-[var(--text-tertiary)] group-hover:text-[var(--accent-ink)] dark:group-hover:text-[var(--accent)]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">{m.titulo}</span>
                    <span className="block text-xs text-[var(--text-secondary)]">{m.donde}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                </EnlacePanel>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
