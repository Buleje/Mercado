/**
 * KpisDelDia — las 4 cifras de «Hoy» debajo de la tarjeta de la meta: cómo va
 * contra ayer a esta hora, cuántas ventas, ticket promedio y la mejor hora.
 * Lo vendido hoy NO se repite acá: es la cifra grande de la tarjeta de arriba.
 * Todo de `/api/goals/serie`.
 */
import { StatCard } from "@buleje/design-system";
import { Activity, Clock, History, ShoppingCart } from "@buleje/design-system/icons";
import { cifraDeMeta } from "@/components/admin/metas/formato-meta";
import { etiquetaHora, type ResumenDelDia } from "./hoy-calculos";

/** «S/ 0.10», «S/ 1,250»: con céntimos sólo si los hay y la cifra es chica. */
const corto = (n: number) => cifraDeMeta(n, "S/");
const ventas = (n: number) => `${n} ${n === 1 ? "venta" : "ventas"}`;

export function KpisDelDia({ r }: { r: ResumenDelDia }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        density="compact"
        label="Ayer a esta hora"
        value={corto(r.ayerAEstaHora)}
        icon={History}
        delta={r.deltaVsAyer ?? undefined}
        deltaLabel={r.deltaVsAyer !== null ? "hoy contra ayer" : undefined}
        subValue={`Todo el día: ${corto(r.ayerTotal)}`}
      />
      <StatCard
        density="compact"
        label="Ventas y pedidos"
        value={String(r.n)}
        icon={ShoppingCart}
        subValue={`Ayer a esta hora: ${r.nAyerAEstaHora}`}
      />
      <StatCard
        density="compact"
        label="Ticket promedio"
        value={r.n > 0 ? corto(r.total / r.n) : "Sin ventas"}
        icon={Activity}
      />
      <StatCard
        density="compact"
        label="Mejor hora"
        value={r.mejorHora ? etiquetaHora(r.mejorHora.hora) : "—"}
        icon={Clock}
        subValue={
          r.mejorHora ? `${corto(r.mejorHora.total)} · ${ventas(r.mejorHora.n)}` : "Aún sin ventas"
        }
      />
    </div>
  );
}
