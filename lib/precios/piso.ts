/**
 * El piso de una rebaja (Brandon 19-10, «Piso también en la ficha»): ningún
 * precio BAJA por debajo de costo × (1 + piso/100) sin que el dueño lo vea.
 *
 * Una sola regla para todos los caminos que cambian un precio:
 *  · Comandos IA › Precios en bloque (`ProductsDB.aplicarPreciosEnLote`):
 *    rechaza la fila (no hay «guardar igual» en una rebaja masiva automática);
 *  · la ficha del producto (PUT/PATCH /api/products/[id]) y los precios en
 *    lote del inventario (POST /api/products/bulk, PATCH/PUT
 *    /api/products/bulk-price): 409 con la lista y se guarda sólo con
 *    `confirmarBajoPiso: true` (queda en el registro de actividad).
 *
 * En céntimos enteros, con el piso redondeado hacia ARRIBA (costo 3,80 + 5 %
 * = 3,99, no 3,98). Las subidas, los precios iguales y los productos sin costo
 * pasan siempre. El `pisoSobreCosto` lo pone el negocio en Ajustes › Cobros
 * (`margenes-rebajas.ts`).
 *
 * Puro y client-safe.
 */
import { pctTexto } from "./margenes-rebajas";

/** Céntimos enteros de un monto en soles, sin el ruido del float (4,35 × 100 = 434,99…). */
export function centimosDe(soles: number): number {
  return Math.round(Math.round(soles * 1e6) / 1e4);
}

export type ChequeoPiso = { ok: true } | { ok: false; bajoPiso: true; piso: number };

/**
 * ¿El precio nuevo baja por debajo del piso? `piso` = el precio más bajo que se
 * acepta (soles). `costo` es el que queda tras guardar (el nuevo si el cambio
 * también lo trae); null, 0 o negativo = sin costo conocido → pasa.
 */
export function chequearPiso(c: {
  precioActual: number;
  precioNuevo: number;
  costo: number | null | undefined;
  pisoSobreCosto: number | null | undefined;
}): ChequeoPiso {
  const { precioActual, precioNuevo, costo, pisoSobreCosto } = c;
  if (pisoSobreCosto == null || costo == null || !Number.isFinite(costo) || costo <= 0) return { ok: true };
  const nuevo = centimosDe(precioNuevo);
  if (nuevo >= centimosDe(precioActual)) return { ok: true };
  const pisoCent = Math.ceil((centimosDe(costo) * (100 + pisoSobreCosto)) / 100 - 1e-6);
  return nuevo < pisoCent ? { ok: false, bajoPiso: true, piso: pisoCent / 100 } : { ok: true };
}

/** «S/ 3,99» (coma decimal, siempre 2 decimales). */
function soles(n: number): string {
  return `S/ ${n.toFixed(2).replace(".", ",")}`;
}

/** «Leche Gloria: queda bajo costo + 5 % (S/ 3,99)». */
export function textoBajoPiso(nombre: string, piso: number, pisoSobreCosto: number): string {
  return `${nombre}: queda bajo costo + ${pctTexto(pisoSobreCosto)} (${soles(piso)})`;
}

/** Un producto cuyo precio nuevo queda bajo el piso. */
export interface AvisoBajoPiso {
  productId: number;
  nombre: string;
  precioActual: number;
  precioNuevo: number;
  costo: number;
  /** El precio más bajo que se acepta sin confirmar. */
  piso: number;
  /** «Leche Gloria: queda bajo costo + 5 % (S/ 3,99)». */
  mensaje: string;
}

/** Cuerpo del 409 de las rutas de precio. El cliente reenvía con `confirmarBajoPiso: true`. */
export interface RespuestaBajoPiso {
  error: string;
  codigo: "bajo-piso";
  pisoSobreCosto: number;
  avisos: AvisoBajoPiso[];
}

export const CODIGO_BAJO_PISO = "bajo-piso" as const;

export function respuestaBajoPiso(avisos: AvisoBajoPiso[], pisoSobreCosto: number): RespuestaBajoPiso {
  const n = avisos.length;
  return {
    error: n === 1 ? avisos[0].mensaje : `${n} productos quedan bajo costo + ${pctTexto(pisoSobreCosto)}`,
    codigo: CODIGO_BAJO_PISO,
    pisoSobreCosto,
    avisos,
  };
}

/** ¿El cuerpo de una respuesta es el aviso del piso? (para el cliente). */
export function esRespuestaBajoPiso(cuerpo: unknown): cuerpo is RespuestaBajoPiso {
  return (
    typeof cuerpo === "object" && cuerpo !== null &&
    (cuerpo as { codigo?: unknown }).codigo === CODIGO_BAJO_PISO &&
    Array.isArray((cuerpo as { avisos?: unknown }).avisos)
  );
}

/** El texto del diálogo: hasta 6 renglones y «y N más». */
export function detalleBajoPiso(avisos: AvisoBajoPiso[]): string {
  const lineas = avisos.slice(0, 6).map((a) => `• ${a.mensaje} — pusiste ${soles(a.precioNuevo)}`);
  if (avisos.length > 6) lineas.push(`y ${avisos.length - 6} más`);
  return lineas.join("\n");
}

/** El diálogo «Guardar igual / Corregir» (ConfirmDialog del panel) para un 409 del piso. */
export function dialogoBajoPiso(r: RespuestaBajoPiso): {
  title: string;
  description: string;
  intent: "warning";
  confirmLabel: string;
  cancelLabel: string;
} {
  const n = r.avisos.length;
  return {
    title: n === 1 ? "Este precio queda bajo tu piso" : `${n} precios quedan bajo tu piso`,
    description: `${detalleBajoPiso(r.avisos)}\n\nTu piso es costo + ${pctTexto(r.pisoSobreCosto)} (Ajustes › Cobros). Si guardas igual, queda anotado con tu nombre.`,
    intent: "warning",
    confirmLabel: "Guardar igual",
    cancelLabel: "Corregir",
  };
}

/** La línea del registro de actividad cuando el dueño guarda igual. */
export function textoBajoPisoConfirmado(avisos: AvisoBajoPiso[], usuario: string): string {
  const lista = avisos.slice(0, 10).map((a) => `${a.mensaje}, puesto en ${soles(a.precioNuevo)}`).join("; ");
  const resto = avisos.length > 10 ? `; y ${avisos.length - 10} más` : "";
  return `Bajo piso confirmado por ${usuario}: ${lista}${resto}`;
}
