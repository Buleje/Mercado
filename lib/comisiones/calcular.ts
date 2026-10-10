/**
 * Comisiones del equipo de mostrador — el cálculo vive en el backend.
 *
 * Antes «Comisiones» sumaba en el navegador: pedía `/api/sales?limit=500`
 * (un mes de bodega pasa de 500 ventas y lo que sobraba no comisionaba),
 * aplicaba porcentajes guardados en el `localStorage` de esa computadora (otro
 * admin veía otra cifra) y no descontaba devoluciones. Ahora:
 *
 *  - lo vendido sale de `CommissionsDB.cashierSummary` (neto de devoluciones);
 *  - la regla sale de `CommissionRule` (las mismas que ya guardaba
 *    `/api/commission-rules`): por vendedor, con tramos por monto vendido, y
 *    la regla `cashierId = "*"` como porcentaje general;
 *  - lo pagado sale de los gastos «Comisiones» que registra «Pagar»
 *    (`notes = comision:<vendedor>:<desde>:<hasta>`). Un pago que se pisa con
 *    el período sin caber dentro deja la fila en `cruce` y sin nada que pagar.
 */

export const CATEGORIA_GASTO_COMISIONES = "Comisiones";
/** `cashierId` de la regla que vale para todo el equipo. */
export const REGLA_GENERAL = "*";
/** Sin ninguna regla guardada: el 2 % que la pantalla usaba de siempre. */
export const TASA_POR_DEFECTO = 2;

export type ReglaComision = { id: string; cashierId: string; label: string; minSales: number; maxSales: number | null; rate: number };
export type VentasVendedor = { cashierId: string; cashierName: string; role: string; sales: number; revenue: number };
export type PagoComision = { id: string; amount: number; notes?: string | null; date: string };

export type FuenteTasa = "propia" | "general" | "por_defecto";
/** Un período de días de Lima, ambos bordes incluidos (YYYY-MM-DD). */
export type Rango = { desde: string; hasta: string };

export type FilaComision = {
  cashierId: string;
  cashierName: string;
  role: string;
  ventas: number;
  vendido: number;
  tasa: number;
  fuente: FuenteTasa;
  /** «S/ 0 – S/ 5,000» cuando la regla es un tramo. */
  tramo: string | null;
  comision: number;
  pagado: number;
  /** Lo que se puede pagar mirando ESTE período: 0 si hay `cruce`. */
  pendiente: number;
  ultimoPago: string | null;
  /**
   * Un pago de este vendedor que se pisa con el período sin caber dentro
   * (pagaste «Este mes» y ahora miras «Esta semana», o pagaste la semana del
   * 29/09 al 05/10 y miras setiembre). Esos días ya se pagaron en otro
   * período: no se descuentan por partes ni se pueden volver a pagar acá.
   */
  cruce: Rango | null;
  /** El pago del `cruce` ya incluye TODO el período que se mira. */
  cubierto: boolean;
  /** Los días del período que quedan fuera de los pagos que cruzan (para pagarlos aparte). */
  libre: Rango | null;
};

