// Cliente HTTP del panel (contrato §3.2). Nunca importa lib/** ni Prisma.
import { revisarArchivo } from "./archivos.mjs";
import { BASE_POR_DEFECTO, credencialDe } from "./credenciales.mjs";
import { puertoAbierto as puertoAbiertoReal, puertoDeBase } from "./panel-local.mjs";
import { Sesion, archivoCulpable } from "./sesion.mjs";

export const MAX_FILAS = 50;
export const MAX_BYTES = 20_000;
export const LIMITE_PEDIDOS_MIN = 60;
export const LIMITE_ESCRITURAS_MIN = 5;
const TOPE_PRIMERA_VEZ_MS = 90_000;
const TOPE_NORMAL_MS = 30_000;

const esHtml = (t) => /<html|<!DOCTYPE/i.test(t);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/** @returns {import("./tipos.mjs").Respuesta} */
const fallo = (codigo, mensaje, status = 0, ms = 0, detalle = undefined) => ({ ok: false, status, error: { codigo, mensaje, ...(detalle !== undefined ? { detalle } : {}) }, ms });

/** Recorta arrays a 50 filas y el total a ~20 KB. */
export function recortarDatos(datos) {
  let truncado = false;
  const recorta = (a) => { if (a.length > MAX_FILAS) { truncado = true; return a.slice(0, MAX_FILAS); } return a; };
  let sal = datos;
  if (Array.isArray(datos)) sal = recorta(datos);
  else if (datos && typeof datos === "object") sal = Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, Array.isArray(v) ? recorta(v) : v]));
  const json = JSON.stringify(sal) ?? "";
  if (json.length > MAX_BYTES) {
    truncado = true;
    if (Array.isArray(sal)) {
      let n = sal.length;
      while (n > 1 && JSON.stringify(sal.slice(0, n)).length > MAX_BYTES) n = Math.ceil(n / 2);
      sal = sal.slice(0, n);
    } else {
      sal = { _recortadoA: `${MAX_BYTES} caracteres`, texto: json.slice(0, MAX_BYTES) };
    }
  }
  return { datos: sal, truncado };
}

/**
 * @param {{ config: import("./credenciales.mjs").Config, fetch?: typeof fetch,
 *   puertoAbierto?: () => Promise<boolean>, ahora?: () => number, esperar?: (ms: number) => Promise<void>,
 *   raicesArchivos?: string[], casa?: string }} op
 */
