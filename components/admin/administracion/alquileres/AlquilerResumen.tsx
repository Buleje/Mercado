"use client";

/**
 * AlquilerResumen — las cifras del alquiler tal como las manda el servidor
 * (`resumen`, ADR-524): meses pagados, pagado en total, deuda atrasada y fin
 * del contrato, más sus alertas. Acá no se suma ni se resta nada.
 */
import { StatCard } from "@buleje/design-system";
import type { AlquilerDto } from "@/lib/admin/fichas-tramites-alquileres";
import { fechaLarga, fechaRelativa } from "../comun/fechas";
import { Insignia } from "../comun/Insignia";
import { monto } from "../comun/monto";
import { ALERTA_TONO } from "./alquileres-ui";

const meses = (n: number) => (n === 1 ? "1 mes" : `${n} meses`);

function finDelContrato(dias: number | null): string {
  if (dias === null) return "Sin fecha";
  if (dias < 0) return "Ya venció";
  if (dias === 0) return "Hoy";
  return dias === 1 ? "Falta 1 día" : `Faltan ${dias} días`;
}

export function AlquilerResumen({ a }: { a: AlquilerDto }) {
  const r = a.resumen;
  const atrasados = r.periodosAtrasados.length;
  return (
    <section className="space-y-3" aria-label="Resumen del alquiler">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          density="compact"
          label="Meses pagados"
          value={r.periodosDelPlazo ? `${r.periodosPagados} de ${r.periodosDelPlazo}` : String(r.periodosPagados)}
          subValue={r.periodosDelPlazo ? "del plazo del contrato" : "sin fecha de fin"}
        />
        <StatCard density="compact" label="Pagado en total" value={monto(r.totalPagado, a.moneda)} />
        <StatCard
          density="compact"
          label="Deuda atrasada"
          value={monto(r.deudaAtrasada, a.moneda)}
          // R3: la deuda se cuenta con la renta de HOY (si hubo reajuste, los meses viejos también).
          subValue={atrasados > 0 ? `${meses(atrasados)} · a la renta actual` : "Al día"}
          emphasis={atrasados > 0 ? "error" : "neutral"}
        />
        <StatCard
          density="compact"
          label="Fin del contrato"
          value={finDelContrato(r.diasParaFin)}
          subValue={r.avisoNoRenovarEl ? `Avisar que no se renueva: ${fechaLarga(r.avisoNoRenovarEl)}` : a.finEl ? fechaLarga(a.finEl) : undefined}
          emphasis={r.diasParaFin !== null && r.diasParaFin <= 30 ? "warning" : "neutral"}
        />
      </div>
      {r.alertas.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Alertas">
          {r.alertas.map((al) => (
            <li key={`${al.tipo}-${al.fecha}`} className="flex items-center gap-2">
              <Insignia tono={ALERTA_TONO[al.tipo]} texto={al.texto} />
              <span className="text-sm text-[var(--text-tertiary)]">{fechaRelativa(al.fecha)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
