#!/usr/bin/env node
// Papel que Brandon le mandó a su bot de Telegram → Archivo del panel › Llegó por Telegram › <día> (31-10).
//
// Lo llama ~/.local/bin/buzon-telegram DESPUÉS de guardar la copia local. Sin ventana de OK (a diferencia de
// doc_subir): el papel lo mandó Brandon mismo desde su chat, y eso es el OK. A cambio, sólo sube archivos del tmp
// del buzón (realpath: un enlace no saca de ahí) y sólo a la ruta de Telegram.
//
// Uso:  archivar-telegram.mjs --negocio <main|blas|qa-forestal> --archivo <ruta> --mensaje <chat:msg> [--pie "…"] [--seco]
// Sale: UNA línea JSON en stdout.
//   {"ok":true,"negocio":"blas","nombre":"Guía 0123.pdf","raiz":"Llegó por Telegram","carpeta":"2026-10-31","enlace":"…","duplicado":false}
//   {"ok":false,"error":"panel_apagado","mensaje":"…"}            (código de salida 1)
//   --seco: revisa todo (archivo, negocio, credencial) y dice qué mandaría, sin llamar al panel.
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { revisarArchivo } from "./src/archivos.mjs";
import { crearCliente } from "./src/cliente.mjs";
import { credencialDe, leerCredenciales } from "./src/credenciales.mjs";

/** La única carpeta de donde sube: donde el buzón deja lo que baja de Telegram. */
export const TMP_BUZON = join(homedir(), ".local", "state", "buzon-telegram", "tmp");
/**
 * Las cookies de la sesión, para no hacer un login por foto: el panel de producción deja 20 logins por hora y por
 * IP, y la PC de Brandon comparte la IP con su navegador (diez fotos seguidas le cerraban la puerta a él).
 * Sólo el dueño de la cuenta la lee (0600); al lado de la clave, que está en ~/.config/buleje-mcp.
 */
export const CARPETA_SESIONES = join(homedir(), ".local", "state", "buleje-mcp");
export const RUTA = "/api/admin/documents/llego-por-telegram";
const MENSAJE_ID = /^-?\d{1,20}:\d{1,12}$/;
const TOPE_PIE = 200;

const fallo = (error, mensaje) => ({ ok: false, error, mensaje });

/**
 * «main» es como lo dice Brandon; en la config ese negocio se llama «bodega». Acepta el nombre de la config o el
 * slug `main`.
 * @param {import("./src/credenciales.mjs").Config} config @param {string} negocio
 */
export function negocioDeConfig(config, negocio) {
  if (config.negocios[negocio]) return negocio;
  if (negocio === "main") return Object.keys(config.negocios).find((k) => config.negocios[k]?.slug === "main") ?? null;
  return null;
}

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
    process.stderr.write(`[archivar-telegram] no se pudo guardar la sesión: ${String(e)}\n`);
  }
}

/**
 * @param {string[]} argv
 * @param {{ config?: import("./src/credenciales.mjs").Config, fetch?: typeof fetch, puertoAbierto?: () => Promise<boolean>,
 *   raiz?: string, carpetaSesiones?: string }} [deps]  solo para tests
 */
export async function archivarTelegram(argv, deps = {}) {
  let a;
  try {
    ({ values: a } = parseArgs({
      args: argv,
      options: {
        negocio: { type: "string" },
        archivo: { type: "string" },
        mensaje: { type: "string" },
        pie: { type: "string" },
        seco: { type: "boolean", default: false },
      },
      strict: true,
    }));
  } catch (e) {
    return fallo("argumentos", String(e?.message ?? e).slice(0, 200));
  }
  if (!a.negocio || !a.archivo || !a.mensaje) return fallo("argumentos", "Faltan --negocio, --archivo o --mensaje.");
  if (!MENSAJE_ID.test(a.mensaje)) return fallo("argumentos", "--mensaje va como <chat>:<mensaje>, sólo números.");
  const pie = (a.pie ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, TOPE_PIE);

  let config;
  try { config = deps.config ?? leerCredenciales(); } catch (e) { return fallo("sin_sesion", String(e?.message ?? e)); }
  const negocio = negocioDeConfig(config, a.negocio);
  if (!negocio) return fallo("argumentos", `Negocio «${a.negocio}» desconocido. Hay: ${Object.keys(config.negocios).join(", ")}.`);

  // `casa` = la misma carpeta del buzón: la revisión de siempre prohíbe ~/.local/state (y el buzón vive ahí), así
  // que el «encierro» pasa a ser su tmp; adentro siguen prohibidos lo oculto y los .env.
  const raiz = deps.raiz ?? TMP_BUZON;
  const rev = await revisarArchivo(a.archivo, { raices: [raiz], casa: raiz });
  if (!rev.ok) {
    // El motivo de «fuera de las raíces» nombra las carpetas de doc_subir; acá la única es el tmp del buzón.
    const motivo = /^solo se suben archivos de/.test(rev.motivo) ? "sólo se suben los que bajó el buzón de Telegram" : rev.motivo;
    return fallo("archivo", `No se sube ese archivo: ${motivo}.`);
  }

  const campos = { mensajeId: a.mensaje, ...(pie ? { pie } : {}) };
  if (a.seco) {
    return { ok: true, seco: true, negocio, pedido: { metodo: "POST", ruta: RUTA, campos, archivo: { nombre: rev.nombre, bytes: rev.bytes, sha256: rev.sha256 } } };
  }

  const cliente = crearCliente({ config, fetch: deps.fetch, puertoAbierto: deps.puertoAbierto, raicesArchivos: [raiz], casa: raiz });
  const { nombre, cred } = credencialDe(config, negocio);
  const sesion = cliente.sesionDe(nombre, cred);
  const archivoSesion = join(deps.carpetaSesiones ?? CARPETA_SESIONES, `telegram-${nombre.replace(/[^\w-]/g, "_")}.json`);
  await cargarSesion(sesion, archivoSesion);
  const r = await cliente.pedir(negocio, {
    metodo: "POST",
    ruta: RUTA,
    cuerpo: campos,
    archivo: { campo: "archivo", ruta: rev.real, sha256: rev.sha256, bytes: rev.bytes },
  });
  await guardarSesion(sesion, archivoSesion);
  if (!r.ok) return fallo(r.error?.codigo ?? "servidor", r.error?.mensaje ?? `El panel respondió ${r.status}`);
  const d = /** @type {any} */ (r.datos) ?? {};
  return {
    ok: true,
    negocio,
    nombre: d.nombre ?? null,
    raiz: d.carpetaRaiz ?? "Llegó por Telegram",
    carpeta: d.carpetaNombre ?? null,
    carpetaId: d.carpetaId ?? null,
    enlace: d.enlace ?? null,
    duplicado: Boolean(d.duplicado),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mayor = Number(process.versions.node.split(".")[0]);
  const r = mayor < 20 ? fallo("node", `Node ${process.versions.node} es muy viejo (hace falta 20 o más).`) : await archivarTelegram(process.argv.slice(2)).catch((e) => fallo("servidor", String(e?.message ?? e).slice(0, 200)));
  process.stdout.write(`${JSON.stringify(r)}\n`);
  process.exitCode = r.ok ? 0 : 1;
}
