/**
 * lib/caja/origen-movimiento.ts
 *
 * De dónde vino (o a dónde fue) cada movimiento de la caja: venta, adelanto,
 * gasto, retiro del dueño… La caja guarda sólo `type` + `description`; el
 * origen sale de los prefijos que ya escriben los que anotan en la caja:
 *
 *  - ventas del POS → `type: "venta"` (`lib/caja/anotar-venta.ts`);
 *  - adelantos → «Adelanto ADL-…», «Anulación de adelanto…», «Devolución…»
 *    (`lib/adelantos/movimiento-caja.ts`);
 *  - liquidaciones → «Liquidación …» (o `liquidacionCodigo`);
 *  - ingreso/egreso a mano → «<motivo> — <detalle>» con los motivos del modal
 *    de Caja (`Pago a proveedor`, `Retiro personal`, `Compra de insumos`…);
 *  - asistente → «Asistente IA: …».
 *
 * Pura y sin dependencias: la usan la pantalla y el parte del servidor.
 */

export type OrigenClave =
  | "apertura"
  | "venta"
  | "adelanto"
  | "liquidacion"
  | "cobro"
  | "ingreso-extra"
  | "proveedor"
  | "gasto"
  | "retiro-dueno"
  | "cambio"
  | "asistente"
  | "arqueo"
  | "cierre"
  | "otro";

export const ETIQUETA_ORIGEN: Record<OrigenClave, string> = {
  apertura: "Fondo de apertura",
  venta: "Venta",
  adelanto: "Adelanto",
  liquidacion: "Liquidación",
  cobro: "Cobro de deuda",
  "ingreso-extra": "Ingreso extra",
  proveedor: "Pago a proveedor",
  gasto: "Gasto",
  "retiro-dueno": "Retiro del dueño",
  cambio: "Sencillo / cambio",
  asistente: "Asistente IA",
  arqueo: "Arqueo",
  cierre: "Cierre",
  otro: "Otro",
};

/** Orden en que se listan (lo que más pesa en una bodega, primero). */
export const ORDEN_ORIGEN: readonly OrigenClave[] = [
  "apertura",
  "venta",
  "cobro",
  "ingreso-extra",
  "adelanto",
  "liquidacion",
  "proveedor",
  "gasto",
  "retiro-dueno",
  "cambio",
  "asistente",
  "otro",
  "arqueo",
  "cierre",
];

export interface MovimientoConOrigen {
  type: string;
  description?: string | null;
  liquidacionCodigo?: string | null;
}

/** Reglas por prefijo, en orden: la primera que calza gana. */
const REGLAS: ReadonlyArray<readonly [RegExp, OrigenClave]> = [
  [/^liquidaci[oó]n\b/i, "liquidacion"],
  /* Anclado: «Retiro personal — adelanto de sueldo» es retiro del dueño, no un
     adelanto. Etiquetas reales: `lib/adelantos/movimiento-caja.ts`. */
  [/^(adelanto|anulaci[oó]n de adelanto|devoluci[oó]n de adelanto)\b/i, "adelanto"],
  [/^retiro (personal|del? due[ñn]o)/i, "retiro-dueno"],
  [/^(compra de insumos|gasto)\b/i, "gasto"],
  [/^(pago a proveedor|compra)\b/i, "proveedor"],
  [/^cambio\b/i, "cambio"],
  [/^cobro\b/i, "cobro"],
  [/^ingreso extra\b/i, "ingreso-extra"],
  [/^asistente ia\b/i, "asistente"],
];

export function origenDeMovimiento(m: MovimientoConOrigen): {
  clave: OrigenClave;
  etiqueta: string;
} {
  const clave = claveDeOrigen(m);
  return { clave, etiqueta: ETIQUETA_ORIGEN[clave] };
}

function claveDeOrigen(m: MovimientoConOrigen): OrigenClave {
  if (m.type === "apertura") return "apertura";
  if (m.type === "cierre") return "cierre";
  if (m.type === "arqueo") return "arqueo";
  if (m.type === "venta") return "venta";
  if (m.liquidacionCodigo) return "liquidacion";
  const texto = String(m.description ?? "").trim();
  for (const [patron, clave] of REGLAS) if (patron.test(texto)) return clave;
  return "otro";
}
