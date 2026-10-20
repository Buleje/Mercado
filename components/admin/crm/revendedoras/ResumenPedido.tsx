"use client";

import { cn } from "@/lib/utils";
import type { CotizacionRevendedora } from "@/lib/revendedoras/reglas";
import { pct, soles } from "./formato";

const AVISO = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
const BIEN = "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";

function Cifra({ rotulo, valor, fuerte, testId }: { rotulo: string; valor: string; fuerte?: boolean; testId?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-[var(--surface-sunken)] px-3 py-2" data-testid={testId}>
      <div className="text-xs text-[var(--text-tertiary)]">{rotulo}</div>
      <div className={cn("tabular-nums text-[var(--text-primary)]", fuerte ? "text-lg font-bold" : "text-base font-semibold")}>{valor}</div>
    </div>
  );
}

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
        <Cifra rotulo="Precio de catálogo" valor={soles(c.catalogo)} />
        <Cifra rotulo="Ella paga" valor={soles(c.total)} fuerte testId="pedido-total" />
        <Cifra rotulo="Ella gana al revender" valor={soles(c.ellaGana)} />
        <Cifra rotulo="Tu ganancia" valor={c.ganancia == null ? "Sin costo" : `${soles(c.ganancia)} · ${pct(c.margen ?? 0)}`} />
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
