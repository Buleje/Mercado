/**
 * El cierre de cada día con el conteo REAL (PURO y client-safe).
 *
 * Hasta el 19-10 había dos respuestas a «¿cuadró la caja el día X?»:
 *  · Caja › Historial › Por día sumaba las cajas cerradas (esperado, contado,
 *    diferencia de cada una): el dato bueno, pero sin las ventas del día.
 *  · «Cierres del día» leía `DailySummary`, que escribe el cron de las 16:30 de
 *    Lima: guardaba esperado 0 y contado vacío SIEMPRE (1 496 filas de 13
 *    negocios, ninguna con conteo) porque miraba la caja ABIERTA, cuyo
 *    `closingAmount` es null. Decía «Sin contar» en días que sí se contaron
 *    (main 28/09: 5 cajas, esperado S/ 55, contado S/ 0).
 * Ahora el cuadre del día sale de las cajas cerradas (esta función) y la venta
 * del día, de la regla de ingresos de Mi Plata (POS + pedidos que entran).
 *
 * Reglas del cuadre (las mismas que tenía la tabla del navegador):
 *  · el día de una caja es el de Lima de su cierre (o de su apertura si no lo tiene);
 *  · una caja cerrada SIN conteo (`close(null)`: cron o «Cerrar turno» sin
 *    contar) guarda contado = esperado y diferencia 0: no suma a esperado,
 *    contado ni diferencia, se cuenta aparte;
 *  · el día se juzga por la PEOR caja: +5 en una y −5 en otra dan 0 de neto y
 *    el día no cuadró (por eso viajan faltante, sobrante y peor).
 */
import { esCierreAutomatico } from "@/lib/caja/arqueo-veredicto";
import { pedidoEntraComoIngreso } from "@/lib/finance/ingresos-del-periodo";
import { limaDateKey } from "@/lib/utils";

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Lo que el cuadre necesita de una caja cerrada (montos ya en número). */
export interface CajaCerradaDelDia {
  openedAt: Date | string;
  closedAt: Date | string | null;
  expectedAmount: number | null;
  closingAmount: number | null;
  difference: number | null;
  notes: string | null;
}

export interface CuadreDelDia {
  cajas: number;
  /** Cerradas sin conteo: no suman a esperado, contado ni diferencia. */
  sinConteo: number;
  /** Esperado y contado de las cajas CONTADAS. */
  esperado: number;
  contado: number;
  /** Neto del día: lo que sobró menos lo que faltó en las cajas contadas. */
  diferencia: number;
  faltante: number;
  sobrante: number;
  /** La diferencia más grande de UNA caja: con ella se juzga el día. */
  peor: number;
}

export interface VentasDelDia {
  total: number;
  cantidad: number;
  ticket: number;
}

/** Lo que guardó el resumen del día (`DailySummary`) y no sale de otro lado. */
export interface ResumenGuardado {
  id: string;
  fecha: Date | string;
  fiadosCobrados: number;
  fiadosNuevos: number;
  fiadosVencidos: number;
  mejorHora: string | null;
  productoTop: string | null;
  stockAlertas: string | null;
  notas: string | null;
  creadoPor: string;
  createdAt: Date | string;
}

export interface DiaDeCaja {
  /** `YYYY-MM-DD`, día de Lima. */
  dia: string;
  cuadre: CuadreDelDia;
  ventas: VentasDelDia;
  /** El resumen guardado de ese día (el hecho a mano gana al del cron), o null. */
  resumen: ResumenGuardado | null;
}

export interface TotalesDeCaja {
  dias: number;
  sinConteo: number;
  /** Lo contado en todas las cajas contadas del rango. */
  recaudado: number;
  /** Faltantes + sobrantes, caja por caja (uno no tapa al otro). */
  discrepancia: number;
}

export const CUADRE_VACIO: CuadreDelDia = { cajas: 0, sinConteo: 0, esperado: 0, contado: 0, diferencia: 0, faltante: 0, sobrante: 0, peor: 0 };

/** El día de Lima en que cuenta una caja. */
export function diaDeCaja(c: Pick<CajaCerradaDelDia, "closedAt" | "openedAt">): string {
  return limaDateKey(c.closedAt ?? c.openedAt);
}

/** El cuadre de un grupo de cajas cerradas (las de un día). */
export function cuadreDeCajas(cajas: readonly CajaCerradaDelDia[]): CuadreDelDia {
  const c = { ...CUADRE_VACIO };
  for (const r of cajas) {
    c.cajas++;
    if (esCierreAutomatico(r.notes)) {
      c.sinConteo++;
      continue;
    }
    const d = num(r.difference);
    c.esperado += num(r.expectedAmount);
    c.contado += num(r.closingAmount);
    c.diferencia += d;
    if (d < 0) c.faltante -= d;
    else c.sobrante += d;
    c.peor = Math.max(c.peor, Math.abs(d));
  }
  return {
    ...c,
    esperado: r2(c.esperado),
    contado: r2(c.contado),
    diferencia: r2(c.diferencia),
    faltante: r2(c.faltante),
    sobrante: r2(c.sobrante),
    peor: r2(c.peor),
  };
}

/** Cuántas cajas del día se contaron: sin ninguna, el día no tiene cuadre que mostrar. */
export function cajasContadas(c: CuadreDelDia): number {
  return c.cajas - c.sinConteo;
}

/**
 * Los campos de caja del resumen guardado (`DailySummary`), desde el cuadre de
 * las cajas: sin ninguna caja contada, contado null («Sin contar») y 0.
 */
