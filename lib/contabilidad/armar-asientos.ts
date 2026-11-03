/**
 * lib/contabilidad/armar-asientos.ts — las filas del mes → asientos automáticos (ADR-529).
 *
 * Un hecho (una fila de «Resultado» o de «Caja del mes») = un asiento, con
 * `origen = <fuente>:<id>` y la certeza de la fila. Más lo que nunca fue caja:
 * los CRUCES (adelanto descontado con trabajo, producto o en el pago de la
 * semana) y las COMPENSACIONES (lo cruzado en una liquidación o en la cuenta
 * forestal). Los movimientos manuales de caja que no se sabe qué son van a
 * 4699 y salen como aviso; los que son la otra cara de algo ya contado
 * (retiro de un gasto, cobro de un fiado, devolución o alta de un adelanto,
 * pago de una liquidación) no se repiten. Los alquileres NO entran: no mueven
 * caja ni resultado del negocio (ADR-524).
 *
 * PURO y client-safe.
 */

import type {
  Certeza,
  EnlaceOrigen,
  FilaFuente,
  FuenteCaja,
  FuenteResultado,
} from "@/lib/finance/resultado-del-negocio";
import type { Asiento, AvisoContable, LineaAsiento, TipoAsiento } from "./tipos";
import {
  cuentaDeAdelantoDado,
  cuentaDeDescuento,
  lineasDeRegla,
  r2,
  reglaDeGasto,
  type ContextoReglas,
  type LineaCruda,
  type OpcionesLinea,
  type ReglaId,
} from "./reglas";
import { esGastoDePersonal } from "@/lib/finance/resultado-del-negocio";
import { ES_COBRO_DE_FIADO, ES_PAGO_A_PROVEEDOR, gastoDelRetiro } from "@/lib/finance/cuentas-del-periodo";

export type FuenteCajaOSinSumar = FuenteCaja | "caja_sin_sumar";

/** Una entrega de adelanto del mes que no tuvo movimiento de caja (se pagó con trabajo, producto o descuento). */
export interface CruceEntrada {
  id: string;
  fecha: string;
  quien: string | null;
  codigo: string | null;
  monto: number;
  direccion: "DADO" | "RECIBIDO";
}

/**
 * Lo cruzado sin plata: `montoCompensado` de una liquidación o una compensación
 * de la cuenta forestal (que no sea el cruce de una cubicación).
 */
export interface CompensacionEntrada {
  id: string;
  fecha: string;
  quien: string | null;
  codigo: string | null;
  monto: number;
  moneda: string | null;
  /** La liquidación (sus cuentas salen del tipo de persona); null = cuenta forestal. */
  liquidacionId: string | null;
  /** Con quién: persona de Adelantos, parte de la cuenta forestal, o ninguno (→ aviso). */
  con: "persona" | "parte" | null;
}

/** Lo que trae `ResultadoNegocioDB.filasDelMes`: las MISMAS filas de los renglones. */
export interface FilasDelMes {
  mes: string;
  resultado: Partial<Record<FuenteResultado, FilaFuente[]>>;
  caja: Partial<Record<FuenteCajaOSinSumar, FilaFuente[]>>;
  /** `armarResultado(mes).resultado` (null = renglón sin monto, p. ej. planilla sin datos). */
  resultadoDelPanel: number;
  /** `armarCaja(mes).neto`. */
  cajaNeto: number;
  cruces: CruceEntrada[];
  /** Lo compensado del mes (liquidaciones y cuenta forestal). */
  compensaciones?: CompensacionEntrada[];
  /** Montos en otra moneda que esas pantallas ya dejaron fuera. */
  otrasMonedas: number;
  /** liquidación id → `AdelantoBeneficiario.id` (para saber si es de personal). */
  liquidacionBeneficiario?: Readonly<Record<string, string | null>>;
}

export interface GastoExtra {
  category: string | null;
  documentNumber: string | null;
  igvAmount: number | null;
  afectoIgv: boolean;
}

/** Datos por fila que el DB class trae por lote (no cambian las filas). */
export interface DatosExtra {
  gastos: Readonly<Record<string, GastoExtra>>;
  /** adelanto id → `AdelantoBeneficiario.tipoRelacion`. */
  relacionAdelanto: Readonly<Record<string, string | null>>;
  /** entrega id → tipoRelacion de su adelanto. */
  relacionEntrega: Readonly<Record<string, string | null>>;
  /** liquidación id → tipoRelacion de la persona. */
  relacionLiquidacion: Readonly<Record<string, string | null>>;
}

export const SIN_EXTRA: DatosExtra = { gastos: {}, relacionAdelanto: {}, relacionEntrega: {}, relacionLiquidacion: {} };

