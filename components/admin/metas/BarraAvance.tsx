/**
 * BarraAvance — cuánto lleva la meta y la marca de por dónde «debería» ir.
 *
 * El relleno sale del estado (verde en camino o cumplida, ámbar atrasada, rojo
 * pasada del tope o no cumplida); la marca vertical es el ritmo esperado a esta
 * altura del período (`ritmoEsperado`), que no existe en las metas de un día.
 * Sin interactividad: componente de servidor o de cliente, da igual.
 */
import type { EstadoMeta } from "@/lib/admin/metas-periodo";
import { RELLENO_ESTADO } from "./clases-meta";

const tope = (v: number) => Math.max(0, Math.min(100, v));

export function BarraAvance({
  avance,
  target,
  esperado,
  estado,
  etiqueta,
  ritmo,
}: {
  avance: number | null;
  target: number;
  esperado: number | null;
  estado: EstadoMeta;
  /** Lo que lee un lector de pantalla («S/ 8,240 de S/ 30,000»). */
  etiqueta: string;
  /** El ritmo ya escrito («S/ 7,300»), para el tooltip de la marca. */
  ritmo?: string;
}) {
  const pct = avance === null || target <= 0 ? 0 : tope((avance / target) * 100);
  const marca = esperado === null || target <= 0 ? null : tope((esperado / target) * 100);
  return (
    <div
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="relative h-2.5 w-full rounded-full bg-[var(--surface-sunken)] ring-1 ring-inset ring-[var(--rule-soft)]"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-[var(--motion-slow)] motion-reduce:transition-none ${RELLENO_ESTADO[estado]}`}
        style={{ width: `${pct}%` }}
      />
      {marca !== null && marca > 0 && (
        <span
          aria-hidden="true"
          title={ritmo ? `Ritmo esperado a hoy: ${ritmo}` : "Ritmo esperado a hoy"}
          className="absolute -top-1 h-[1.125rem] w-0.5 -translate-x-1/2 rounded-full bg-[var(--text-primary)]"
          style={{ left: `${marca}%` }}
        />
      )}
    </div>
  );
}
