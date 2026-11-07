"use client";

/**
 * Las cinco cifras del período (vendedores, vendido, comisiones, pagado, por
 * pagar) con el patrón de indicadores del panel: el botón va en la fila del
 * título y, plegado, lleva «Por pagar» adentro — plegar no es esconder el dato.
 * Las cifras son los totales que manda `/api/commissions/calculo`: acá no se suma.
 */
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import type { ResultadoComisiones } from "@/lib/comisiones/calcular";
import { cn } from "@/lib/utils";
import { fmt } from "./formato";

export function useIndicadoresComisiones(datos: ResultadoComisiones | null) {
  const t = datos?.totales;
  // Siempre las cinco: sin cifra todavía, el panel pinta esqueletos (`sinDatosAun`).
  const tarjetas = [
    { rotulo: "Vendedores", valor: String(datos?.filas.length ?? 0) },
    { rotulo: "Vendido", valor: fmt(t?.vendido ?? 0) },
    { rotulo: "Comisiones", valor: fmt(t?.comision ?? 0) },
    { rotulo: "Pagado", valor: fmt(t?.pagado ?? 0) },
    { rotulo: "Por pagar", valor: fmt(t?.pendiente ?? 0), falta: (t?.pendiente ?? 0) > 0 },
  ];

  return useKpisPlegables({
    claveMemoria: "ventas-caja-comisiones",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: !t,
    resumen: t ? `Por pagar ${fmt(t.pendiente)}` : undefined,
    tarjetas: tarjetas.map((k) => (
      <div
        key={k.rotulo}
        className={cn(
          "rounded-xl border bg-[var(--surface-raised)] p-3",
          k.falta ? "border-[var(--data-warning-500)]/40" : "border-[var(--rule-base)]",
        )}
      >
        <p className="text-sm font-semibold text-[var(--text-secondary)]">{k.rotulo}</p>
        <p className={cn("text-lg font-extrabold tabular-nums", k.falta ? "text-[var(--data-warning-ink)]" : "text-[var(--text-primary)]")}>
          {k.valor}
        </p>
      </div>
    )),
  });
}