export interface AsientosDelMes {
  asientos: Asiento[];
  avisos: AvisoContable[];
  igvVentas: number;
  igvCompras: number;
  /** Efecto en la utilidad de lo que NO está en «Resultado»: 0 desde que los alquileres salieron (ADR-524). */
  otrasFuentes: number;
  /** Neto a caja de lo que no está en «Caja del mes» (manuales por aclarar, pagos a proveedor). */
  cajaFueraDelPanel: number;
}

const REGLA_DE_FUENTE: Record<Exclude<FuenteResultado, "gastos"> | Exclude<FuenteCajaOSinSumar, never>, ReglaId> = {
  mostrador: "venta_mostrador",
  pedidos: "venta_pedido",
  aserrio: "aserrio_cobrado",
  madera_vendida: "madera_vendida",
  fletes_cobrados: "flete_cobrado",
  mercaderia: "costo_mercaderia",
  costo_madera: "costo_madera",
  aserrio_recibido: "aserrio_recibido",
  fletes_pagados: "flete_pagado",
  planilla: "planilla",
  mostrador_cobrado: "cobro_mostrador",
  pedidos_cobrados: "cobro_pedido",
  cobros_forestales: "cobro_forestal",
  liquidacion_recibida: "liquidacion_recibida",
  adelanto_recibido: "adelanto_recibido",
  adelanto_devuelto: "adelanto_devuelto",
  adelanto_dado: "adelanto_dado",
  pagos_forestales: "pago_forestal",
  liquidacion_pagada: "liquidacion_pagada",
  gastos_pagados: "gasto_pagado",
  fletes_pagados_caja: "flete_pagado_caja",
  recibido_devuelto: "recibido_devuelto",
  caja_sin_sumar: "caja_por_aclarar",
};

/** Orden de llegada dentro de un mismo día (primero lo devengado, después la caja). */
const ORDEN_FUENTES = [
  "mostrador", "pedidos", "aserrio", "madera_vendida", "fletes_cobrados",
  "mercaderia", "costo_madera", "aserrio_recibido", "fletes_pagados", "gastos", "planilla",
  "mostrador_cobrado", "pedidos_cobrados", "cobros_forestales", "liquidacion_recibida", "adelanto_recibido", "adelanto_devuelto",
  "adelanto_dado", "pagos_forestales", "liquidacion_pagada", "gastos_pagados", "fletes_pagados_caja", "recibido_devuelto",
  "cruce", "compensacion", "caja_sin_sumar",
] as const;
const ordenDe = (fuente: string) => {
  const i = (ORDEN_FUENTES as readonly string[]).indexOf(fuente);
  return i < 0 ? ORDEN_FUENTES.length : i;
};

/** El movimiento manual que `calcularCaja` marcó como la otra cara de algo ya contado. */
const MARCA_YA_CONTADO = / · (ya contado: devolución del adelanto|del adelanto |es el pago de una liquidación)/;
export const esOtraCaraDeAlgoContado = (que: string): boolean => MARCA_YA_CONTADO.test(que);

/** «Retiro de caja: Pago a proveedor …» → «Pago a proveedor …» (el texto que guardó la caja). */
const textoDeManual = (que: string) => que.replace(/^(Ingreso|Retiro) de caja: /, "");
const esSoles = (moneda: string | null | undefined) => (moneda?.trim() || "PEN").toUpperCase() === "PEN";

const esPagoRrhh = (doc: string | null | undefined) => /^RRHH-/i.test(doc?.trim() ?? "");

export interface DatosAsiento {
  id: string;
  periodo: string;
  fecha: string;
  glosa: string;
  tipo: TipoAsiento;
  origen: string | null;
  regla: string | null;
  enlace: EnlaceOrigen | null;
  certeza: Certeza;
  anulado?: boolean;
  editable?: boolean;
  lineas: (LineaCruda & { glosa?: string | null; tercero?: string | null })[];
}

/** Arma un `Asiento` (número provisorio 0: lo pone `numerar`). */
export function crearAsiento(d: DatosAsiento, nombreDe: (codigo: string) => string): Asiento {
  const lineas: LineaAsiento[] = d.lineas.map((l) => ({
    cuenta: l.cuenta,
    nombreCuenta: nombreDe(l.cuenta),
    debe: r2(l.debe),
    haber: r2(l.haber),
    glosa: l.glosa ?? null,
    tercero: l.tercero ?? null,
  }));
  return {
    id: d.id,
    numero: 0,
    periodo: d.periodo,
    fecha: d.fecha,
    glosa: d.glosa,
    tipo: d.tipo,
    origen: d.origen,
    regla: d.regla,
    enlace: d.enlace,
    total: r2(lineas.reduce((a, l) => a + l.debe, 0)),
    lineas,
    certeza: d.certeza,
    anulado: d.anulado ?? false,
    editable: d.editable ?? false,
  };
}

