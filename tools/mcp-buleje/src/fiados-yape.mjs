// Yape → fiado (06-11-2026, Brandon eligió «Yape cobra solo»): si quien yapea debe un fiado en un negocio del equipo,
// yape-caja.mjs ofrece «💳 Cobrar fiado de <Nombre> (debe S/ X)» y, SOLO con el toque de Brandon, lo cobra con la misma
// ruta y cuerpo que la herramienta fiado_cobrar: POST /api/fiados/cobrar {customerPhone, monto, metodo:"yape", aCaja:true}.
// Con aCaja el panel baja la deuda Y anota el ingreso en la caja abierta en la MISMA transacción
// (FiadosDB.cobrarPorCliente → moverCajaEnTx): por eso yape-caja NO manda además ese Yape a /api/cash-registers/yape
// (solo lo que sobra si el Yape pasa la deuda). Sin caja abierta la deuda baja igual y el panel contesta caja.sinCaja.
// Parecido SOLO por nombre (sin tildes ni mayúsculas): nombre+apellido o apellido+inicial; nunca por monto.
// La ruta de cobro no trae llave de idempotencia: la pone yape-caja (marca exclusiva por llave del aviso).
// YAPE_SECO=1 nunca llama al panel: lee YAPE_FIADOS_STUB=<json o ruta .json> = {"main":[{customerName,customerPhone,
// saldo,status}],…} (mismo formato que GET /api/fiados). Nada va por WhatsApp: el recibo es texto en el mensaje de
// Telegram de Brandon (Ley 29733: los nombres solo van ahí y en el estado 0600 del botón). GET con sinRecorte: el
// cliente corta las listas a 50 filas y un deudor de la fila 51 no saldría.
import { readFileSync } from "node:fs";

export const MAX_FIADOS = 3;
export const RUTA_FIADOS = "/api/fiados";
export const RUTA_COBRAR = "/api/fiados/cobrar";
const ABIERTOS = ["ACTIVO", "VENCIDO"]; // los mismos que cobra FiadosDB.cobrarPorCliente
const RELLENO = new Set(["de", "del", "la", "las", "los", "y", "e", "sr", "sra", "srta", "don", "dona"]);
const SEGURO_NO_SALIO = new Set(["panel_apagado", "sin_sesion", "argumentos", "ruta_no_permitida"]);
const seco = () => process.env.YAPE_SECO === "1";
const plano = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const palabras = (s) => plano(s).split(" ").filter((p) => p && !RELLENO.has(p) && !/^\d+$/.test(p));
const una = (s, n) => String(s ?? "").replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim().slice(0, n);
const centimos = (v) => Math.round(Number(v) * 100);
export const soles = (c) => `S/ ${String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${String(c % 100).padStart(2, "0")}`;
export const fechaLima = (iso) => new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Puntaje de parecido entre el nombre del Yape y el del cliente; 0 = no se parece. Pide 2 palabras enteras
 * (nombre+apellido) o 1 entera + 1 inicial («Aliaga J.»). Una palabra de 4+ letras vale como inicio de otra (Yape corta).
 */
export function parecido(pagador, cliente) {
  const p = palabras(pagador), libres = palabras(cliente);
  if (p.length < 2 || libres.length < 2) return 0;
  const igual = (w, x) => w === x || (w.length >= 4 && x.startsWith(w));
  let enteras = 0, iniciales = 0;
  for (const w of p.filter((x) => x.length > 1)) { const i = libres.findIndex((x) => igual(w, x)); if (i >= 0) { enteras++; libres.splice(i, 1); } }
  for (const w of p.filter((x) => x.length === 1)) { const i = libres.findIndex((x) => x[0] === w); if (i >= 0) { iniciales++; libres.splice(i, 1); } }
  if (enteras < 1 || enteras + iniciales < 2) return 0;
  return enteras * 2 + iniciales + (enteras + iniciales === p.length ? 1 : 0);
}