export function crearCliente(op) {
  const base = (op.config.base || BASE_POR_DEFECTO).replace(/\/+$/, "");
  const ahora = op.ahora ?? Date.now;
  const esperar = op.esperar ?? pausa;
  const { host, puerto } = puertoDeBase(base);
  const abierto = op.puertoAbierto ?? (() => puertoAbiertoReal(puerto, host));
  /** @type {Map<string, Sesion>} */ const sesiones = new Map();
  /** @type {Map<string, number[]>} */ const cubetas = new Map();
  /** @type {Set<string>} */ const vistas = new Set();

  const sesionDe = (nombre, cred) => {
    let s = sesiones.get(nombre);
    if (!s) { s = new Sesion({ negocio: nombre, cred, base, fetch: op.fetch, ahora }); sesiones.set(nombre, s); }
    return s;
  };

  /** cubeta: pares [t, esEscritura] */
  const tomar = (nombre, escribe) => {
    const t = ahora();
    const previas = /** @type {[number, boolean][]} */ (cubetas.get(nombre) ?? []).filter(([x]) => t - x < 60_000);
    if (previas.length >= LIMITE_PEDIDOS_MIN) { cubetas.set(nombre, previas); return `Más de ${LIMITE_PEDIDOS_MIN} pedidos por minuto a «${nombre}»; espera un momento.`; }
    if (escribe && previas.filter(([, w]) => w).length >= LIMITE_ESCRITURAS_MIN) { cubetas.set(nombre, previas); return `Más de ${LIMITE_ESCRITURAS_MIN} escrituras por minuto a «${nombre}»; espera un momento.`; }
    previas.push([t, escribe]);
    cubetas.set(nombre, previas);
    return null;
  };

  /** @param {import("./tipos.mjs").Pedido} pedido @param {Response} res */
  async function meSinSesion(pedido, res) {
    if (pedido.ruta !== "/api/auth/me" || res.status !== 200 || typeof res.clone !== "function") return false;
    const j = await res.clone().json().catch(() => null);
    return j?.authenticated === false;
  }

  /** @param {Response} res */
  async function esCsrf(res) {
    if (typeof res.clone !== "function") return false;
    return /csrf/i.test(await res.clone().text().catch(() => ""));
  }

  async function leerCuerpo(res) {
    const txt = await res.text().catch(() => "");
    if (!txt) return { txt, datos: undefined };
    try { return { txt, datos: JSON.parse(txt) }; } catch { return { txt, datos: undefined }; }
  }

  function mapear(status, txt, datos, ms) {
    const msg = String(datos?.message ?? datos?.error ?? datos?.detalle ?? "").slice(0, 300);
    if (status >= 500 && esHtml(txt)) {
      const f = archivoCulpable(txt);
      return fallo("compilando", `El panel está compilando o tiene un error de compilación${f ? ` en ${f}` : ""}. Reintentá en unos segundos.`, status, ms);
    }
    if (status === 400 || status === 409 || status === 422) return fallo("datos_invalidos", msg || "Datos inválidos", status, ms, datos?.issues ?? datos?.details ?? datos?.errors);
    if (status === 401) return fallo("sin_sesion", msg || "Sesión vencida y no se pudo renovar", status, ms);
    if (status === 403) return fallo("sin_permiso", msg || "El usuario «claude» no tiene permiso para esto", status, ms);
    if (status === 404) return fallo("no_existe", msg || "No existe", status, ms);
    if (status === 429) return fallo("limite", msg || "Demasiados pedidos al panel", status, ms);
    return fallo("servidor", msg || `El panel respondió ${status}`, status, ms);
  }

  /**
   * @param {string} negocio  "" = el de por defecto
   * @param {import("./tipos.mjs").Pedido} pedido
   * @returns {Promise<import("./tipos.mjs").Respuesta>}
   */
  async function pedir(negocio, pedido) {
    const t0 = ahora();
    const ms = () => ahora() - t0;
    let nombre, cred;
    try { ({ nombre, cred } = credencialDe(op.config, negocio)); } catch (e) { return fallo("sin_sesion", String(/** @type {any} */ (e).message)); }
    if (typeof pedido?.ruta !== "string" || !pedido.ruta.startsWith("/api/")) return fallo("ruta_no_permitida", "La ruta debe empezar con /api/");
    // Toda ruta sale tal cual se revisó: si al normalizarla cambia («..», «/./», «%3F» que se vuelve «?»), no sale.
    // Y nada codificado ni raro: los ids de las herramientas son letras, números, «_» y «-» (idRuta).
    if (!/^\/api\/[A-Za-z0-9_\-./]+$/.test(pedido.ruta)) return fallo("ruta_no_permitida", "La ruta solo lleva letras sin tilde, números, «-», «_», «.» y «/» (nada de «%», «?» ni «#»): los filtros van en `query`.");
    try {
      const u = new URL(pedido.ruta, base);
      if (u.pathname !== pedido.ruta || u.search || u.hash) return fallo("ruta_no_permitida", "La ruta cambia al normalizarla; pasa los filtros en `query`.");
    } catch { return fallo("ruta_no_permitida", "Ruta inválida"); }
    if (pedido.sinRecorte && pedido.metodo !== "GET") return fallo("ruta_no_permitida", "sinRecorte es solo para lecturas");
    const escribe = pedido.metodo !== "GET";
    const exceso = tomar(nombre, escribe);
    if (exceso) return fallo("limite", exceso);
    if (!(await abierto())) return fallo("panel_apagado", `El panel no está prendido en ${base}. Prender: \`panel\` o la herramienta \`panel_prender\`.`, 0, ms());

    const sesion = sesionDe(nombre, cred);
    const a = await sesion.asegurar();
    if (!a.ok) return a.compilando ? fallo("compilando", `Login: ${a.mensaje}. Reintentá en unos segundos.`, a.status, ms()) : fallo("sin_sesion", `No se pudo entrar a «${nombre}»: ${a.mensaje}`, a.status, ms());

    const clave = `${nombre} ${pedido.metodo} ${pedido.ruta.replace(/\/[\w-]{12,}/g, "/:id")}`;
    const primera = !vistas.has(clave);
    const tope = primera ? TOPE_PRIMERA_VEZ_MS : TOPE_NORMAL_MS;

    let form;
    if (pedido.archivo) {
      // Se vuelve a revisar al mandarlo (carpetas permitidas, oculto, .env, 25 MB) y tiene que ser el MISMO archivo
      // que Brandon vio en la ventana: mismo sha256 y tamaño que se sellaron al proponer.
      const arch = pedido.archivo;
      if (!/^[0-9a-f]{64}$/.test(String(arch.sha256 ?? ""))) return fallo("ruta_no_permitida", "Archivo sin sello (sha256): solo se sube lo que se propuso y confirmó.");
      const rev = await revisarArchivo(arch.ruta, { raices: op.raicesArchivos, casa: op.casa });
      if (!rev.ok) return fallo("ruta_no_permitida", `No se sube ese archivo: ${rev.motivo}.`);
      if (rev.sha256 !== arch.sha256 || rev.bytes !== arch.bytes) return fallo("datos_invalidos", "El archivo cambió desde que se propuso; no se subió. Pedí la propuesta de nuevo.");
      form = new FormData();
      form.append(arch.campo, new Blob([rev.buf]), rev.nombre);
      if (pedido.cuerpo && typeof pedido.cuerpo === "object") for (const [k, v] of Object.entries(pedido.cuerpo)) form.append(k, String(v));
    }
    const mandar = () => sesion.enviar({ metodo: pedido.metodo, ruta: pedido.ruta, query: pedido.query, cuerpo: pedido.cuerpo, form }, tope);

    try {
      let res = await mandar();
      // /api/auth/me responde 200 {authenticated:false} con la sesión vencida (no 401): se cura igual.
      if (res.status === 401 || (await meSinSesion(pedido, res))) {
        await res.text().catch(() => "");
        // 1 refresh; si no, 1 login; si no, sin_sesion. Jamás bucle.
        let ok = await sesion.refrescar();
        if (!ok) { sesion.olvidar(); const l = await sesion.entrar(); ok = l.ok; }
        if (!ok) return fallo("sin_sesion", `La sesión de «${nombre}» venció y no se pudo renovar. Revisá el usuario «claude» (¿desactivado?).`, 401, ms());
        res = await mandar();
      }
      // 403 del CSRF (cookie vencida a las 24 h o tirada por el panel): el proxy corta antes del handler, así que
      // reintentar 1 vez con cookie nueva no duplica nada.
      if (res.status === 403 && (await esCsrf(res))) {
        await res.text().catch(() => "");
        if (await sesion.renovarCsrf()) res = await mandar();
      }
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after"));
        await res.text().catch(() => "");
        if (Number.isFinite(ra) && ra > 0 && ra <= 10) { await esperar(ra * 1000); res = await mandar(); }
      }
      const { txt, datos } = await leerCuerpo(res);
      if (!res.ok) return mapear(res.status, txt, datos, ms());
      vistas.add(clave);
      const cuerpo = datos === undefined ? (txt || undefined) : datos;
      // sinRecorte: solo las previas (GET) que buscan un nombre por id en una lista; no vuelve al modelo entero.
      const { datos: recortados, truncado } = pedido.sinRecorte ? { datos: cuerpo, truncado: false } : recortarDatos(cuerpo);
      return { ok: true, status: res.status, datos: recortados, ms: ms(), ...(truncado ? { truncado: true } : {}) };
    } catch (e) {
      const err = /** @type {any} */ (e);
      const causa = String(err?.cause?.code ?? err?.code ?? "");
      if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH/.test(causa)) return fallo("panel_apagado", `El panel no está prendido en ${base}. Prender: \`panel\` o la herramienta \`panel_prender\`.`, 0, ms());
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        return primera
          ? fallo("compilando", `El panel no contestó en ${tope / 1000} s (¿compilando la ruta por primera vez?). Reintentá.`, 0, ms())
          : fallo("servidor", `El panel no contestó en ${tope / 1000} s.`, 0, ms());
      }
      return fallo("servidor", `Error de red: ${String(err?.message ?? err).slice(0, 200)}`, 0, ms());
    }
  }

  return { pedir, sesionDe, base };
}
