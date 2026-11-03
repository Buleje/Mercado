/**
 * lib/contabilidad/reportes.ts — libro mayor, balance de comprobación (8 columnas),
 * estado de situación financiera, estado de resultados por naturaleza y el cruce
 * con «Resultado» (ADR-529). Todo sale de los asientos: si los asientos cuadran,
 * los reportes cuadran por construcción (y se verifica igual).
 *
 * Convención de montos en los estados: el estado de resultados muestra cada
 * renglón con su efecto en la utilidad (ingresos +, gastos −); el de situación,
 * cada renglón en positivo en su lado (un saldo al revés pasa al otro lado:
 * un proveedor al que le pagaste de más es un activo).
 *
 * PURO y client-safe.
 */

import { esDeudora, naturalezaDeCodigo, nombreDeCuenta } from "./plan-pcge";
import { r2 } from "./reglas";
import type {
  Asiento,
  ColumnasComprobacion,
  CruceConResultado,
  CuentaMayor,
  CuentaPlan,
  EstadoResultados,
  EstadoSituacion,
  FilaComprobacion,
  MovimientoMayor,
  RenglonEstado,
} from "./tipos";

export interface Sumas {
  debe: number;
  haber: number;
}
export type Saldos = Map<string, Sumas>;

const vivos = (asientos: readonly Asiento[]) => asientos.filter((a) => !a.anulado);
const esResultado = (codigo: string) => { const c = codigo.charAt(0); return c === "6" || c === "7" || c === "8" || c === "9"; };

/** Σ debe y Σ haber por cuenta de detalle. */
export function saldosPorCuenta(asientos: readonly Asiento[], into: Saldos = new Map()): Saldos {
  for (const a of vivos(asientos)) {
    for (const l of a.lineas) {
      const s = into.get(l.cuenta) ?? { debe: 0, haber: 0 };
      s.debe += l.debe;
      s.haber += l.haber;
      into.set(l.cuenta, s);
    }
  }
  return into;
}

const naturalezaEn = (codigo: string, plan: readonly CuentaPlan[]) => plan.find((c) => c.codigo === codigo)?.naturaleza ?? naturalezaDeCodigo(codigo);
const conSigno = (codigo: string, plan: readonly CuentaPlan[], debe: number, haber: number) => (esDeudora(naturalezaEn(codigo, plan)) ? debe - haber : haber - debe);

// ── Libro mayor ─────────────────────────────────────────────────────────────

/** Mayor del mes: con `cuenta`, las de detalle que empiezan con ese código y sus movimientos; sin ella, el resumen. */
export function mayor(plan: readonly CuentaPlan[], previos: readonly Asiento[], delMes: readonly Asiento[], cuenta?: string, conMovimientos = !!cuenta): CuentaMayor[] {
  const ini = saldosPorCuenta(previos);
  const mes = saldosPorCuenta(delMes);
  const codigos = [...new Set([...ini.keys(), ...mes.keys()])].filter((c) => !cuenta || c.startsWith(cuenta)).sort();
  return codigos.map((codigo) => {
    const i = ini.get(codigo) ?? { debe: 0, haber: 0 };
    const m = mes.get(codigo) ?? { debe: 0, haber: 0 };
    const saldoInicial = r2(conSigno(codigo, plan, i.debe, i.haber));
    const movimientos: MovimientoMayor[] = [];
    if (conMovimientos) {
      let saldo = saldoInicial;
      for (const a of [...vivos(delMes)].sort((x, y) => x.numero - y.numero)) {
        for (const l of a.lineas) {
          if (l.cuenta !== codigo) continue;
          saldo = r2(saldo + conSigno(codigo, plan, l.debe, l.haber));
          movimientos.push({ asientoId: a.id, numero: a.numero, fecha: a.fecha, glosa: l.glosa ?? a.glosa, tercero: l.tercero, debe: l.debe, haber: l.haber, saldo });
        }
      }
    }
    return {
      codigo,
      nombre: nombreDeCuenta(codigo, plan),
      naturaleza: naturalezaEn(codigo, plan),
      saldoInicial,
      debe: r2(m.debe),
      haber: r2(m.haber),
      saldoFinal: r2(saldoInicial + conSigno(codigo, plan, m.debe, m.haber)),
      movimientos,
    };
  });
}

// ── Balance de comprobación ────────────────────────────────────────────────

const CERO: ColumnasComprobacion = { sumasDebe: 0, sumasHaber: 0, saldoDeudor: 0, saldoAcreedor: 0, activo: 0, pasivo: 0, perdidas: 0, ganancias: 0 };