/** Lista de GET /api/fiados → una deuda por cliente (solo ACTIVO/VENCIDO con saldo; S/ en céntimos). */
export function deudasDe(fiados) {
  const por = new Map();
  for (const f of Array.isArray(fiados) ? fiados : []) {
    if (!ABIERTOS.includes(String(f?.status))) continue;
    const cliente = una(f?.customerPhone ?? f?.customerId, 40);
    const nombre = una(f?.customerName, 80);
    const saldo = centimos(f?.saldo ?? f?.balance);
    if (!cliente || !nombre || nombre === cliente || !(saldo > 0)) continue; // sin nombre real (respaldo del panel) no se cruza
    const d = por.get(cliente) ?? { cliente, nombre, saldoCentimos: 0 };
    d.saldoCentimos += saldo;
    por.set(cliente, d);
  }
  return [...por.values()];
}

/** Deudores parecidos al pagador: {lista:[{negocio, cliente, nombre, saldoCentimos}] (máx. 3), mas}. Uno claro = solo él. */
export function parecidos(pagador, deudasPorNegocio) {
  const todos = [];
  for (const [negocio, deudas] of Object.entries(deudasPorNegocio ?? {})) {
    for (const d of deudas ?? []) { const pts = parecido(pagador, d.nombre); if (pts) todos.push({ pts, negocio, ...d }); }
  }
  todos.sort((a, b) => b.pts - a.pts || b.saldoCentimos - a.saldoCentimos);
  const claro = todos.length === 1 || (todos.length > 1 && todos[0].pts - todos[1].pts >= 2);
  const lista = (claro ? todos.slice(0, 1) : todos.slice(0, MAX_FIADOS)).map(({ pts, ...d }) => d);
  return { lista, mas: !claro && todos.length > MAX_FIADOS };
}

