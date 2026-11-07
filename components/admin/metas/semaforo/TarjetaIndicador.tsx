"use client";

/**
 * Un indicador del Semáforo = un StatCard con su color, el «qué hacer» en una
 * línea y el ⓘ con lo que mide y la regla del color (ADR-508).
 *
 * El color nunca va solo: la línea de abajo empieza con la palabra («Rojo:»),
 * para quien no distingue colores o imprime en blanco y negro. Gris (sin meta o
 * sin dato) también lo dice con palabras.
 */
import { StatCard } from "@buleje/design-system";
import {
  CalendarClock,
  Megaphone,
  Package,
  PackageX,
  PiggyBank,
  Receipt,
  Repeat,
  ShoppingBag,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { TEXTO_TONO, type TonoMeta } from "@/components/admin/metas/clases-meta";
import { formatearValor, type IndicadorDTO } from "@/lib/semaforo/evaluar";
import type { ColorSemaforo, IndicadorId } from "@/lib/semaforo/indicadores";
import { cn } from "@/lib/utils";

const ICONO: Readonly<Record<IndicadorId, typeof Wallet>> = {
  pedidos_semana: ShoppingBag,
  ticket_promedio: Receipt,
  ganancia_neta: TrendingUp,
  productos_a_agotados: PackageX,
  vencidos_danados: TriangleAlert,
  recompra: Repeat,
  costo_cliente_nuevo: Megaphone,
  dias_stock: CalendarClock,
  sin_rotar: Package,
  caja: Wallet,
  ganancia_acumulada: PiggyBank,
};

const ENFASIS: Readonly<Record<ColorSemaforo, "success" | "warning" | "error" | "neutral">> = {
  verde: "success",
  amarillo: "warning",
  rojo: "error",
  sin_meta: "neutral",
  sin_dato: "neutral",
};

const TONO: Readonly<Record<ColorSemaforo, TonoMeta>> = {
  verde: "exito",
  amarillo: "aviso",
  rojo: "error",
  sin_meta: "neutro",
  sin_dato: "neutro",
};

export const PALABRA_COLOR: Readonly<Record<ColorSemaforo, string>> = {
  verde: "Verde",
  amarillo: "Amarillo",
  rojo: "Rojo",
  sin_meta: "Sin meta",
  sin_dato: "Sin dato",
};

export function TarjetaIndicador({ ind }: { ind: IndicadorDTO }) {
  return (
    <div data-indicador={ind.id} data-color={ind.color}>
      <StatCard
        density="compact"
        accentBar
        iconEmphasis
        icon={ICONO[ind.id]}
        emphasis={ENFASIS[ind.color]}
        label={ind.nombre}
        value={ind.valor === null ? "—" : formatearValor(ind.valor, ind.unidad)}
        subValue={
          <span className="block leading-snug" title={ind.queHacer}>
            <span className={cn("font-bold", TEXTO_TONO[TONO[ind.color]])}>{PALABRA_COLOR[ind.color]}:</span>{" "}
            <span className="text-[var(--text-secondary)]">{ind.queHacer}</span>
          </span>
        }
        info={
          <InfoTip
            title={ind.nombre}
            what={ind.mide}
            affects={<span>{ind.regla}</span>}
            example={ind.detalle ? <span>{ind.detalle}</span> : undefined}
          />
        }
      />
    </div>
  );
}
