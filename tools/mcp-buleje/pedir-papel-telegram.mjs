#!/usr/bin/env node
// Brandon le pide un papel a su bot de Telegram («DNI del jefe de Shinshiguani», «mándame la partida del local») y
// el bot se lo manda (31-10). Lo llama ~/.local/bin/buzon-telegram; habla con
// /api/admin/documents/pedido-por-telegram del panel con la sesión del usuario del MCP.
//
// Uso:
//   pedir-papel-telegram.mjs buscar --negocio=<main|blas|qa-forestal> --frase="…"
//     → {"ok":true,"esPedido":true,"total":3,"elegido":"<id>|null","papeles":[{id,nombre,carpeta,codigo,…}],…}
//     → {"ok":true,"esPedido":false}          (no es un pedido de papel: el buzón sigue como siempre)
//   pedir-papel-telegram.mjs bajar --negocio=… --id=<doc>
//     → {"ok":true,"ruta":"/home/…/salida/<id>-….pdf","archivo":"Partida del local.pdf","carpeta":"…",…}
//     → {"ok":false,"error":"con_clave"|"grande"|…,"mensaje":"…","enlace":"…"}
//   pedir-papel-telegram.mjs salio --negocio=… --id=<doc> --mensaje=<chat:msg> --enviado=<message_id>
//     → {"ok":true}   (queda en el historial del papel; un reintento no lo duplica)
// Sale: UNA línea JSON en stdout (código 1 si ok=false).
// BUZON_PANEL_BASE=http://localhost:3001 = otro panel de esta PC (pruebas); sólo localhost.
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { crearCliente } from "./src/cliente.mjs";
import { credencialDe, leerCredenciales } from "./src/credenciales.mjs";
import { negocioDeConfig } from "./archivar-telegram.mjs";

export const RUTA = "/api/admin/documents/pedido-por-telegram";
/** Donde quedan los archivos que salen: el buzón los manda y los borra (lo que quede, a las 2 horas). */
export const CARPETA_SALIDA = join(homedir(), ".local", "state", "buzon-telegram", "salida");
/** Las cookies, como archivar-telegram: un login por pedido cerraba la puerta (20 por hora y por IP). */
export const CARPETA_SESIONES = join(homedir(), ".local", "state", "buleje-mcp");
/** Igual que la ruta: Telegram deja 50 MB por bot. */
export const TOPE_BYTES = 49 * 1024 * 1024;
const MENSAJE_ID = /^-?\d{1,20}:\d{1,12}$/;
const ID = /^[\w-]{1,64}$/;
const BASE_LOCAL = /^http:\/\/localhost:\d{2,5}$/;

const fallo = (error, mensaje, extra = {}) => ({ ok: false, error, mensaje, ...extra });

async function cargarSesion(sesion, archivo) {
  try {
    const pares = JSON.parse(await readFile(archivo, "utf8"));
    if (Array.isArray(pares)) for (const [k, v] of pares) if (typeof k === "string" && typeof v === "string") sesion.jar.set(k, v);
  } catch { /* primera vez o archivo roto: se entra con usuario y clave */ }
}

