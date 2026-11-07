"use client";

/**
 * «Cruce con Resultado»: prueba de que la contabilidad y la pantalla Resultado
 * cuentan la misma plata. Resultado del panel − IGV de ventas + IGV de compras
 * ± ajustes = utilidad contable. Si la diferencia no es cero, sale en rojo.
 */
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { CruceConResultado } from "@/lib/contabilidad/tipos";
import { Bloque, Cuadra, soles } from "./compartido";

export default function CruceConResultadoTarjeta({ cruce }: { cruce: CruceConResultado }) {
  const ok = Math.abs(cruce.diferencia) < 0.005;
  const filas: { etiqueta: string; monto: number; fuerte?: boolean }[] = [
    { etiqueta: "Resultado del panel", monto: cruce.resultadoDelPanel },
    { etiqueta: "IGV de ventas (no es tuyo)", monto: -cruce.igvVentas },
    { etiqueta: "IGV de compras (se recupera)", monto: cruce.igvCompras },
    { etiqueta: "Ajustes manuales", monto: cruce.ajustesManuales },
    { etiqueta: "Utilidad contable", monto: cruce.utilidadContable, fuerte: true },
  ];
  return (
    <Bloque className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CardTitle>Cruce con Resultado</CardTitle>
        <InfoTip
          title="Cruce con Resultado"
          what="Compara la utilidad de la contabilidad con la que ves en Resultado. Deberían coincidir una vez quitado el IGV."
          affects="Si la diferencia sale en rojo, algún movimiento está en un lado y no en el otro."
          example="Resultado S/ 1,000, IGV de ventas S/ 180, IGV de compras S/ 40 → utilidad contable S/ 860."
        />
        <span className="ml-auto"><Cuadra ok={ok} diferencia={ok ? undefined : Math.abs(cruce.diferencia)} /></span>
      </div>
      <dl className="divide-y divide-[var(--rule-soft)]">
        {filas.map((f) => (
          <div key={f.etiqueta} className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <dt className={f.fuerte ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}>{f.etiqueta}</dt>
            <dd className={`whitespace-nowrap tabular-nums ${f.fuerte ? "font-extrabold text-[var(--text-primary)]" : "text-[var(--text-primary)]"}`}>{soles(f.monto)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 py-2 text-sm">
          <dt className="font-semibold text-[var(--text-secondary)]">Diferencia</dt>
          <dd className={`whitespace-nowrap font-extrabold tabular-nums ${ok ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]"}`}>{soles(cruce.diferencia)}</dd>
        </div>
      </dl>
    </Bloque>
  );
}