export function camposDeCajaDelResumen(c: CuadreDelDia): { efectivoEsperado: number; efectivoContado: number | null; diferenciaCaja: number } {
  return cajasContadas(c) > 0
    ? { efectivoEsperado: c.esperado, efectivoContado: c.contado, diferenciaCaja: c.diferencia }
    : { efectivoEsperado: 0, efectivoContado: null, diferenciaCaja: 0 };
}

/**
 * Quién hace «Cerrar el día» (preview y guardado): el que cobra y la gerencia.
 * El almacenero no ve las ventas del día (19-10: antes cualquier rol guardaba).
 */
export const ROLES_CIERRE_DEL_DIA = ["admin", "owner", "manager", "cajero"] as const;

/**
 * Los campos de caja del cierre hecho a mano («Cerrar el día»): quien cierra
 * cuenta SÓLO lo de las cajas abiertas (`esperadoAbiertas` = fondo + ventas en
 * efectivo + ingresos − retiros); las ya cerradas traen su propio conteo. Sin
 * conteo (`contado` null) quedan sólo las cerradas, como en el resumen del cron.
 * Ej.: fondo 100 + 300 vendidos, se cuentan 400 → diferencia 0 (no «sobran 100»).
 */
export function camposDeCajaDelCierreAMano(
  esperadoAbiertas: number,
  cerradas: CuadreDelDia,
  contado: number | null,
): { efectivoEsperado: number; efectivoContado: number | null; diferenciaCaja: number } {
  if (contado == null) return camposDeCajaDelResumen(cerradas);
  const esperado = r2(esperadoAbiertas + cerradas.esperado);
  const total = r2(contado + cerradas.contado);
  return { efectivoEsperado: esperado, efectivoContado: total, diferenciaCaja: r2(total - esperado) };
}

interface Entrada {
  cajas: readonly CajaCerradaDelDia[];
  /** Ventas del POS: toda venta es plata que entró. */
  ventas: ReadonlyArray<{ createdAt: Date | string; total: unknown }>;
  /** Pedidos: entran sólo los concretados (`pedidoEntraComoIngreso`). */
  pedidos: ReadonlyArray<{ createdAt: Date | string; total: unknown; status: string | null }>;
  resumenes: readonly ResumenGuardado[];
  /** El primer día que entra (`YYYY-MM-DD`, Lima); lo anterior se descarta. */
  desde: string;
}

/**
 * Una fila por día de Lima con cajas cerradas, ventas o un cierre hecho a mano
 * (el resumen vacío del cron solo no hace fila), del más nuevo al más viejo.
 */
export function armarDiasDeCaja({ cajas, ventas, pedidos, resumenes, desde }: Entrada): { dias: DiaDeCaja[]; totales: TotalesDeCaja } {
  const cajasPorDia = new Map<string, CajaCerradaDelDia[]>();
  for (const c of cajas) {
    const dia = diaDeCaja(c);
    if (!dia || dia < desde) continue;
    cajasPorDia.set(dia, [...(cajasPorDia.get(dia) ?? []), c]);
  }

  const ventasPorDia = new Map<string, { total: number; cantidad: number }>();
  const sumar = (createdAt: Date | string, total: unknown) => {
    const dia = limaDateKey(createdAt);
    if (!dia || dia < desde) return;
    const v = ventasPorDia.get(dia) ?? { total: 0, cantidad: 0 };
    v.total += num(total);
    v.cantidad++;
    ventasPorDia.set(dia, v);
  };
  for (const v of ventas) sumar(v.createdAt, v.total);
  for (const p of pedidos) if (pedidoEntraComoIngreso(p.status)) sumar(p.createdAt, p.total);

  /* `DailySummary.fecha` es el día a medianoche UTC: su día es la fecha tal cual.
     Puede haber dos (el del cron y uno a mano): gana el hecho a mano, y entre
     iguales el último. */
  const resumenPorDia = new Map<string, ResumenGuardado>();
  for (const r of resumenes) {
    const dia = new Date(r.fecha).toISOString().slice(0, 10);
    if (dia < desde) continue;
    const otro = resumenPorDia.get(dia);
    const aMano = r.creadoPor !== "cron";
    const otroAMano = otro ? otro.creadoPor !== "cron" : false;
    if (!otro || (aMano && !otroAMano) || (aMano === otroAMano && new Date(r.createdAt) > new Date(otro.createdAt))) {
      resumenPorDia.set(dia, r);
    }
  }

  const claves = new Set<string>([...cajasPorDia.keys(), ...ventasPorDia.keys()]);
  for (const [dia, r] of resumenPorDia) if (r.creadoPor !== "cron") claves.add(dia);

  const dias = [...claves]
    .sort((a, b) => b.localeCompare(a))
    .map((dia): DiaDeCaja => {
      const v = ventasPorDia.get(dia);
      const total = r2(v?.total ?? 0);
      const cantidad = v?.cantidad ?? 0;
      return {
        dia,
        cuadre: cuadreDeCajas(cajasPorDia.get(dia) ?? []),
        ventas: { total, cantidad, ticket: cantidad > 0 ? r2(total / cantidad) : 0 },
        resumen: resumenPorDia.get(dia) ?? null,
      };
    });

  const conCajas = dias.filter((d) => d.cuadre.cajas > 0);
  return {
    dias,
    totales: {
      dias: conCajas.length,
      sinConteo: conCajas.reduce((s, d) => s + d.cuadre.sinConteo, 0),
      recaudado: r2(conCajas.reduce((s, d) => s + d.cuadre.contado, 0)),
      discrepancia: r2(conCajas.reduce((s, d) => s + d.cuadre.faltante + d.cuadre.sobrante, 0)),
    },
  };
}