/**
 * Lo de antes del ejercicio: las cuentas de balance arrastran su saldo; los
 * resultados de años anteriores entran como 59 (resultados acumulados).
 */
export function arrastreAlEjercicio(previos: Saldos): Saldos {
  const out: Saldos = new Map();
  let resultado = 0;
  for (const [c, s] of previos) {
    if (esResultado(c)) resultado += s.haber - s.debe;
    else out.set(c, { debe: s.debe, haber: s.haber });
  }
  if (Math.abs(resultado) >= 0.005) {
    const cuenta = resultado >= 0 ? "5911" : "5921";
    const s = out.get(cuenta) ?? { debe: 0, haber: 0 };
    if (resultado >= 0) s.haber += resultado;
    else s.debe += -resultado;
    out.set(cuenta, s);
  }
  return out;
}

/** 8 columnas por cuenta de 2 dígitos. `saldos` = arrastre + movimientos del ejercicio hasta el mes. */
export function comprobacion(plan: readonly CuentaPlan[], saldos: Saldos): { filas: FilaComprobacion[]; totales: ColumnasComprobacion; resultadoDelEjercicio: number; cuadra: boolean } {
  const por2 = new Map<string, Sumas>();
  for (const [c, s] of saldos) {
    const k = c.slice(0, 2);
    const t = por2.get(k) ?? { debe: 0, haber: 0 };
    t.debe += s.debe;
    t.haber += s.haber;
    por2.set(k, t);
  }
  const filas: FilaComprobacion[] = [...por2.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([codigo, s]) => {
      const neto = r2(s.debe - s.haber);
      const deudor = neto > 0 ? neto : 0;
      const acreedor = neto < 0 ? -neto : 0;
      const res = esResultado(codigo);
      return {
        codigo,
        nombre: nombreDeCuenta(codigo, plan),
        sumasDebe: r2(s.debe),
        sumasHaber: r2(s.haber),
        saldoDeudor: deudor,
        saldoAcreedor: acreedor,
        activo: res ? 0 : deudor,
        pasivo: res ? 0 : acreedor,
        perdidas: res ? deudor : 0,
        ganancias: res ? acreedor : 0,
      };
    })
    .filter((f) => f.sumasDebe !== 0 || f.sumasHaber !== 0);
  const totales = { ...CERO };
  for (const f of filas) for (const k of Object.keys(CERO) as (keyof ColumnasComprobacion)[]) totales[k] = r2(totales[k] + f[k]);
  const resultadoDelEjercicio = r2(totales.ganancias - totales.perdidas);
  const cuadra =
    Math.abs(totales.sumasDebe - totales.sumasHaber) < 0.005 &&
    Math.abs(totales.saldoDeudor - totales.saldoAcreedor) < 0.005 &&
    Math.abs(totales.activo - totales.pasivo - resultadoDelEjercicio) < 0.005;
  return { filas, totales, resultadoDelEjercicio, cuadra };
}

// ── Estado de situación financiera ─────────────────────────────────────────

type Seccion = "activoCorriente" | "activoNoCorriente" | "pasivoCorriente" | "pasivoNoCorriente" | "patrimonio";
interface ItemSituacion {
  clave: string;
  etiqueta: string;
  seccion: Seccion;
  prefijos: string[];
  excluir?: string[];
  /** Si el saldo sale al revés, va a esta sección con esta etiqueta. */
  alReves?: { seccion: Seccion; etiqueta: string };
}