function stub() {
  const v = seco() ? process.env.YAPE_FIADOS_STUB : null; // fuera de la prueba a seco NUNCA hay datos falsos
  if (!v) return null;
  try {
    const j = JSON.parse(v.trim().startsWith("{") ? v : readFileSync(v, "utf8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch (e) { console.error("[fiados-yape] YAPE_FIADOS_STUB no se pudo leer", String(/** @type {any} */ (e)?.message ?? e)); return null; }
}

/** pedir(negocio, pedido, clave?) con la sesión de la conexión (como llamarPanel de yape-caja); los POST van al registro. */
export function crearPedir(quien = "?") {
  /** @type {Promise<any> | undefined} */ let listo;
  const preparar = () => (listo ??= Promise.all([import("./cliente.mjs"), import("./credenciales.mjs"), import("../archivar-telegram.mjs"), import("./registro.mjs")])
    .then(([{ crearCliente }, { leerCredenciales }, { CARPETA_SESIONES, negocioDeConfig }, { anotar }]) => {
      const config = leerCredenciales();
      return { cliente: crearCliente({ config, carpetaSesiones: CARPETA_SESIONES }), nombreDe: (n) => negocioDeConfig(config, n), anotar };
    }));
  return async (negocio, pedido, clave = "") => {
    if (seco()) return { ok: false, status: 0, error: { codigo: "seco", mensaje: "a seco no se llama al panel" } };
    let p;
    try { p = await preparar(); } catch (e) { return { ok: false, status: 0, error: { codigo: "sin_sesion", mensaje: String(/** @type {any} */ (e)?.message ?? e) } }; }
    const nombre = negocio ? p.nombreDe(negocio) : null;
    if (!nombre) return { ok: false, status: 0, error: { codigo: "argumentos", mensaje: `el negocio «${negocio}» no está en la conexión` } };
    const t0 = Date.now();
    const r = await p.cliente.pedir(nombre, pedido);
    if (pedido.metodo !== "GET") {
      await Promise.resolve()
        .then(() => p.anotar({ herramienta: "yape_fiado", tipo: "confirmar", negocio: nombre, por: "telegram", quien: una(quien, 80), origen: "yape-caja", clave: String(clave).slice(0, 16), metodo: pedido.metodo, ruta: pedido.ruta, cuando: new Date().toISOString(), confirmado: true, status: r.status, ms: Date.now() - t0, error: r.ok ? undefined : r.error?.codigo }))
        .then(undefined, (e) => console.error("[fiados-yape] registro de la conexión falló", String(e?.message ?? e)));
    }
    return r;
  };
}

/** Deudas abiertas por negocio (solo lectura: 2 GET por negocio). Un negocio que falla se salta con log (sin nombres). */
export async function leerDeudas(negocios, pedir) {
  const s = stub();
  if (seco()) return s ? Object.fromEntries(negocios.map((n) => [n, deudasDe(s[n])])) : {};
  const out = {};
  await Promise.all(negocios.map(async (n) => {
    const rs = await Promise.all(ABIERTOS.map((status) => pedir(n, { metodo: "GET", ruta: RUTA_FIADOS, query: { status }, sinRecorte: true })));
    const malo = rs.find((r) => !r?.ok || !Array.isArray(r.datos));
    if (malo) { console.error(`[fiados-yape] no pude leer los fiados de ${n}:`, String(malo?.error?.codigo ?? malo?.status ?? "sin_datos")); return; }
    out[n] = deudasDe(rs.flatMap((r) => r.datos));
  }));
  return out;
}

/** Lo que sigue debiendo ese cliente (céntimos) o null si no pude releerlo. */
async function saldoDe(negocio, cliente, pedir) {
  const r = await pedir(negocio, { metodo: "GET", ruta: RUTA_FIADOS, query: { customerId: cliente }, sinRecorte: true });
  if (!r?.ok || !Array.isArray(r.datos)) return null;
  return deudasDe(r.datos).find((d) => d.cliente === cliente)?.saldoCentimos ?? 0;
}

/**
 * Cobra con el toque de Brandon. monto = el Yape entero: el panel cobra hasta lo que debe (fiado más viejo primero) y
 * `remaining` es lo que sobró. → {estado:"cobrado", cobradoCentimos, restoCentimos, quedaCentimos|null, sinCaja}
 * | {estado:"sin_deuda"} | {estado:"no_cobrado", motivo} (el panel dijo que no o ni salió: se puede volver a tocar)
 * | {estado:"dudoso", motivo} (se cortó o error del servidor: no sé si cobró → no se reintenta solo).
 */
export async function cobrar({ negocio, cliente, nombre, montoCentimos, clave }, pedir) {
  if (seco()) {
    const d = deudasDe(stub()?.[negocio]).find((x) => x.cliente === cliente);
    if (!stub()) return { estado: "no_cobrado", motivo: "seco_sin_stub" };
    if (!d) return { estado: "sin_deuda" };
    const cobrado = Math.min(montoCentimos, d.saldoCentimos);
    return { estado: "cobrado", cobradoCentimos: cobrado, restoCentimos: montoCentimos - cobrado, quedaCentimos: d.saldoCentimos - cobrado, sinCaja: false, seco: true };
  }
  const cuerpo = { customerPhone: cliente, monto: montoCentimos / 100, metodo: "yape", aCaja: true, notas: "Yape del celular, cobrado desde Telegram", nombre: una(nombre, 80) };
  const r = await pedir(negocio, { metodo: "POST", ruta: RUTA_COBRAR, cuerpo }, clave);
  if (r?.ok && r.datos?.success) {
    const cobrado = centimos(r.datos.totalCobrado);
    if (!(cobrado > 0)) return { estado: "sin_deuda" };
    const queda = await saldoDe(negocio, cliente, pedir).catch((e) => { console.error("[fiados-yape] no pude releer el saldo", String(e?.message ?? e)); return null; });
    return { estado: "cobrado", cobradoCentimos: cobrado, restoCentimos: Math.max(0, montoCentimos - cobrado), quedaCentimos: queda, sinCaja: Boolean(r.datos.caja?.sinCaja) };
  }
  if (r?.status === 404) return { estado: "sin_deuda" };
  const motivo = una(r?.error?.codigo ?? (r?.status ? `http_${r.status}` : "servidor"), 40);
  // 4xx = el panel lo rechazó antes de grabar o deshizo la transacción (409); apagado/sin sesión = ni salió.
  const seguro = (r?.status >= 400 && r?.status < 500) || SEGURO_NO_SALIO.has(motivo);
  return { estado: seguro ? "no_cobrado" : "dudoso", motivo };
}

/** Recibo de 3 líneas para pegar en WhatsApp (lo manda Brandon; acá no se envía nada). */
export function recibo({ nombre, cobradoCentimos, quedaCentimos, fecha }) {
  return [nombre, `Pagó ${soles(cobradoCentimos)} por Yape el ${fecha}`, quedaCentimos > 0 ? `Saldo pendiente: ${soles(quedaCentimos)}` : "Saldo: S/ 0.00 (deuda cancelada)"].join("\n");
}
