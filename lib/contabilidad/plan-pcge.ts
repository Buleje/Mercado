/**
 * lib/contabilidad/plan-pcge.ts — Plan Contable General Empresarial 2019 (base) (ADR-529).
 *
 * Las 2 cifras = cuentas mayores con su nombre oficial; debajo, solo las
 * subcuentas que usan las reglas de asientos automáticos (y unas pocas de uso
 * diario: bancos, activo fijo, préstamos, depreciación). El negocio cuelga sus
 * propias (`CuentaContablePropia`) de cualquiera de estas.
 *
 * - Naturaleza por clase: 1-3 activo, 4 pasivo, 5 patrimonio, 6 y 8 gasto, 7 ingreso.
 * - Imputable = hoja de 3+ dígitos (acepta asientos); las demás solo agrupan.
 *
 * PURO y client-safe.
 */

import type { CuentaPlan, Naturaleza } from "./tipos";

const BASE: readonly (readonly [string, string])[] = [
  // ── Clase 1: activo disponible y exigible ──
  ["10", "Efectivo y equivalentes de efectivo"],
  ["101", "Caja"],
  ["1011", "Caja"],
  ["104", "Cuentas corrientes en instituciones financieras"],
  ["1041", "Cuentas corrientes operativas"],
  ["11", "Inversiones financieras"],
  ["12", "Cuentas por cobrar comerciales – terceros"],
  ["121", "Facturas, boletas y otros comprobantes por cobrar"],
  ["1212", "Clientes: facturas y boletas por cobrar"],
  ["122", "Anticipos de clientes"],
  ["1221", "Anticipos de clientes – terceros"],
  ["13", "Cuentas por cobrar comerciales – relacionadas"],
  ["14", "Cuentas por cobrar al personal, a los accionistas (socios), directores y gerentes"],
  ["141", "Personal"],
  ["1411", "Préstamos al personal"],
  ["1412", "Adelanto de remuneraciones"],
  ["1413", "Entregas a rendir cuenta"],
  ["16", "Cuentas por cobrar diversas – terceros"],
  ["162", "Reclamaciones a terceros"],
  ["1629", "Otras cuentas por cobrar a terceros (adelantos)"],
  ["17", "Cuentas por cobrar diversas – relacionadas"],
  ["18", "Servicios y otros contratados por anticipado"],
  ["19", "Estimación de cuentas de cobranza dudosa"],
  // ── Clase 2: existencias ──
  ["20", "Mercaderías"],
  ["201", "Mercaderías manufacturadas"],
  ["2011", "Mercaderías manufacturadas"],
  ["20111", "Mercaderías manufacturadas – costo"],
  ["21", "Productos terminados"],
  ["22", "Subproductos, desechos y desperdicios"],
  ["23", "Productos en proceso"],
  ["24", "Materias primas"],
  ["241", "Materias primas para productos manufacturados"],
  ["2411", "Materias primas para productos manufacturados"],
  ["24111", "Materias primas (madera) – costo"],
  ["25", "Materiales auxiliares, suministros y repuestos"],
  ["26", "Envases y embalajes"],
  ["27", "Activos no corrientes mantenidos para la venta"],
  ["28", "Existencias por recibir"],
  ["29", "Desvalorización de existencias"],
  // ── Clase 3: activo inmovilizado ──
  ["30", "Inversiones mobiliarias"],
  ["31", "Propiedades de inversión"],
  ["32", "Activos por derecho de uso"],
  ["33", "Propiedad, planta y equipo"],
  ["331", "Terrenos"],
  ["3311", "Terrenos"],
  ["332", "Edificaciones"],
  ["3321", "Edificaciones administrativas"],
  ["333", "Maquinarias y equipos de explotación"],
  ["3331", "Maquinarias y equipos de explotación"],
  ["334", "Unidades de transporte"],
  ["3341", "Vehículos motorizados"],
  ["335", "Muebles y enseres"],
  ["3351", "Muebles"],
  ["336", "Equipos diversos"],
  ["3361", "Equipo para procesamiento de información"],
  ["3369", "Otros equipos"],
  ["34", "Intangibles"],
  ["35", "Activos biológicos"],
  ["36", "Desvalorización de activo inmovilizado"],
  ["37", "Activo diferido"],
  ["38", "Otros activos"],
  ["39", "Depreciación, amortización y agotamiento acumulados"],
  ["391", "Depreciación acumulada"],
  ["3913", "Propiedad, planta y equipo – costo"],
  // ── Clase 4: pasivo ──
  ["40", "Tributos, contraprestaciones y aportes al sistema de pensiones y de salud por pagar"],
  ["401", "Gobierno central"],
  ["4011", "Impuesto general a las ventas"],
  ["40111", "IGV – Cuenta propia"],
  ["4017", "Impuesto a la renta"],
  ["40171", "Renta de tercera categoría"],
  ["403", "Instituciones públicas"],
  ["4031", "ESSALUD"],
  ["41", "Remuneraciones y participaciones por pagar"],
  ["411", "Remuneraciones por pagar"],
  ["4111", "Sueldos y salarios por pagar"],
  ["42", "Cuentas por pagar comerciales – terceros"],
  ["421", "Facturas, boletas y otros comprobantes por pagar"],
  ["4212", "Proveedores: facturas por pagar"],
  ["422", "Anticipos a proveedores"],
  ["4221", "Anticipos a proveedores – terceros"],
  ["43", "Cuentas por pagar comerciales – relacionadas"],
  ["44", "Cuentas por pagar a los accionistas (socios), directores y gerentes"],
  ["45", "Obligaciones financieras"],
  ["451", "Préstamos de instituciones financieras y otras entidades"],
  ["4511", "Instituciones financieras"],
  ["4512", "Otras entidades"],
  ["46", "Cuentas por pagar diversas – terceros"],
  ["469", "Otras cuentas por pagar diversas"],
  ["4699", "Movimientos de caja por aclarar"],
  ["47", "Cuentas por pagar diversas – relacionadas"],
  ["48", "Provisiones"],
  ["49", "Pasivo diferido"],
  // ── Clase 5: patrimonio ──
  ["50", "Capital"],
  ["501", "Capital social"],
  ["5011", "Acciones / participaciones"],
  ["51", "Acciones de inversión"],
  ["52", "Capital adicional"],
  ["56", "Resultados no realizados"],
  ["57", "Excedente de revaluación"],
  ["58", "Reservas"],
  ["59", "Resultados acumulados"],
  ["591", "Utilidades no distribuidas"],
  ["5911", "Utilidades acumuladas"],
  ["592", "Pérdidas acumuladas"],
  ["5921", "Pérdidas acumuladas"],
  // ── Clase 6: gastos por naturaleza ──
  ["60", "Compras"],
  ["61", "Variación de inventarios"],
  ["62", "Gastos de personal y directores"],
  ["621", "Remuneraciones"],
  ["6211", "Sueldos y salarios"],
  ["62111", "Sueldos y salarios"],
  ["63", "Gastos de servicios prestados por terceros"],
  ["631", "Transporte, correos y gastos de viaje"],
  ["6311", "Transporte"],
  ["63111", "Transporte de carga"],
  ["634", "Mantenimiento y reparaciones"],
  ["6343", "Inmuebles, maquinaria y equipo"],
  ["635", "Alquileres"],
  ["6352", "Alquileres de edificaciones"],
  ["63521", "Alquiler de terrenos"],
  ["63522", "Alquiler de edificaciones"],
  ["63523", "Alquiler de maquinarias y equipos"],
  ["636", "Servicios básicos"],
  ["6361", "Energía eléctrica"],
  ["63611", "Energía eléctrica"],
  ["6363", "Agua"],
  ["63631", "Agua"],
  ["6364", "Teléfono"],
  ["63641", "Teléfono e internet"],
  ["6369", "Otros servicios básicos"],
  ["63691", "Otros servicios básicos"],
  ["637", "Publicidad, publicaciones, relaciones públicas"],
  ["6371", "Publicidad"],
  ["63711", "Publicidad y marketing"],
  ["639", "Otros servicios prestados por terceros"],
  ["6399", "Otros servicios prestados por terceros"],
  ["63991", "Servicio de aserrío recibido"],
  ["64", "Gastos por tributos"],
  ["6431", "Impuesto predial"],
  ["65", "Otros gastos de gestión"],
  ["659", "Otros gastos de gestión"],
  ["6591", "Donaciones"],
  ["65911", "Donaciones"],
  ["6599", "Otros gastos de gestión"],
  ["65991", "Otros gastos de gestión (limpieza y varios)"],
  ["66", "Pérdida por medición de activos no financieros al valor razonable"],
  ["67", "Gastos financieros"],
  ["673", "Intereses por préstamos y otras obligaciones"],
  ["6731", "Préstamos de instituciones financieras"],
  ["676", "Diferencia de cambio"],
  ["6761", "Pérdida por diferencia de cambio"],
  ["679", "Otros gastos financieros"],
  ["6791", "Otros gastos financieros"],
  ["68", "Valuación y deterioro de activos y provisiones"],
  ["681", "Depreciación"],
  ["6814", "Depreciación de propiedad, planta y equipo – costo"],
  ["69", "Costo de ventas"],
  ["691", "Mercaderías"],
  ["6911", "Mercaderías manufacturadas"],
  ["69111", "Mercaderías manufacturadas – terceros"],
  ["692", "Productos terminados"],
  ["6921", "Productos manufacturados"],
  ["69211", "Costo de la madera vendida"],
  // ── Clase 7: ingresos ──
  ["70", "Ventas"],
  ["701", "Mercaderías"],
  ["7011", "Mercaderías manufacturadas"],
  ["70111", "Mercaderías manufacturadas – terceros"],
  ["702", "Productos terminados"],
  ["7021", "Productos manufacturados"],
  ["70211", "Madera vendida – terceros"],
  ["704", "Prestación de servicios"],
  ["7041", "Terceros"],
  ["70411", "Servicio de aserrío"],
  ["70412", "Servicio de flete"],
  ["71", "Variación de la producción almacenada"],
  ["72", "Producción de activo inmovilizado"],
  ["73", "Descuentos, rebajas y bonificaciones obtenidos"],
  ["74", "Descuentos, rebajas y bonificaciones concedidos"],
  ["75", "Otros ingresos de gestión"],
  ["754", "Alquileres"],
  ["7542", "Alquileres de edificaciones"],
  ["759", "Otros ingresos de gestión"],
  ["7599", "Otros ingresos de gestión"],
  ["76", "Ganancia por medición de activos no financieros al valor razonable"],
  ["77", "Ingresos financieros"],
  ["776", "Diferencia en cambio"],
  ["7761", "Ganancia por diferencia de cambio"],
  ["779", "Otros ingresos financieros"],
  ["7791", "Otros ingresos financieros"],
  ["78", "Cargas cubiertas por provisiones"],
  ["79", "Cargas imputables a cuentas de costos y gastos"],
  // ── Clase 8: saldos intermediarios ──
  ["88", "Impuesto a la renta"],
  ["881", "Impuesto a la renta – corriente"],
  ["89", "Determinación del resultado del ejercicio"],
];