async function guardarSesion(sesion, archivo) {
  try {
    await mkdir(dirname(archivo), { recursive: true, mode: 0o700 });
    const tmp = `${archivo}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify([...sesion.jar]), { mode: 0o600 });
    await chmod(tmp, 0o600);
    await rename(tmp, archivo);
  } catch (e) {
    process.stderr.write(`[pedir-papel-telegram] no se pudo guardar la sesión: ${String(e)}\n`);
  }
}

/**
 * @param {string[]} argv
 * @param {{ config?: import("./src/credenciales.mjs").Config, fetch?: typeof fetch, puertoAbierto?: () => Promise<boolean>,
 *   carpetaSalida?: string, carpetaSesiones?: string, base?: string, ahora?: () => number }} [deps]  solo para tests
 */
export async function pedirPapel(argv, deps = {}) {
  const [orden, ...resto] = argv;
  if (!["buscar", "bajar", "salio"].includes(orden ?? "")) return fallo("argumentos", "Orden: buscar, bajar o salio.");
  let a;
  try {
    ({ values: a } = parseArgs({
      args: resto,
      options: {
        negocio: { type: "string" },
        frase: { type: "string" },
        id: { type: "string" },
        mensaje: { type: "string" },
        enviado: { type: "string" },
      },
      strict: true,
    }));
  } catch (e) {
    return fallo("argumentos", String(e?.message ?? e).slice(0, 200));
  }
  if (!a.negocio) return fallo("argumentos", "Falta --negocio.");

  let config;
  try { config = deps.config ?? leerCredenciales(); } catch (e) { return fallo("sin_sesion", String(e?.message ?? e)); }
  const base = deps.base ?? process.env.BUZON_PANEL_BASE;
  if (base) {
    // La sesión del usuario del MCP viaja a esa dirección: sólo un panel de esta misma PC.
    if (!BASE_LOCAL.test(base)) return fallo("argumentos", "BUZON_PANEL_BASE sólo puede ser http://localhost:<puerto>.");
    config = { ...config, base };
  }
  const negocio = negocioDeConfig(config, a.negocio);
  if (!negocio) return fallo("argumentos", `Negocio «${a.negocio}» desconocido. Hay: ${Object.keys(config.negocios).join(", ")}.`);

  const cliente = crearCliente({ config, fetch: deps.fetch, puertoAbierto: deps.puertoAbierto, ahora: deps.ahora });
  const { nombre, cred } = credencialDe(config, negocio);
  const sesion = cliente.sesionDe(nombre, cred);
  const archivoSesion = join(deps.carpetaSesiones ?? CARPETA_SESIONES, `telegram-${nombre.replace(/[^\w-]/g, "_")}.json`);
  await cargarSesion(sesion, archivoSesion);
  try {
    if (orden === "buscar") return await buscar(cliente, negocio, a);
    if (orden === "bajar") return await bajar(cliente, negocio, a, deps);
    return await salio(cliente, negocio, a);
  } finally {
    await guardarSesion(sesion, archivoSesion);
  }
}

const error = (r) => fallo(r.error?.codigo ?? "servidor", r.error?.mensaje ?? `El panel respondió ${r.status}`);

async function buscar(cliente, negocio, a) {
  const frase = String(a.frase ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 300);
  if (!frase) return fallo("argumentos", "Falta --frase.");
  const r = await cliente.pedir(negocio, { metodo: "GET", ruta: RUTA, query: { frase } });
  if (!r.ok) return error(r);
  return { ok: true, negocio, .../** @type {object} */ (r.datos ?? {}) };
}

async function bajar(cliente, negocio, a, deps) {
  if (!ID.test(String(a.id ?? ""))) return fallo("argumentos", "Falta --id (letras, números, «_» y «-»).");
  const d = await cliente.pedir(negocio, { metodo: "GET", ruta: RUTA, query: { id: a.id, que: "datos" } });
  if (!d.ok) return error(d);
  const datos = /** @type {any} */ (d.datos) ?? {};
  const deEse = { nombre: datos.nombre, enlace: datos.enlace };
  if (datos.clave) return fallo("con_clave", "Ese papel tiene claves: no sale por Telegram.", deEse);
  if (datos.grande) return fallo("grande", "Pesa más de lo que Telegram deja mandar.", { ...deEse, bytes: datos.bytes });
  const ahora = (deps.ahora ?? Date.now)();
  const g = await cliente.pedir(negocio, {
    metodo: "GET",
    ruta: RUTA,
    query: { id: a.id },
    guardarEn: { carpeta: deps.carpetaSalida ?? CARPETA_SALIDA, base: `${a.id}-${ahora}`, tope: TOPE_BYTES },
  });
  if (!g.ok) return { ...error(g), ...deEse };
  const gd = /** @type {any} */ (g.datos) ?? {};
  if (!gd.guardado) return fallo(gd.motivo === "tamano" ? "grande" : "guardar", "No pude bajar el archivo.", deEse);
  return {
    ok: true,
    negocio,
    ruta: gd.ruta,
    bytes: gd.bytes,
    id: datos.id,
    nombre: datos.nombre,
    archivo: datos.archivo,
    carpeta: datos.carpeta,
    codigo: datos.codigo,
    mime: datos.mime,
    vence: datos.vence,
    guardadoEn: datos.guardadoEn,
    enlace: datos.enlace,
  };
}

async function salio(cliente, negocio, a) {
  if (!ID.test(String(a.id ?? ""))) return fallo("argumentos", "Falta --id.");
  if (!MENSAJE_ID.test(String(a.mensaje ?? ""))) return fallo("argumentos", "--mensaje va como <chat>:<mensaje>, sólo números.");
  const enviado = Number(a.enviado);
  if (!Number.isInteger(enviado) || enviado <= 0) return fallo("argumentos", "--enviado es el message_id que devolvió Telegram.");
  const r = await cliente.pedir(negocio, { metodo: "POST", ruta: RUTA, cuerpo: { id: a.id, mensajeId: a.mensaje, enviadoId: enviado } });
  if (!r.ok) return error(r);
  return { ok: true, negocio, duplicado: Boolean(/** @type {any} */ (r.datos)?.duplicado) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mayor = Number(process.versions.node.split(".")[0]);
  const r = mayor < 20 ? fallo("node", `Node ${process.versions.node} es muy viejo (hace falta 20 o más).`) : await pedirPapel(process.argv.slice(2)).catch((e) => fallo("servidor", String(e?.message ?? e).slice(0, 200)));
  process.stdout.write(`${JSON.stringify(r)}\n`);
  process.exitCode = r.ok ? 0 : 1;
}
