/**
 * Cómo se leen los campos de la ficha de SERFOR (ADR-461, 02-10-2026).
 *
 * Vivían en `ctp-gtf-desde-serfor.ts`, que lleva `"use client"` (arma la hoja
 * imprimible en el navegador). Importar ese archivo desde una ruta del
 * servidor da referencias de cliente, no funciones: el importador de guías al
 * Libro TH las necesita en el servidor, así que viven acá —sin directiva— y
 * `ctp-gtf-desde-serfor` las re-exporta igual que antes.
 *
 * PURO y client-safe.
 */

const t = (v: string | null | undefined) => (v ?? "").trim();

/** Mapea el texto del origen que publica SERFOR a la clave del casillero (5). */
export function claveOrigen(texto: string | null | undefined): string {
  const s = (texto ?? "").toLowerCase();
  if (!s.trim()) return "";
  if (s.includes("concesi")) return "concesion";
  if (s.includes("permiso")) return "permiso";
  if (s.includes("autoriza")) return "autorizacion";
  if (s.includes("bosque local")) return "bosque_local";
  if (s.includes("desbosque")) return "desbosque";
  if (s.includes("cambio")) return "cambio_uso";
  if (s.includes("plantaci")) return "plantacion";
  if (s.includes("consolidado")) return "plan_consolidado";
  return "otros";
}

/**
 * La ficha publica el documento sin decir de qué tipo es, y a veces trae los DOS
 * en el mismo campo ("20605859438 / 80186494"). Se separan por longitud: 11
 * dígitos es RUC, 8 es DNI. Sin esto el casillero (23) mostraba los dos números
 * pegados y el (24) quedaba vacío teniendo el RUC ahí al lado.
 */
export function separarDocumento(crudo: string | null | undefined): { ruc: string; dni: string } {
  const piezas = (crudo ?? "").split(/[^0-9]+/).filter(Boolean);
  return {
    ruc: piezas.find((n) => n.length === 11) ?? "",
    dni: piezas.find((n) => n.length >= 7 && n.length <= 9) ?? "",
  };
}

/**
 * SERFOR publica las medidas en UN string ("105.0 x 101.0 x 6.16"), no en tres
 * columnas. Se parte en d1 × d2 × largo —el orden que usa la guía— y sólo si el
 * texto trae exactamente tres números: con dos o con cuatro no se adivina, se
 * deja vacío. Rellenar una medida mal es peor que dejar el casillero en blanco.
 */
export function partirDimensiones(
  texto: string | null | undefined,
): { d1Cm: number | null; d2Cm: number | null; largoM: number | null } {
  const nums = (texto ?? "").match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (nums.length !== 3) return { d1Cm: null, d2Cm: null, largoM: null };
  const n = nums.map((v) => Number(v.replace(",", ".")));
  return n.every(Number.isFinite)
    ? { d1Cm: n[0], d2Cm: n[1], largoM: n[2] }
    : { d1Cm: null, d2Cm: null, largoM: null };
}

/** ¿La guía sigue amparando la carga? Lo dice SERFOR, no se deduce. */
export function estadoGtf(g: { estado: string | null }): { texto: string; anulada: boolean } {
  const texto = t(g.estado);
  return { texto, anulada: /anulad/i.test(texto) };
}
