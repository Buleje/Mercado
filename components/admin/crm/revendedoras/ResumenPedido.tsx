"use client";

import { StatCard } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import type { CotizacionRevendedora } from "@/lib/revendedoras/reglas";
import { pct, soles } from "./formato";

const AVISO = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
const BIEN = "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";

/** Lo que calculó el servidor: cuánto paga, cuánto gana ella, tu ganancia, mínimo, envío y avisos. */
export default function ResumenPedido({ c, calculando }: { c: CotizacionRevendedora | null; calculando: boolean }) {
  if (!c) {
    return <div className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-3 text-sm text-[var(--text-secondary)]">Pon cantidades en la lista para ver cuánto paga.</div>;
  }
  // El del mínimo ya sale en la línea de estado: no se repite en la lista.
  const avisos = c.avisos.filter((a) => !a.includes("para el pedido mínimo"));
  return (
    <div className={cn("space-y-2 transition-opacity", calculando && "opacity-60")} aria-busy={calculando}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Precio de catálogo" value={soles(c.catalogo)} density="compact" />
        <div data-testid="pedido-total"><StatCard label="Ella paga" value={soles(c.total)} density="compact" highlight /></div>
        <StatCard label="Ella gana al revender" value={soles(c.ellaGana)} density="compact" />
        <StatCard label="Tu ganancia" value={c.ganancia == null ? "Sin costo" : `${soles(c.ganancia)} · ${pct(c.margen ?? 0)}`} density="compact" />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {c.subeDeNivel ? (
          <span className={cn("font-semibold", BIEN)}>Con este pedido pasa al {pct(c.nivel.descuento)}</span>
        ) : (
          <span className="font-semibold text-[var(--text-primary)]">Su nivel: {pct(c.nivel.descuento)}</span>
        )}
        <span className={c.cumpleMinimo ? BIEN : AVISO}>
          {c.cumpleMinimo ? `Pasa el mínimo de ${soles(c.pedidoMinimo)}` : `Le faltan ${soles(c.faltaMinimo)} para el mínimo de ${soles(c.pedidoMinimo)}`}
        </span>
        <span className={c.envioGratis ? BIEN : "text-[var(--text-secondary)]"}>
          {c.envioGratis ? "Envío gratis" : c.faltaEnvioGratis != null ? `Envío lo paga ella (faltan ${soles(c.faltaEnvioGratis)} para gratis)` : "Envío lo paga ella"}
        </span>
      </div>
      {avisos.length > 0 && (
        <ul className={cn("space-y-0.5 text-sm", AVISO)} data-testid="pedido-avisos">
          {avisos.map((a, i) => (
            <li key={`${i}-${a}`}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