/** Naturaleza por clase (1.er dígito). 74 (descuentos concedidos) sigue en ingreso como cuenta correctora. */
export function naturalezaDeCodigo(codigo: string): Naturaleza {
  const c = codigo.charAt(0);
  if (c === "1" || c === "2" || c === "3") return "activo";
  if (c === "4") return "pasivo";
  if (c === "5") return "patrimonio";
  if (c === "7") return "ingreso";
  return "gasto";
}

/** Deudora (activo, gasto) = debe − haber; acreedora (pasivo, patrimonio, ingreso) = haber − debe. */
export const esDeudora = (n: Naturaleza): boolean => n === "activo" || n === "gasto";

/** El PCGE base, ordenado por código. */
export const PLAN_PCGE: readonly CuentaPlan[] = (() => {
  const codigos = BASE.map(([c]) => c);
  return BASE.map(([codigo, nombre]) => ({
    codigo,
    nombre,
    naturaleza: naturalezaDeCodigo(codigo),
    imputable: codigo.length >= 3 && !codigos.some((o) => o !== codigo && o.startsWith(codigo)),
    propia: false,
    activa: true,
  })).sort((a, b) => a.codigo.localeCompare(b.codigo));
})();

export interface CuentaPropiaFila {
  codigo: string;
  nombre: string;
  naturaleza: string;
  activa: boolean;
}

