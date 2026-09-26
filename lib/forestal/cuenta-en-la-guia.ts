/**
 * cuenta-en-la-guia — la cuenta del proveedor, vista desde «Plata de la guía»
 * (ADR-437 §5, pedido de Brandon 26-09: «ver la cuenta del proveedor ahí mismo»).
 *
 * No es un tercer saldo: el neto es el de `unificarCuentas` (la fila de
 * «Cuenta por persona») y las líneas son las de `estadoCuentaUnificado` (el
 * mismo estado de cuenta que sale por WhatsApp y en PDF). Esto sólo agrega lo
 * que el modal necesita encima: a qué tipo va cada línea (el filtro rápido) y
 * tres cifras que explican el neto (madera · pagado · adelantado).
 *
 * Convención de signo, la del módulo: `+` = la persona te debe más; `−` = le
 * debes más (o te pagó). Neto positivo = te debe; negativo = le debes.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import type { LineaEstadoCuenta } from "@/lib/adelantos/estado-cuenta-unificado";
import type { Concepto } from "@/lib/forestal/cuenta-corriente";

export const TIPOS_LINEA_CUENTA = ["madera", "pagos", "adelantos", "otros"] as const;
export type TipoLineaCuenta = (typeof TIPOS_LINEA_CUENTA)[number];

export const TIPO_LINEA_LABEL: Record<TipoLineaCuenta, string> = {
  madera: "Madera",
  pagos: "Pagos",
  adelantos: "Adelantos",
  otros: "Otros",
};

/** Lo que mueve una liquidación (ADR-413): el pago que le haces, el que te hace y el cruce. */
const CONCEPTOS_PAGO: ReadonlySet<Concepto> = new Set<Concepto>(["pago_hecho", "pago", "compensacion"]);

/**
 * A qué filtro va una línea. Un adelanto y sus entregas vienen del módulo
 * Adelantos; el concepto `adelanto` de la cuenta forestal es el viejo (0 filas
 * al 26-09) y va con ellos. Aserrío, flete, venta y «otro» son «Otros».
 */
export function tipoDeLinea(l: Pick<LineaEstadoCuenta, "origen" | "conceptoForestal">): TipoLineaCuenta {
  if (l.origen !== "forestal") return "adelantos";
  const c = l.conceptoForestal;
  if (c === "madera") return "madera";
  if (c === "adelanto") return "adelantos";
  if (c && CONCEPTOS_PAGO.has(c)) return "pagos";
  return "otros";
}

export interface LineaCuentaGuia {
  /** `AAAA-MM-DD` como lo vivió el negocio (Lima si tiene hora; UTC si es un día). */
  dia: string;
  tipo: TipoLineaCuenta;
  concepto: string;
  referencia: string | null;
  gtfNumber: string | null;
  /** `+` te debe más; `−` le debes más. */
  monto: number;
  moneda: string;
  /** Saldo de la cuenta después de esta línea, en su moneda. */
  acumulado: number;
}

export interface CuentaDeGuiaDTO {
  parteId: string;
  nombre: string;
  /** `null` = no tiene ficha en Adelantos (sólo cuenta forestal). */
  beneficiarioId: string | null;
  /** El neto de `unificarCuentas` en soles: positivo = te debe; negativo = le debes. */
  neto: number;
  /** Lo que le debes por su madera: Σ abonos `madera` − Σ cargos `madera` (PEN). */
  madera: number;
  /** Lo que le pagaste o le cruzaste con adelantos (`pago_hecho` + `compensacion`, PEN). */
  pagado: number;
  /** Lo que te debe de adelantos (saldo, no lo entregado). `null` = sin ficha en Adelantos. */
  adelantado: number | null;
  otrasMonedas: Record<string, number>;
  /** Cronológicas (la más vieja primero), con el saldo corrido. */
  lineas: LineaCuentaGuia[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Arma el DTO a partir de lo que ya calcularon las dos fuentes. `dia` se pasa
 * de afuera (`claveDia` del estado de cuenta) para que el día que se lee sea
 * el mismo que el del PDF.
 */
export function armarCuentaDeGuia(input: {
  parteId: string;
  nombre: string;
  beneficiarioId: string | null;
  neto: number;
  adelantado: number | null;
  otrasMonedas: Record<string, number>;
  lineas: readonly LineaEstadoCuenta[];
  dia: (iso: string) => string;
}): CuentaDeGuiaDTO {
  let madera = 0;
  let pagado = 0;
  for (const l of input.lineas) {
    if (l.origen !== "forestal" || l.moneda !== "PEN") continue;
    if (l.conceptoForestal === "madera") madera -= l.monto;
    else if (l.conceptoForestal === "pago_hecho" || l.conceptoForestal === "compensacion") pagado += l.monto;
  }
  return {
    parteId: input.parteId,
    nombre: input.nombre,
    beneficiarioId: input.beneficiarioId,
    neto: r2(input.neto),
    madera: r2(madera),
    pagado: r2(pagado),
    adelantado: input.adelantado == null ? null : r2(input.adelantado),
    otrasMonedas: input.otrasMonedas,
    lineas: input.lineas.map((l) => ({
      dia: input.dia(l.fecha),
      tipo: tipoDeLinea(l),
      concepto: l.concepto,
      referencia: l.referencia,
      gtfNumber: l.gtfNumber ?? null,
      monto: l.monto,
      moneda: l.moneda,
      acumulado: l.acumulado,
    })),
  };
}

/** Cómo se lee un saldo en el modal: «Le debes S/ X» · «Te debe S/ X» · «Al día». */
export function sentidoDelSaldo(n: number): "le-debes" | "te-debe" | "al-dia" {
  if (Math.abs(n) < 0.005) return "al-dia";
  return n > 0 ? "te-debe" : "le-debes";
}
