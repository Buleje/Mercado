/**
 * lib/metas/logros-reglas.ts — las cuentas de «Hoy», «Calendario» y «Logros» (ADR-488).
 *
 * Puro y sin `server-only`: lo usan el servidor (al evaluar los logros) y la
 * pantalla (el calendario pinta el día en verde con la MISMA regla).
 *
 * Todo en el día de Lima (UTC−5 fijo; Perú no cambia de hora). Antes el
 * calendario cortaba con `toISOString().slice(0, 10)`: una venta de las 20:00
 * de Pucallpa (01:00 UTC del día siguiente) caía en el día siguiente, y «Hoy»
 * contaba las horas con `getHours()` del navegador.
 */
import type { MetaDTO, PeriodoMeta } from "@/lib/admin/metas-tareas";
import { sumarDiasAFecha } from "@/lib/admin/metas-tareas";

/** Lo vendido en un día o en una hora: soles cobrados y cuántas ventas/pedidos. */
export interface TramoVenta {
  total: number;
  n: number;
}

/** Ventas por día de Lima ("YYYY-MM-DD"); un día sin ventas no viene. */
export type VentasPorDia = Readonly<Record<string, TramoVenta>>;

export const TRAMO_VACIO: TramoVenta = Object.freeze({ total: 0, n: 0 });

// ── Lo que devuelven GET /api/goals/serie y GET /api/goals/logros ───────────

export interface RespuestaSerieHora {
  por: "hora";
  /** El día de Lima del servidor. */
  hoy: string;
  dia: string;
  /** 24 tramos, uno por hora de Lima. */
  horas: TramoVenta[];
  ayer: { dia: string; horas: TramoVenta[] };
}

export interface RespuestaSerieDia {
  por: "dia";
  hoy: string;
  /** "YYYY-MM". */
  mes: string;
  dias: Record<string, TramoVenta>;
  anterior: { mes: string; dias: Record<string, TramoVenta> };
}

export type AreaLogro = "ventas" | "clientes" | "caja" | "constancia" | "marketplace" | "forestal";

export interface LogroDTO {
  id: string;
  area: AreaLogro;
  nombre: string;
  /** Qué hay que lograr y de dónde sale (para el ⓘ). */
  queMide: string;
  ganado: boolean;
  /** Día de Lima en que se ganó, si se puede saber. */
  desde?: string;
  progreso?: { valor: number; meta: number; unidad: string };
  /** Una línea más («Récord: S/ 300 el 02/10/2026 · hoy llevas S/ 120»). */
  detalle?: string;
  /** La fuente no se pudo leer: no se sabe si está ganado. */
  sinDato?: boolean;
}

export interface RespuestaLogros {
  hoy: string;
  logros: LogroDTO[];
}

/** La hora de Lima (0-23) de un instante: (hora UTC − 5 + 24) % 24. */
export function horaLima(d: Date): number {
  return (d.getUTCHours() + 19) % 24;
}

/** La meta de ventas en soles de un período, la primera que se creó (`listar` viene en ese orden). */
export function metaDeVentas(metas: readonly MetaDTO[], periodo: PeriodoMeta): MetaDTO | null {
  return metas.find((m) => m.category === "ventas" && m.period === periodo && m.target > 0) ?? null;
}

/** ¿El día cuenta para la racha? Con meta diaria: vendió al menos la meta. Sin meta: vendió algo. */
export function diaCumple(tramo: TramoVenta | undefined, metaDiaria: number | null): boolean {
  if (!tramo) return false;
  return metaDiaria !== null && metaDiaria > 0 ? tramo.total >= metaDiaria : tramo.n > 0;
}

/** Los largos de racha que tienen logro. */
export const LARGOS_DE_RACHA = [3, 5, 7, 30, 100] as const;

export interface Racha {
  /** Días seguidos hasta hoy (si hoy todavía no cumple, la racha que terminó ayer sigue viva). */
  actual: number;
  /** La racha más larga dentro de la ventana leída. */
  mejor: number;
  /** El primer día en que la racha llegó a cada largo de `LARGOS_DE_RACHA`. */
  alcanzada: Partial<Record<number, string>>;
}

/**
 * Racha de días seguidos que cumplen, de `desde` a `hoy` (inclusive). Un día
 * sin ventas la corta; HOY no la corta mientras el día siga abierto.
 */
export function calcularRacha(
  dias: VentasPorDia,
  desde: string,
  hoy: string,
  metaDiaria: number | null,
): Racha {
  let corrida = 0;
  let mejor = 0;
  const alcanzada: Partial<Record<number, string>> = {};
  for (let f = desde; f <= hoy; f = sumarDiasAFecha(f, 1)) {
    if (diaCumple(dias[f], metaDiaria)) {
      corrida += 1;
      mejor = Math.max(mejor, corrida);
      for (const largo of LARGOS_DE_RACHA) {
        if (corrida === largo && !alcanzada[largo]) alcanzada[largo] = f;
      }
    } else if (f !== hoy) {
      corrida = 0;
    }
  }
  return { actual: corrida, mejor, alcanzada };
}

export interface MejorDia {
  /** El récord de un día dentro de lo leído. */
  record: number;
  recordDia: string | null;
  /** El récord ANTES de hoy: lo que hoy tiene que superar. */
  previoAHoy: number;
  /** La última vez que un día superó el récord que había (el primer día con ventas no cuenta: no superó nada). */
  superadoEn: string | null;
  hoyTotal: number;
}

/** Récord real de ventas de un día: recorre los días en orden y marca cuándo se superó. */
export function calcularMejorDia(dias: VentasPorDia, hoy: string): MejorDia {
  let record = 0;
  let recordDia: string | null = null;
  let previoAHoy = 0;
  let superadoEn: string | null = null;
  const fechas = Object.keys(dias)
    .filter((f) => f <= hoy)
    .sort();
  for (const f of fechas) {
    const total = dias[f]?.total ?? 0;
    if (f < hoy) previoAHoy = Math.max(previoAHoy, total);
    if (total > record) {
      if (record > 0) superadoEn = f;
      record = total;
      recordDia = f;
    }
  }
  return { record, recordDia, previoAHoy, superadoEn, hoyTotal: dias[hoy]?.total ?? 0 };
}

/** Suma un tramo en céntimos (sin arrastrar decimales del float). */
export function sumarTramo(t: TramoVenta, monto: number): void {
  t.total = Math.round((t.total + monto) * 100) / 100;
  t.n += 1;
}