export type ResultadoComisiones = {
  desde: string;
  hasta: string;
  filas: FilaComision[];
  totales: { ventas: number; vendido: number; comision: number; pagado: number; pendiente: number };
  hayReglas: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function enTramo(r: ReglaComision, vendido: number): boolean {
  return vendido >= r.minSales && (r.maxSales == null || vendido < r.maxSales);
}

function tramoTexto(r: ReglaComision): string | null {
  if (r.minSales === 0 && r.maxSales == null) return null;
  const s = (n: number) => `S/ ${n.toLocaleString("es-PE")}`;
  return r.maxSales == null ? `desde ${s(r.minSales)}` : `${s(r.minSales)} – ${s(r.maxSales)}`;
}

/** La regla que le toca a un vendedor por lo que vendió: la suya, si no la general, si no el 2 %. */
export function tasaPara(cashierId: string, vendido: number, reglas: ReglaComision[]): { tasa: number; fuente: FuenteTasa; tramo: string | null } {
  const buscar = (id: string) =>
    reglas.filter((r) => r.cashierId === id).sort((a, b) => b.minSales - a.minSales).find((r) => enTramo(r, vendido));
  const propia = buscar(cashierId);
  if (propia) return { tasa: propia.rate, fuente: "propia", tramo: tramoTexto(propia) };
  const general = buscar(REGLA_GENERAL);
  if (general) return { tasa: general.rate, fuente: "general", tramo: tramoTexto(general) };
  return { tasa: TASA_POR_DEFECTO, fuente: "por_defecto", tramo: null };
}

export function marcaDePago(cashierId: string, desde: string, hasta: string): string {
  return `comision:${cashierId}:${desde}:${hasta}`;
}

/** `comision:<id>:<desde>:<hasta>` → partes; el id puede traer «:» (se toma todo menos las dos fechas). */
export function leerMarcaDePago(notes: string | null | undefined): { cashierId: string; desde: string; hasta: string } | null {
  const m = /^comision:(.+):(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec((notes ?? "").trim());
  return m ? { cashierId: m[1], desde: m[2], hasta: m[3] } : null;
}

/** Suma días a una fecha YYYY-MM-DD (aritmética en UTC: el día no depende del huso). */
export function moverDia(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Los pagos de un vendedor frente al período que se mira:
 *  - DENTRO del período (una semana pagada dentro de su mes): se descuentan;
 *  - fuera (no se tocan): no cuentan;
 *  - se pisan sin caber dentro: son un `cruce`. Antes contaban 0 y el mismo
 *    tramo se podía pagar dos veces (revisión 08-10: pagar «Este mes» y abrir
 *    «Esta semana» mostraba «pendiente 8» y otra vez «Pagar»).
 */
function pagadoEn(cashierId: string, desde: string, hasta: string, pagos: PagoComision[]) {
  let total = 0;
  let ultimo: string | null = null;
  const cruces: Rango[] = [];
  for (const p of pagos) {
    const marca = leerMarcaDePago(p.notes);
    if (!marca || marca.cashierId !== cashierId) continue;
    if (marca.hasta < desde || marca.desde > hasta) continue;
    if (marca.desde >= desde && marca.hasta <= hasta) {
      total += p.amount;
      if (!ultimo || p.date > ultimo) ultimo = p.date;
      continue;
    }
    cruces.push({ desde: marca.desde, hasta: marca.hasta });
  }
  cruces.sort((a, b) => a.desde.localeCompare(b.desde));
  return { total: r2(total), ultimo, cruces };
}

/**
 * Lo que queda del período al sacarle los pagos que cruzan. Un cruce siempre
 * sobresale por un lado (si no, cabría dentro): recorta el inicio o el final.
 */
export function rangoLibre(desde: string, hasta: string, cruces: Rango[]): Rango | null {
  let a = desde;
  let b = hasta;
  for (const c of cruces) {
    if (c.desde <= desde && c.hasta >= hasta) return null;
    if (c.desde <= desde) { const sig = moverDia(c.hasta, 1); if (sig > a) a = sig; }
    if (c.hasta >= hasta) { const ant = moverDia(c.desde, -1); if (ant < b) b = ant; }
  }
  return a <= b ? { desde: a, hasta: b } : null;
}

export function calcularComisiones(
  desde: string,
  hasta: string,
  ventas: VentasVendedor[],
  reglas: ReglaComision[],
  pagos: PagoComision[],
): ResultadoComisiones {
  const filas = ventas.map<FilaComision>((v) => {
    const { tasa, fuente, tramo } = tasaPara(v.cashierId, v.revenue, reglas);
    const comision = r2((v.revenue * tasa) / 100);
    const pagado = pagadoEn(v.cashierId, desde, hasta, pagos);
    const cubre = pagado.cruces.find((c) => c.desde <= desde && c.hasta >= hasta);
    const cruce = cubre ?? pagado.cruces[0] ?? null;
    return {
      cashierId: v.cashierId,
      cashierName: v.cashierName,
      role: v.role,
      ventas: v.sales,
      vendido: r2(v.revenue),
      tasa,
      fuente,
      tramo,
      comision,
      pagado: pagado.total,
      pendiente: cruce ? 0 : r2(Math.max(0, comision - pagado.total)),
      ultimoPago: pagado.ultimo,
      cruce,
      cubierto: cubre != null,
      libre: cruce ? rangoLibre(desde, hasta, pagado.cruces) : null,
    };
  });
  filas.sort((a, b) => b.vendido - a.vendido);
  const suma = (k: "ventas" | "vendido" | "comision" | "pagado" | "pendiente") => r2(filas.reduce((s, f) => s + f[k], 0));
  return {
    desde,
    hasta,
    filas,
    totales: { ventas: suma("ventas"), vendido: suma("vendido"), comision: suma("comision"), pagado: suma("pagado"), pendiente: suma("pendiente") },
    hayReglas: reglas.length > 0,
  };
}

/** Bordes del día en Lima (UTC−5 fijo) para filtrar `createdAt`. */
export function rangoLima(desde: string, hasta: string): { from: Date; to: Date } {
  return { from: new Date(`${desde}T00:00:00.000-05:00`), to: new Date(`${hasta}T23:59:59.999-05:00`) };
}