const esNaturaleza = (s: string): s is Naturaleza =>
  s === "activo" || s === "pasivo" || s === "patrimonio" || s === "ingreso" || s === "gasto";

/**
 * PCGE + propias del negocio. Una propia siempre es imputable; su padre del PCGE
 * sigue aceptando asientos (las reglas automáticas escriben en él).
 */
export function fusionarConPropias(propias: readonly CuentaPropiaFila[]): CuentaPlan[] {
  const base = new Set(PLAN_PCGE.map((c) => c.codigo));
  const extra: CuentaPlan[] = propias
    .filter((p) => !base.has(p.codigo))
    .map((p) => ({
      codigo: p.codigo,
      nombre: p.nombre,
      naturaleza: esNaturaleza(p.naturaleza) ? p.naturaleza : naturalezaDeCodigo(p.codigo),
      imputable: true,
      propia: true,
      activa: p.activa,
    }));
  return [...PLAN_PCGE, ...extra].sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/** La cuenta de la que cuelga (el prefijo más largo que existe), o null. */
export function padreDe(codigo: string, plan: readonly CuentaPlan[]): CuentaPlan | null {
  for (let n = codigo.length - 1; n >= 2; n--) {
    const p = plan.find((c) => c.codigo === codigo.slice(0, n));
    if (p) return p;
  }
  return null;
}

/** Nombre de una cuenta (o el de su padre si no existe). */
export function nombreDeCuenta(codigo: string, plan: readonly CuentaPlan[]): string {
  return plan.find((c) => c.codigo === codigo)?.nombre ?? padreDe(codigo, plan)?.nombre ?? codigo;
}

/** ¿Acepta asientos? (existe, es imputable y está activa). */
export function esImputable(codigo: string, plan: readonly CuentaPlan[]): boolean {
  const c = plan.find((x) => x.codigo === codigo);
  return c != null && c.imputable && c.activa;
}
