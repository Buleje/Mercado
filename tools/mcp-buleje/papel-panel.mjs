#!/usr/bin/env node
// Lleva un papel de Blas al panel (ADR-534). Lo llama el programa `papel` (~/.local/share/blas-papeles/blas_papeles.py)
// cada vez que emite, corrige o cambia de estado un papel; si falla, `papel` lo deja en la cola y `papel subir` reintenta.
//
// Qué hace (2 pedidos, con la sesión del negocio de la conexión buleje):
//   1. El PDF a Documentos: la 1.ª vez como documento nuevo en «Papeles de Blas/<carpeta del tipo>» con las etiquetas
//      `papel` y el número; después, como VERSIÓN nueva de ese mismo documento (un papel = un documento con historial).
//   2. POST /api/admin/papeles con lo mínimo (número, tipo, fecha, estado, código, clave del QR, total, hojas,
//      documentId). Es lo ÚNICO que ve la página pública del QR: nada de nombres, DNI ni detalle (Ley 29733).
//
// Uso:  papel-panel.mjs --meta <archivo/<número>/meta.json> [--negocio blas] [--seco]
//   --seco (o `seco: true` en ~/.config/buleje-mcp/credenciales.json, el candado de Brandon): dice qué mandaría, sin mandar.
// Sale UNA línea JSON: { ok, documentId, version, reemplazados, ... } o { ok: false, error, mensaje }.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { revisarArchivo } from "./src/archivos.mjs";
import { crearCliente } from "./src/cliente.mjs";
import { credencialDe, leerCredenciales } from "./src/credenciales.mjs";
import { CARPETA_SESIONES, cargarSesion, guardarSesion, negocioDeConfig } from "./archivar-telegram.mjs";

export const RUTA_PAPELES = "/api/admin/papeles";
export const RUTA_DOCUMENTOS = "/api/admin/documents";
const RAIZ_CARPETA = "Papeles de Blas";

/** Carpeta de Documentos por tipo de papel (las 11 series del programa `papel`). */
export const CARPETA_DE_TIPO = {
  proforma: "Proformas",
  "nota-venta": "Notas de venta",
  "estado-cuenta": "Estados de cuenta",
  liquidacion: "Liquidaciones",
  recibo: "Recibos",
  contrato: "Contratos",
  solicitud: "Solicitudes",
  carta: "Cartas",
  informe: "Informes",
  resumen: "Resúmenes",
  cubicacion: "Cubicaciones",
};
const ESTADOS = new Set(["borrador", "revision", "oficial", "anulado"]);
const NOMBRE_ESTADO = { borrador: "borrador", revision: "en revisión", oficial: "oficial", anulado: "anulado" };

const fallo = (error, mensaje, extra = {}) => ({ ok: false, error, mensaje, ...extra });

/** «9,530.00» · «11,725» → «9530.00» · «11725»; lo que no sea un monto con ≤2 decimales → null (no se inventa). */
export function totalDeMeta(t) {
  if (t === null || t === undefined) return null;
  const s = String(t).replace(/[,\s]/g, "").replace(/^S\/\.?/i, "");
  return /^-?\d{1,12}(\.\d{1,2})?$/.test(s) ? s : null;
}

/**
 * Lo que va a POST /api/admin/papeles, sacado del meta.json del archivo. PURO (lo prueban los tests).
 * @param {Record<string, any>} meta @param {string | null} documentId
 */
export function registroDeMeta(meta, documentId) {
  const faltan = ["numero", "tipo", "titulo", "fecha", "estado", "codigo", "clave"].filter((k) => !meta?.[k]);
  if (faltan.length) return { ok: false, mensaje: `al papel le falta ${faltan.join(", ")} (¿se emitió antes del QR? → papel rehacer)` };
  if (!ESTADOS.has(meta.estado)) return { ok: false, mensaje: `estado «${meta.estado}» desconocido` };
  return {
    ok: true,
    cuerpo: {
      numero: meta.numero,
      tipo: meta.tipo,
      titulo: meta.titulo,
      fecha: meta.fecha,
      estado: meta.estado,
      codigo: meta.codigo,
      clave: meta.clave,
      total: totalDeMeta(meta.total),
      moneda: meta.moneda === "USD" ? "USD" : "PEN",
      ...(Number.isInteger(meta.hojas) && meta.hojas >= 1 && meta.hojas <= 50 ? { hojas: meta.hojas } : {}),
      ...(documentId ? { documentId } : {}),
    },
  };
}