/** Correlativo del mes: por fecha, luego el orden de la fuente, luego el id. Devuelve una copia. */
export function numerar(asientos: readonly Asiento[]): Asiento[] {
  const clave = (a: Asiento) => ordenDe(a.origen?.split(":")[0] ?? "zz_manual");
  return [...asientos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || clave(a) - clave(b) || a.id.localeCompare(b.id))
    .map((a, i) => ({ ...a, numero: i + 1 }));
}

export function sumasDe(asientos: readonly Asiento[]): { debe: number; haber: number } {
  let debe = 0;
  let haber = 0;
  for (const a of asientos) {
    if (a.anulado) continue;
    for (const l of a.lineas) {
      debe += l.debe;
      haber += l.haber;
    }
  }
  return { debe: r2(debe), haber: r2(haber) };
}

/** Los asientos automáticos del mes. */
export function armarAsientos(f: FilasDelMes, extra: DatosExtra, ctx: ContextoReglas, nombreDe: (c: string) => string): AsientosDelMes {
  const asientos: Asiento[] = [];
  let igvVentas = 0;
  let igvCompras = 0;
  const otrasFuentes = 0;
  let cajaFuera = 0;
  let sinCuenta = 0;
  let sinCuentaMonto = 0;
  // El retiro `gasto-caja-<id>` de un gasto que está en el mes ya lo cuenta su gasto (`filaDeCaja`).
  const gastosVivos = new Set([...(f.resultado.gastos ?? []), ...(f.caja.gastos_pagados ?? [])].map((g) => g.id));
  for (const id of Object.keys(extra.gastos)) gastosVivos.add(id);
  let porAclarar = 0;
  let porAclararMonto = 0;
  let otrasMonedas = f.otrasMonedas;

  const agregar = (fuente: string, fila: FilaFuente, regla: ReglaId, op: OpcionesLinea = {}) => {
    const r = lineasDeRegla(regla, fila.monto, ctx, op);
    if (r.lineas.length === 0) return;
    igvVentas += r.igvVenta;
    igvCompras += r.igvCompra;
    // La planilla repite el id de la persona cada mes: el mes va en el origen.
    const idOrigen = fuente === "planilla" ? `${fila.id}:${f.mes}` : fila.id;
    const origen = `${fuente}:${idOrigen}`;
    asientos.push(
      crearAsiento(
        {
          id: `auto:${origen}`,
          periodo: f.mes,
          fecha: fila.fecha,
          glosa: fila.quien ? `${fila.que} · ${fila.quien}` : fila.que,
          tipo: "auto",
          origen,
          regla,
          enlace: fila.enlace,
          certeza: fila.certeza,
          lineas: r.lineas.map((l) => ({ ...l, tercero: fila.quien })),
        },
        nombreDe,
      ),
    );
  };

  // ── Lo devengado (las filas de «Resultado») ──
  for (const [fuente, filas] of Object.entries(f.resultado) as [FuenteResultado, FilaFuente[]][]) {
    for (const fila of filas) {
      if (fuente === "gastos") {
        const g = extra.gastos[fila.id];
        const regla = reglaDeGasto(g?.category);
        agregar(fuente, fila, regla, { igvCompra: g?.igvAmount ?? null, afectoIgv: g?.afectoIgv ?? false });
      } else {
        agregar(fuente, fila, REGLA_DE_FUENTE[fuente]);
      }
    }
  }

  // ── La caja (las filas de «Caja del mes») ──
  for (const [fuente, filas] of Object.entries(f.caja) as [FuenteCajaOSinSumar, FilaFuente[]][]) {
    for (const fila of filas) {
      const regla = REGLA_DE_FUENTE[fuente];
      if (fuente === "caja_sin_sumar") {
        if (esOtraCaraDeAlgoContado(fila.que)) continue;
        const gasto = gastoDelRetiro(fila.id);
        if (gasto !== null && gastosVivos.has(gasto)) continue;
        const texto = textoDeManual(fila.que);
        if (ES_COBRO_DE_FIADO.test(texto)) continue; // la cuota del fiado ya está en «Cobro en el mostrador»
        if (ES_PAGO_A_PROVEEDOR.test(texto) && fila.monto < 0) {
          // «Caja del mes» no tiene los `Payment`: es plata que salió a pagar una deuda.
          cajaFuera += fila.monto;
          agregar(fuente, { ...fila, monto: -fila.monto }, "pago_proveedor");
          continue;
        }
        porAclarar += 1;
        porAclararMonto += fila.monto;
        cajaFuera += fila.monto;
        agregar(fuente, fila, regla);
      } else if (fuente === "adelanto_dado") {
        agregar(fuente, fila, regla, { debe: cuentaDeAdelantoDado(extra.relacionAdelanto[fila.id]) });
      } else if (fuente === "adelanto_devuelto") {
        agregar(fuente, fila, regla, { haber: cuentaDeAdelantoDado(extra.relacionEntrega[fila.id]) });
      } else if (fuente === "liquidacion_pagada") {
        agregar(fuente, fila, regla, { debe: cuentaDeDescuento(extra.relacionLiquidacion[fila.id]) });
      } else if (fuente === "gastos_pagados") {
        const g = extra.gastos[fila.id];
        const personal = esGastoDePersonal(g?.category) || esPagoRrhh(g?.documentNumber);
        agregar(fuente, fila, regla, personal ? { debe: "4111" } : {});
      } else {
        agregar(fuente, fila, regla);
      }
    }
  }

  // ── Cruces que nunca fueron caja ──
  for (const c of f.cruces) {
    const fila: FilaFuente = {
      id: c.id, fecha: c.fecha, quien: c.quien, monto: c.monto, pt: null, m3: null, certeza: "medido", enlace: null,
      que: `${c.direccion === "DADO" ? "Adelanto descontado" : "Adelanto recibido pagado con producto"}${c.codigo ? ` · ${c.codigo}` : ""}`,
    };
    if (c.direccion === "DADO") {
      const rel = extra.relacionEntrega[c.id];
      agregar("cruce", fila, "cruce_adelanto", { debe: cuentaDeDescuento(rel), haber: cuentaDeAdelantoDado(rel) });
    } else {
      agregar("cruce", fila, "cruce_recibido");
    }
  }

  // ── Compensaciones: lo que debías contra lo que te debían, sin plata ──
  for (const c of f.compensaciones ?? []) {
    if (!esSoles(c.moneda)) {
      otrasMonedas += 1;
      continue;
    }
    const fila: FilaFuente = {
      id: c.id, fecha: c.fecha, quien: c.quien, monto: c.monto, pt: null, m3: null, certeza: "medido", enlace: null,
      que: `Compensación${c.liquidacionId ? " de la liquidación" : " de la cuenta"}${c.codigo ? ` · ${c.codigo}` : ""}`,
    };
    if (c.con === "persona" && c.liquidacionId) {
      const rel = extra.relacionLiquidacion[c.liquidacionId];
      agregar("compensacion", fila, "compensacion", { debe: cuentaDeDescuento(rel), haber: cuentaDeAdelantoDado(rel) });
    } else if (c.con === "parte") {
      agregar("compensacion", fila, "compensacion");
    } else {
      sinCuenta += 1;
      sinCuentaMonto += c.monto;
    }
  }

  const avisos: AvisoContable[] = [];
  if (porAclarar > 0) {
    avisos.push({
      codigo: "cuenta_por_aclarar",
      cuantos: porAclarar,
      texto: `${porAclarar} movimiento${porAclarar === 1 ? "" : "s"} manual${porAclarar === 1 ? "" : "es"} de caja (neto S/ ${r2(porAclararMonto).toFixed(2)}) va${porAclarar === 1 ? "" : "n"} a 4699 «por aclarar»: dile al contador qué fue.`,
    });
  }
  if (sinCuenta > 0) {
    avisos.push({
      codigo: "compensacion_sin_cuenta",
      cuantos: sinCuenta,
      texto: `${sinCuenta} compensaci${sinCuenta === 1 ? "ón" : "ones"} (S/ ${r2(sinCuentaMonto).toFixed(2)}) no dice${sinCuenta === 1 ? "" : "n"} con quién: anótala${sinCuenta === 1 ? "" : "s"} a mano.`,
    });
  }
  if (otrasMonedas > 0) {
    avisos.push({ codigo: "otras_monedas", cuantos: otrasMonedas, texto: `${otrasMonedas} monto${otrasMonedas === 1 ? "" : "s"} en otra moneda no entra${otrasMonedas === 1 ? "" : "n"} al libro (solo soles).` });
  }
  const estimados = asientos.filter((a) => a.certeza !== "medido").length;
  if (estimados > 0) {
    avisos.push({ codigo: "costo_estimado", cuantos: estimados, texto: `${estimados} asiento${estimados === 1 ? " sale" : "s salen"} de montos estimados (costo al 55 % o planilla por asistencia).` });
  }
  return { asientos: numerar(asientos), avisos, igvVentas: r2(igvVentas), igvCompras: r2(igvCompras), otrasFuentes: r2(otrasFuentes), cajaFueraDelPanel: r2(cajaFuera) };
}
