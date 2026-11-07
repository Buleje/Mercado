// Ayudas compartidas por src/herramientas/*.mjs (carril C). Puro: sin red, sin SDK.
import { z } from "zod";
import { numero, soles, madera, recortar, fechaLima } from "./formato.mjs";
import { claveCantidad, claveMonto, claveNombre, conMarca, linea60 } from "./clave-ok.mjs";

export { soles, madera, numero, fechaLima, claveCantidad, claveMonto, claveNombre, conMarca, linea60 };

/** Lo que se muestra cuando el GET por id de la previa no trajo el nombre (hallazgo 3, 29-10). */
export const NO_VERIFICADO = "NO PUDE VERIFICAR A QUIÉN";

/** Todas las herramientas aceptan el negocio. */
export const negocio = z.string().optional().describe("Negocio: bodega, blas o qa-forestal. Sin esto usa el de siempre.");

/** Id que va dentro de una ruta: letras, números, _ y -. */
export const idRuta = z.string().regex(/^[\w-]{1,40}$/, "El id solo lleva letras, números, _ y -");

export const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD");

/** Quita lo vacío de un query/cuerpo para que no viaje `undefined` ni "". */
export function limpiar(obj) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out;
}

/** Saca la lista de una respuesta que puede venir como array o envuelta. */
export function filasDe(datos) {
  if (Array.isArray(datos)) return datos;
  if (datos && typeof datos === "object") {
    for (const k of ["items", "data", "rows", "results", "resultados", "lista", "registros", "entries", "sales", "orders", "movimientos", "adelantos", "tareas", "notes", "documents", "documentos"]) {
      if (Array.isArray(datos[k])) return datos[k];
    }
    for (const v of Object.values(datos)) if (Array.isArray(v)) return v;
  }
  return [];
}

/** Primer valor presente entre varias claves posibles. */
export function pick(o, claves) {
  if (!o || typeof o !== "object") return undefined;
  for (const k of claves) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
}

/** Texto de un valor según su tipo: "s" soles, "n" número, "f" fecha, "t" texto. */
export function celda(v, tipo = "t") {
  if (v === undefined || v === null || v === "") return "—";
  if (tipo === "s") return Number.isFinite(Number(v)) ? soles(Number(v)) : String(v);
  if (tipo === "n") return Number.isFinite(Number(v)) ? numero(Number(v), Number.isInteger(Number(v)) ? 0 : 2) : String(v);
  if (tipo === "f") return fechaLima(v);
  return String(v);
}

/**
 * Lista corta (máx. 50 filas). `cols` = [[etiqueta, [claves posibles], tipo]].
 * La madera va con `colMadera` para que salga PT primero, después m³ y piezas.
 */
export function lista(datos, { titulo, cols, colMadera, max = 50, vacio = "Sin resultados." }) {
  const todas = filasDe(datos);
  const { filas, total, truncado, aviso } = recortar(todas, max);
  if (!filas.length) return `${titulo}: ${vacio}`;
  const lineas = filas.map((f) => {
    const partes = cols
      .map(([et, claves, tipo]) => {
        const v = pick(f, claves);
        return v === undefined ? null : `${et} ${celda(v, tipo)}`;
      })
      .filter(Boolean);
    if (colMadera) {
      const m = madera({
        pt: pick(f, colMadera.pt ?? []),
        m3: pick(f, colMadera.m3 ?? []),
        piezas: pick(f, colMadera.piezas ?? []),
      });
      if (m !== "—") partes.push(m);
    }
    return `- ${partes.join(" · ")}`;
  });
  return [`${titulo} (${filas.length}${truncado ? ` de ${total}` : ""}):`, ...lineas, aviso].filter(Boolean).join("\n");
}

/** Resumen de un objeto suelto: solo las claves pedidas que vengan. */
export function ficha(datos, { titulo, campos }) {
  if (!datos || typeof datos !== "object") return `${titulo}: sin datos.`;
  const partes = campos
    .map(([et, claves, tipo]) => {
      const v = pick(datos, claves);
      return v === undefined ? null : `${et}: ${celda(v, tipo)}`;
    })
    .filter(Boolean);
  return partes.length ? `${titulo}\n${partes.join("\n")}` : `${titulo}: ${JSON.stringify(datos).slice(0, 1500)}`;
}

/** Busca el nombre de una persona por id dentro de una respuesta de lista (para el resumen). */
export function nombreDe(datos, id, claves = ["nombre", "name", "razonSocial"]) {
  const f = filasDe(datos).find((x) => x && String(x.id) === String(id));
  return f ? pick(f, claves) : undefined;
}

/**
 * GET de una previa que nunca tira: `{ ok, datos }`. `sinRecorte` = la lista llega entera (buscar un id en ella).
 * @param {(p: import("./tipos.mjs").Pedido) => Promise<import("./tipos.mjs").Respuesta>} leer
 * @param {string} ruta @param {Record<string, any>} [query] @param {{ sinRecorte?: boolean }} [op]
 */