/** @param {string[]} argv @param {{ fetch?: typeof fetch, puertoAbierto?: () => Promise<boolean>, config?: import("./src/credenciales.mjs").Config }} [deps] */
export async function papelAlPanel(argv, deps = {}) {
  let a;
  try {
    ({ values: a } = parseArgs({ args: argv, options: { meta: { type: "string" }, negocio: { type: "string", default: "blas" }, seco: { type: "boolean", default: false } } }));
  } catch (e) { return fallo("argumentos", String(/** @type {any} */ (e).message)); }
  if (!a.meta) return fallo("argumentos", "Falta --meta <archivo/<número>/meta.json>");

  let meta;
  try { meta = JSON.parse(await readFile(a.meta, "utf8")); } catch { return fallo("meta", `No pude leer ${a.meta}`); }
  const previo = registroDeMeta(meta, meta.panel_doc ?? null);
  if (!previo.ok) return fallo("meta", previo.mensaje);

  let config;
  try { config = deps.config ?? leerCredenciales(); } catch (e) { return fallo("sin_sesion", String(/** @type {any} */ (e)?.message ?? e)); }
  const negocio = negocioDeConfig(config, a.negocio);
  if (!negocio) return fallo("argumentos", `Negocio «${a.negocio}» desconocido. Hay: ${Object.keys(config.negocios).join(", ")}.`);

  const pdf = String(meta.pdf ?? "");
  const raiz = dirname(pdf);
  const rev = await revisarArchivo(pdf, { raices: [raiz] });
  if (!rev.ok) return fallo("archivo", `No subo el PDF: ${rev.motivo}.`);

  const carpeta = `${RAIZ_CARPETA}/${CARPETA_DE_TIPO[meta.tipo] ?? "Otros"}`;
  const nota = `${meta.numero} · ${NOMBRE_ESTADO[meta.estado] ?? meta.estado} · código ${meta.codigo}`;
  if (a.seco || config.seco) {
    return { ok: true, seco: true, negocio, porque: a.seco ? "--seco" : "candado de la conexión (seco: true)", pedidos: [
      meta.panel_doc ? { metodo: "POST", ruta: `${RUTA_DOCUMENTOS}/${meta.panel_doc}/versions`, nota } : { metodo: "POST", ruta: RUTA_DOCUMENTOS, carpeta, tags: `papel,${meta.numero}` },
      { metodo: "POST", ruta: RUTA_PAPELES, cuerpo: { ...previo.cuerpo, clave: "············" } },
    ] };
  }

  const cliente = crearCliente({ config, fetch: deps.fetch, puertoAbierto: deps.puertoAbierto, raicesArchivos: [raiz] });
  const { nombre, cred } = credencialDe(config, negocio);
  const sesion = cliente.sesionDe(nombre, cred);
  const archivoSesion = join(CARPETA_SESIONES, `papel-${nombre.replace(/[^\w-]/g, "_")}.json`);
  await cargarSesion(sesion, archivoSesion);
  try {
    const archivo = { campo: "file", ruta: rev.real, sha256: rev.sha256, bytes: rev.bytes };
    // 1) PDF: versión nueva del documento que ya tiene; si ese documento ya no está (lo borraron), uno nuevo.
    let documentId = meta.panel_doc ?? null;
    let version = null;
    if (documentId) {
      const v = await cliente.pedir(negocio, { metodo: "POST", ruta: `${RUTA_DOCUMENTOS}/${documentId}/versions`, cuerpo: { changeNote: nota }, archivo });
      if (v.ok) version = /** @type {any} */ (v.datos)?.version?.versionNumber ?? null;
      else if (v.status === 404) documentId = null;
      else return fallo(v.error?.codigo ?? "servidor", `PDF (versión): ${v.error?.mensaje ?? `el panel respondió ${v.status}`}`);
    }
    if (!documentId) {
      const d = await cliente.pedir(negocio, { metodo: "POST", ruta: RUTA_DOCUMENTOS, cuerpo: { carpetaRuta: carpeta, tags: `papel,${meta.numero}` }, archivo });
      if (!d.ok) return fallo(d.error?.codigo ?? "servidor", `PDF: ${d.error?.mensaje ?? `el panel respondió ${d.status}`}`);
      documentId = /** @type {any} */ (d.datos)?.document?.id ?? null;
      if (!documentId) return fallo("servidor", "El panel guardó el PDF pero no devolvió su id");
    }
    // 2) El registro mínimo (lo que lee la página pública del QR).
    const reg = registroDeMeta(meta, documentId);
    if (!reg.ok) return fallo("meta", reg.mensaje);
    const p = await cliente.pedir(negocio, { metodo: "POST", ruta: RUTA_PAPELES, cuerpo: reg.cuerpo });
    if (!p.ok) return fallo(p.error?.codigo ?? "servidor", `Registro: ${p.error?.mensaje ?? `el panel respondió ${p.status}`}`, { documentId });
    const r = /** @type {any} */ (p.datos) ?? {};
    return { ok: true, negocio, documentId, version, carpeta, estado: r.papel?.estado ?? meta.estado, reemplazados: r.reemplazados ?? 0 };
  } finally {
    await guardarSesion(sesion, archivoSesion);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mayor = Number(process.versions.node.split(".")[0]);
  const r = mayor < 20 ? fallo("node", `Node ${process.versions.node} es muy viejo (hace falta 20 o más).`) : await papelAlPanel(process.argv.slice(2)).catch((e) => fallo("servidor", String(e?.message ?? e).slice(0, 200)));
  process.stdout.write(`${JSON.stringify(r)}\n`);
  process.exitCode = r.ok ? 0 : 1;
}
