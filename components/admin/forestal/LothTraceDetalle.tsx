"use client";

/**
 * LothTraceDetalle — el cuerpo de la ventana de un árbol: sus alertas, dónde se
 * fue la madera y las seis secciones SERFOR con fechas.
 *
 * Antes era un bloque que se desplegaba DENTRO de la lista, con las acciones al
 * pie; ahora vive en `LothTraceDetalleModal` y las acciones (pasaporte, cadena
 * de custodia, mapa) van en el pie fijo de la ventana, a la vista aunque el
 * recorrido sea largo. Cada bloque lleva su título: dentro de la ventana la
 * jerarquía es título del árbol (h2) → bloque (h3).
 */

import { CardTitle } from "@buleje/design-system";
import { AlertTriangle } from "@buleje/design-system/icons";
import type { TraceOperation } from "@/lib/forestal/loth-trace";
import { MODAL_GUTTER } from "@/components/admin/shared/AdminModal";
import LothTraceEmbudo from "./LothTraceEmbudo";
import LothTraceTimeline from "./LothTraceTimeline";
import type { TraceNav } from "./loth-trace-ui";

export default function LothTraceDetalle({ op, nav }: { op: TraceOperation; nav?: TraceNav }) {
  return (
    <div className="divide-y divide-[var(--rule-soft)]">
      {op.alerts.length > 0 && (
        <Bloque titulo={op.alerts.length === 1 ? "Una alerta" : `${op.alerts.length} alertas`}>
          <ul className="space-y-1.5">
            {op.alerts.map((a, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 text-sm ${
                  a.level === "error"
                    ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                    : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                }`}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      <Bloque titulo="Dónde se fue la madera">
        <LothTraceEmbudo op={op} />
      </Bloque>

      <Bloque titulo="Las seis secciones del libro">
        <LothTraceTimeline op={op} nav={nav} />
      </Bloque>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className={`py-4 ${MODAL_GUTTER}`}>
      <CardTitle className="mb-2">{titulo}</CardTitle>
      {children}
    </section>
  );
}
