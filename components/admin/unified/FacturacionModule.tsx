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
 * ninguno. Desde el 10-10 viven en el menú «Más» de la cabecera de Facturas y
 * boletas (antes: un bloque «Antes estaban aquí» al fondo). Si no queda ninguno,
 * el menú trae sólo lo propio.
 */

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Calculator, CreditCard } from "@buleje/design-system/icons";
import type { LucideIcon } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
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
  { titulo: "Cuentas por pagar", donde: "Antes estaba aquí: Compras › Por pagar", icon: CreditCard, tab: "compras", vista: "cuentas-por-pagar" },
  { titulo: "Impuestos y obligaciones", donde: "Antes estaba aquí: Mi Plata › Impuestos y reportes", icon: Calculator, tab: "plata", vista: "impuestos" },
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
  const acciones: MenuAccion[] = mudanzas.map((m) => ({
    id: `ir-${m.tab}-${m.vista}`,
    label: m.titulo,
    hint: m.donde,
    icon: m.icon,
    onSelect: () => { irAEnlace(hrefDeDestino({ tab: m.tab, params: { vista: m.vista } })); },
  }));
  return (
    <div className="space-y-4">
      <EInvoiceTab accionesExtra={acciones} />
    </div>
  );
}