const ITEMS_SITUACION: ItemSituacion[] = [
  { clave: "efectivo", etiqueta: "Efectivo y equivalentes de efectivo", seccion: "activoCorriente", prefijos: ["10"], alReves: { seccion: "pasivoCorriente", etiqueta: "Sobregiros (caja en negativo)" } },
  { clave: "inversiones_financieras", etiqueta: "Inversiones financieras", seccion: "activoCorriente", prefijos: ["11"] },
  { clave: "por_cobrar_comerciales", etiqueta: "Cuentas por cobrar comerciales", seccion: "activoCorriente", prefijos: ["12", "13"], excluir: ["122"], alReves: { seccion: "pasivoCorriente", etiqueta: "Cobros de más a clientes" } },
  { clave: "por_cobrar_personal", etiqueta: "Cuentas por cobrar al personal", seccion: "activoCorriente", prefijos: ["14"], alReves: { seccion: "pasivoCorriente", etiqueta: "Por devolver al personal" } },
  { clave: "por_cobrar_diversas", etiqueta: "Otras cuentas por cobrar", seccion: "activoCorriente", prefijos: ["16", "17", "19"], alReves: { seccion: "pasivoCorriente", etiqueta: "Por devolver a terceros" } },
  { clave: "anticipos_proveedores", etiqueta: "Anticipos a proveedores", seccion: "activoCorriente", prefijos: ["422"], alReves: { seccion: "pasivoCorriente", etiqueta: "Anticipos a proveedores por regularizar" } },
  { clave: "gastos_anticipados", etiqueta: "Servicios contratados por anticipado", seccion: "activoCorriente", prefijos: ["18"] },
  { clave: "existencias", etiqueta: "Existencias (mercadería y madera)", seccion: "activoCorriente", prefijos: ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"] },
  { clave: "inversiones", etiqueta: "Inversiones y propiedades de inversión", seccion: "activoNoCorriente", prefijos: ["30", "31", "32"] },
  { clave: "ppe", etiqueta: "Propiedad, planta y equipo (neto de depreciación)", seccion: "activoNoCorriente", prefijos: ["33", "36", "39"] },
  { clave: "intangibles", etiqueta: "Intangibles", seccion: "activoNoCorriente", prefijos: ["34"] },
  { clave: "otros_activos", etiqueta: "Otros activos", seccion: "activoNoCorriente", prefijos: ["35", "37", "38"] },
  { clave: "tributos", etiqueta: "Tributos por pagar", seccion: "pasivoCorriente", prefijos: ["40"], alReves: { seccion: "activoCorriente", etiqueta: "Tributos por recuperar (crédito fiscal)" } },
  { clave: "remuneraciones", etiqueta: "Remuneraciones por pagar", seccion: "pasivoCorriente", prefijos: ["41"], alReves: { seccion: "activoCorriente", etiqueta: "Pagos de más al personal" } },
  { clave: "proveedores", etiqueta: "Cuentas por pagar comerciales", seccion: "pasivoCorriente", prefijos: ["42", "43"], excluir: ["422"], alReves: { seccion: "activoCorriente", etiqueta: "Pagos a proveedores por regularizar" } },
  { clave: "anticipos_clientes", etiqueta: "Anticipos de clientes", seccion: "pasivoCorriente", prefijos: ["122"], alReves: { seccion: "activoCorriente", etiqueta: "Anticipos de clientes por regularizar" } },
  { clave: "obligaciones_financieras", etiqueta: "Obligaciones financieras", seccion: "pasivoCorriente", prefijos: ["45"] },
  { clave: "por_pagar_diversas", etiqueta: "Otras cuentas por pagar (incluye caja por aclarar)", seccion: "pasivoCorriente", prefijos: ["44", "46", "47"], alReves: { seccion: "activoCorriente", etiqueta: "Caja por aclarar (salió más de lo que entró)" } },
  { clave: "provisiones", etiqueta: "Provisiones", seccion: "pasivoCorriente", prefijos: ["48"] },
  { clave: "pasivo_diferido", etiqueta: "Pasivo diferido", seccion: "pasivoNoCorriente", prefijos: ["49"] },
  { clave: "capital", etiqueta: "Capital", seccion: "patrimonio", prefijos: ["50", "51", "52"] },
  { clave: "reservas", etiqueta: "Reservas y excedentes", seccion: "patrimonio", prefijos: ["56", "57", "58"] },
  { clave: "resultados_acumulados", etiqueta: "Resultados acumulados", seccion: "patrimonio", prefijos: ["59"] },
];

const esActivo = (s: Seccion) => s === "activoCorriente" || s === "activoNoCorriente";
const coincide = (codigo: string, it: ItemSituacion) =>
  it.prefijos.some((p) => codigo.startsWith(p)) && !(it.excluir ?? []).some((p) => codigo.startsWith(p));

/**
 * Situación al cierre: `saldos` = TODAS las cuentas desde el inicio (balance y
 * resultados). Los resultados de antes del ejercicio van a «resultados
 * acumulados»; los del ejercicio, a su renglón.
 */
export function estadoSituacion(saldos: Saldos, resultadoDelEjercicio: number, resultadoAnterior: number): EstadoSituacion {
  const montos = new Map<string, { item: ItemSituacion; deudor: number; cuentas: Set<string> }>();
  const otros: Record<"activo" | "pasivo" | "patrimonio", ItemSituacion> = {
    activo: { clave: "otros_activos_sin_grupo", etiqueta: "Otros activos", seccion: "activoCorriente", prefijos: [] },
    pasivo: { clave: "otros_pasivos", etiqueta: "Otros pasivos", seccion: "pasivoCorriente", prefijos: [] },
    patrimonio: { clave: "otro_patrimonio", etiqueta: "Otras cuentas de patrimonio", seccion: "patrimonio", prefijos: [] },
  };
  for (const [codigo, s] of saldos) {
    if (esResultado(codigo)) continue;
    const nat = naturalezaDeCodigo(codigo);
    const item = ITEMS_SITUACION.find((it) => coincide(codigo, it)) ?? (nat === "activo" ? otros.activo : nat === "pasivo" ? otros.pasivo : otros.patrimonio);
    const m = montos.get(item.clave) ?? { item, deudor: 0, cuentas: new Set<string>() };
    m.deudor += s.debe - s.haber;
    m.cuentas.add(codigo.slice(0, Math.min(codigo.length, 4)));
    montos.set(item.clave, m);
  }
  const secciones: Record<Seccion, RenglonEstado[]> = { activoCorriente: [], activoNoCorriente: [], pasivoCorriente: [], pasivoNoCorriente: [], patrimonio: [] };
  for (const it of [...ITEMS_SITUACION, otros.activo, otros.pasivo, otros.patrimonio]) {
    const m = montos.get(it.clave);
    if (!m) continue;
    const enSuLado = r2(esActivo(it.seccion) ? m.deudor : -m.deudor);
    if (Math.abs(enSuLado) < 0.005) continue;
    const cuentas = [...m.cuentas].sort();
    if (enSuLado < 0 && it.alReves) {
      secciones[it.alReves.seccion].push({ clave: `${it.clave}_al_reves`, etiqueta: it.alReves.etiqueta, monto: -enSuLado, cuentas, nivel: 1 });
    } else {
      secciones[it.seccion].push({ clave: it.clave, etiqueta: it.etiqueta, monto: enSuLado, cuentas, nivel: 1 });
    }
  }
  const acum = secciones.patrimonio.find((r) => r.clave === "resultados_acumulados");
  if (Math.abs(resultadoAnterior) >= 0.005) {
    if (acum) acum.monto = r2(acum.monto + resultadoAnterior);
    else secciones.patrimonio.push({ clave: "resultados_acumulados", etiqueta: "Resultados acumulados", monto: r2(resultadoAnterior), cuentas: ["59"], nivel: 1 });
  }
  secciones.patrimonio.push({ clave: "resultado_del_ejercicio", etiqueta: "Resultado del ejercicio", monto: r2(resultadoDelEjercicio), cuentas: ["6", "7"], nivel: 1 });
  const suma = (rs: RenglonEstado[]) => r2(rs.reduce((a, r) => a + r.monto, 0));
  const totalActivo = r2(suma(secciones.activoCorriente) + suma(secciones.activoNoCorriente));
  const totalPasivo = r2(suma(secciones.pasivoCorriente) + suma(secciones.pasivoNoCorriente));
  const totalPatrimonio = suma(secciones.patrimonio);
  const diferencia = r2(totalActivo - totalPasivo - totalPatrimonio);
  return {
    activoCorriente: secciones.activoCorriente,
    activoNoCorriente: secciones.activoNoCorriente,
    totalActivo,
    pasivoCorriente: secciones.pasivoCorriente,
    pasivoNoCorriente: secciones.pasivoNoCorriente,
    totalPasivo,
    patrimonio: secciones.patrimonio,
    totalPatrimonio,
    cuadra: Math.abs(diferencia) < 0.005,
    diferencia,
  };
}

// ── Estado de resultados por naturaleza ────────────────────────────────────

interface ItemResultado { clave: string; etiqueta: string; prefijos: string[] }
const BLOQUES: { items: ItemResultado[]; subtotal: { clave: string; etiqueta: string } }[] = [
  { items: [{ clave: "ventas", etiqueta: "Ventas", prefijos: ["70"] }, { clave: "descuentos", etiqueta: "Descuentos concedidos", prefijos: ["74"] }], subtotal: { clave: "ventas_netas", etiqueta: "Ventas netas" } },
  { items: [{ clave: "costo_ventas", etiqueta: "Costo de ventas", prefijos: ["69", "60", "61"] }], subtotal: { clave: "utilidad_bruta", etiqueta: "Utilidad bruta" } },
  {
    items: [
      { clave: "personal", etiqueta: "Gastos de personal", prefijos: ["62"] },
      { clave: "servicios", etiqueta: "Servicios de terceros", prefijos: ["63"] },
      { clave: "tributos", etiqueta: "Tributos", prefijos: ["64"] },
      { clave: "otros_gastos", etiqueta: "Otros gastos de gestión", prefijos: ["65", "66"] },
      { clave: "depreciacion", etiqueta: "Depreciación y provisiones", prefijos: ["68"] },
      { clave: "otros_ingresos", etiqueta: "Otros ingresos de gestión", prefijos: ["75", "71", "72", "73", "76", "78"] },
    ],
    subtotal: { clave: "utilidad_operativa", etiqueta: "Utilidad operativa" },
  },
  {
    items: [
      { clave: "ingresos_financieros", etiqueta: "Ingresos financieros", prefijos: ["77"] },
      { clave: "gastos_financieros", etiqueta: "Gastos financieros", prefijos: ["67"] },
      { clave: "otros_resultados", etiqueta: "Otros", prefijos: ["79", "8", "9"] },
    ],
    subtotal: { clave: "utilidad_antes_impuestos", etiqueta: "Utilidad antes de impuestos" },
  },
];

/** Estado de resultados con los saldos del período (solo clases 6-9). */
export function estadoResultados(saldos: Saldos): EstadoResultados {
  const renglones: RenglonEstado[] = [];
  let acumulado = 0;
  const usados = new Set<string>();
  const todos = BLOQUES.flatMap((b) => b.items);
  // «Otros» se lleva lo que ningún prefijo más específico tomó (p. ej. 88).
  const itemDe = (codigo: string) =>
    todos.filter((it) => it.prefijos.some((p) => codigo.startsWith(p))).sort((a, b) => Math.max(...b.prefijos.filter((p) => codigo.startsWith(p)).map((p) => p.length)) - Math.max(...a.prefijos.filter((p) => codigo.startsWith(p)).map((p) => p.length)))[0] ?? todos[todos.length - 1];
  const porItem = new Map<string, { monto: number; cuentas: Set<string> }>();
  for (const [codigo, s] of saldos) {
    if (!esResultado(codigo)) continue;
    const it = itemDe(codigo);
    const m = porItem.get(it.clave) ?? { monto: 0, cuentas: new Set<string>() };
    m.monto += s.haber - s.debe;
    m.cuentas.add(codigo.slice(0, 2));
    porItem.set(it.clave, m);
    usados.add(codigo);
  }
  for (const b of BLOQUES) {
    for (const it of b.items) {
      const m = porItem.get(it.clave);
      if (!m && it.clave !== "ventas" && it.clave !== "costo_ventas") continue;
      const monto = r2(m?.monto ?? 0);
      acumulado += monto;
      renglones.push({ clave: it.clave, etiqueta: it.etiqueta, monto, cuentas: m ? [...m.cuentas].sort() : it.prefijos, nivel: 1 });
    }
    renglones.push({ clave: b.subtotal.clave, etiqueta: b.subtotal.etiqueta, monto: r2(acumulado), cuentas: [], nivel: 0 });
  }
  return { renglones, utilidad: r2(acumulado) };
}

/** Efecto de unos asientos en la utilidad (Σ haber − Σ debe de las clases 6-9). */
export function efectoEnResultado(asientos: readonly Asiento[]): number {
  let t = 0;
  for (const a of vivos(asientos)) for (const l of a.lineas) if (esResultado(l.cuenta)) t += l.haber - l.debe;
  return r2(t);
}

/** Separa saldos en lo de balance y lo de resultados. */
export function soloResultados(s: Saldos): Saldos {
  return new Map([...s].filter(([c]) => esResultado(c)));
}

export interface EntradaCruce {
  resultadoDelPanel: number;
  igvVentas: number;
  igvCompras: number;
  ajustesManuales: number;
  otrasFuentes: number;
  utilidadContable: number;
}

/** utilidad contable = resultado del panel − IGV de ventas + IGV de compras + manuales (+ otras fuentes: hoy 0). */
export function cruceConResultado(e: EntradaCruce): CruceConResultado {
  const esperado = e.resultadoDelPanel - e.igvVentas + e.igvCompras + e.ajustesManuales + e.otrasFuentes;
  return {
    resultadoDelPanel: r2(e.resultadoDelPanel),
    igvVentas: r2(e.igvVentas),
    igvCompras: r2(e.igvCompras),
    ajustesManuales: r2(e.ajustesManuales),
    otrasFuentes: r2(e.otrasFuentes),
    utilidadContable: r2(e.utilidadContable),
    diferencia: r2(e.utilidadContable - esperado),
  };
}