export async function leerSeguro(leer, ruta, query, op = {}) {
  try {
    const r = await leer({ metodo: "GET", ruta, ...(query ? { query: limpiar(query) } : {}), ...(op.sinRecorte ? { sinRecorte: true } : {}) });
    return r?.ok ? { ok: true, datos: r.datos } : { ok: false, datos: undefined };
  } catch {
    return { ok: false, datos: undefined };
  }
}

/** La ficha de un GET por id (desenvuelve { data }, { item }… si viene así). */
export async function fichaPorId(leer, ruta, claveEnvoltorio) {
  const r = await leerSeguro(leer, ruta);
  if (!r.ok || !r.datos || typeof r.datos !== "object") return undefined;
  const d = /** @type {any} */ (r.datos);
  for (const k of [claveEnvoltorio, "data", "item"].filter(Boolean)) if (d[k] && typeof d[k] === "object" && !Array.isArray(d[k])) return d[k];
  return d;
}

/** Una lista entera (sin el recorte de 50 filas) o null si el GET falló. */
export async function filasCompletas(leer, ruta, query) {
  const r = await leerSeguro(leer, ruta, query, { sinRecorte: true });
  return r.ok ? filasDe(r.datos) : null;
}

/** Nombre a una línea (≤60) o «NO PUDE VERIFICAR A QUIÉN». Nunca lo que escribió el modelo. */
export function verificado(nombre) {
  const t = conMarca(nombre); // «Juаn» con а cirílica sale «Juаn (⚠ letras raras)»
  return t || NO_VERIFICADO;
}

const CLAVES_DOC = ["documento", "ruc", "dni", "numeroDocumento"];
const CLAVES_TEL = ["phone", "telefono", "celular", "customerPhone"];
const ultimos4 = (v) => { const d = String(v ?? "").replace(/\D/g, ""); return d.length >= 4 ? d.slice(-4) : ""; };
/**
 * Fila fija de las ventanas que nombran a alguien (2.ª pasada 29-10): los últimos 4 del DNI/RUC o, si no hay, del
 * teléfono, LEÍDOS DEL PANEL (nunca de lo que escribe Claude). Renombrar a alguien no alcanza para hacerse pasar por otro:
 * el número sigue siendo el suyo, y cambiar DNI/RUC/teléfono también pide OK.
 * @param {any} p ficha del panel (cliente, proveedor, beneficiario, colaborador, pedido con su cliente…)
 * @returns {{ etiqueta: string, valor: string }}
 */
export function filaIdentidad(p) {
  const fuentes = p && typeof p === "object" ? [p, p.customer, p.beneficiario, p.colaborador, p.supplier, p.proveedor].filter((x) => x && typeof x === "object") : [];
  if (!fuentes.length) return { etiqueta: "DNI/RUC o tel.", valor: NO_VERIFICADO };
  for (const f of fuentes) for (const k of CLAVES_DOC) {
    const u = ultimos4(f[k]);
    if (u) return { etiqueta: k === "ruc" || String(f.tipoDocumento ?? "").toUpperCase() === "RUC" ? "RUC (últimos 4)" : "DNI/doc. (últimos 4)", valor: `…${u}` };
  }
  for (const f of fuentes) for (const k of CLAVES_TEL) {
    const u = ultimos4(f[k]);
    if (u) return { etiqueta: "Teléfono (últimos 4)", valor: `…${u}` };
  }
  return { etiqueta: "DNI/RUC o tel.", valor: "el panel no mostró DNI/RUC ni teléfono" };
}

/** «…1234» (últimos 4 dígitos) o «(sin número)». @param {unknown} v */
export const colaDe4 = (v) => { const u = ultimos4(v); return u ? `…${u}` : "(sin número)"; };
/** Valor de ANTES leído del panel para el resumen: «(no se pudo leer)» sin ficha, «(vacío)» sin dato. @param {any} p @param {unknown} v @param {(v: any) => string} f */
export const antesDelPanel = (p, v, f) => (!p ? "(no se pudo leer)" : v === undefined || v === null || v === "" ? "(vacío)" : f(v));

/** Otros nombres de la misma lista (señuelos de la ventana), sin el elegido. */
export function otrosNombres(filas, id, claves = ["nombre", "name", "title", "titulo"]) {
  return (filas ?? []).filter((x) => x && String(x.id) !== String(id)).map((x) => pick(x, claves)).filter(Boolean).slice(0, 40);
}

/** «Nombre (dato)» o el dato solo. */
export function quien(nombre, dato) {
  return nombre ? (dato ? `${nombre} (${dato})` : String(nombre)) : String(dato ?? "—");
}

export { z };
