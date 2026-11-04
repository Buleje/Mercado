#!/usr/bin/env node
// Yape → caja (04-11-2026, diseño «Yape se anota solo en la caja», carril B: lado PC).
// El celular (MacroDroid) manda cada aviso de Yape al tablero (POST /api/yape, cabecera X-Llave-Yape); el tablero lo deja en
// ~/.local/state/yape/entrada/<sha256(equipo|envio)>.json y lanza `procesar <archivo>`.
//   procesar <archivo>          lee el aviso, arma la llave de contenido y decide: va solo a la caja (panel
//                               POST /api/cash-registers/yape) o queda PENDIENTE en Telegram con botones yp:<id>:si|otro|pers|no.
//   boton <yp:…> --quien=<…>    lo llama buzon-telegram cuando Brandon toca; imprime {texto, botones, toque} en una línea JSON.
//   prueba-telegram             manda UN mensaje «PRUEBA Yape (no es plata real)» con botones (tocarlo no anota nada).
// El negocio sale de ~/.config/yape/ajustes.json ({"negocio":"main","aprender":true,"tope":500,"equipos":{"poco-c71":"main"}}),
// NUNCA del celular: con «equipos», el negocio es el del equipo que mandó el aviso y un equipo que no está ahí queda pendiente.
// Modo aprender (aprender:true): TODO va a pendiente con el texto crudo; nada entra a la caja sin el toque de Brandon.
// Lo que va solo a la caja espera 10 min desde el pago (.hecho «esperando» con `hasta`): si en ese rato se cobró como venta
// por Yape en la caja, el panel la ve (venta_yape_parecida) y no se cuenta dos veces. Lo retoma el respaldo del buzón.
// Botones como los pnl: del 01-11: el estado vive en botones/<sha256(id)>.json firmado con HMAC(id); el id solo está en Telegram.
// YAPE_SECO=1: no llama al panel ni a Telegram (imprime lo que haría; llaves-seco/ y botones-seco/). Ley 29733: lo mínimo,
// 0600/0700, y el buzón borra lo de más de 60 días.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const CASA = process.env.YAPE_CASA || homedir();
const SECO = process.env.YAPE_SECO === "1";
const DIR = join(CASA, ".local/state/yape");
export const ENTRADA = join(DIR, "entrada");
const LLAVES = join(DIR, SECO ? "llaves-seco" : "llaves");
const BOTONES = join(DIR, SECO ? "botones-seco" : "botones"); // un botón de prueba nunca se mezcla con los de verdad
const AJUSTES = join(CASA, ".config/yape/ajustes.json");
const PERSONALES = join(CASA, ".config/yape/personales.txt");
const RUTA_PANEL = "/api/cash-registers/yape";
const MAX_CONTRATO_CENTIMOS = 500_000; // el panel no acepta más (YapeEntranteSchema)
const BLOQUE_MS = 600_000; // 10 min
const LIMA_MS = -5 * 3600_000; // Lima = UTC−5 todo el año
const VENCE_TOMA_MS = 600_000;
const ESPERA_MS = 600_000; // lo automático espera 10 min desde el pago: así el panel ya ve la venta por Yape de la caja
const CANDADO_ESPERA_MS = 5_000, CANDADO_MUERTO_MS = 30_000;
const RE_NEGOCIO = /^[a-z0-9-]{1,60}$/, RE_EQUIPO = /^[a-z0-9._-]{1,40}$/;
const VIEJO_MS = 24 * 3600_000; // aviso que llega (o se procesa) con más de 24 h de atraso → pendiente
const RE_BOTON = /^yp:([A-Z2-7]{24}):(si|otro|pers|no)$/;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ETIQUETAS = { main: "Bodega", blas: "Blas", "qa-forestal": "QA forestal" };
const PANEL = new Set(["sin_turno", "fuera_de_turno", "venta_yape_parecida"]);
const MOTIVOS = {
  formato: "No reconocí el aviso (formato nuevo, monto dudoso o no es un pago recibido).",
  personal: "Quien pagó está en tu lista de personales.",
  tope: "Pasa el tope por Yape de los ajustes.",
  viejo: "Llegó con más de 24 horas de atraso: revisa que no lo hayas anotado ya antes de tocar «Sí».",
  duplicado: "Parece repetido: llegó otro igual (mismo pagador, monto y código) en estos 10 minutos.",
  ajustes: "Los ajustes de Yape están rotos (~/.config/yape/ajustes.json): no sé a qué negocio va.",
  aprender: "Modo aprender: todo pasa por ti antes de entrar a la caja.",
  equipo: (st) => `Llegó de un equipo que no conozco: ${st.equipo ?? "sin nombre"}.`,
  sin_turno: "No hay caja abierta: ábrela y toca «Anotar igual».",
  fuera_de_turno: "Llegó antes de abrir la caja de ahora: «Anotar igual» lo pone en la caja de ahora.",
  venta_yape_parecida: "Hay una venta con Yape del mismo monto (±10 min): ¿no será la misma? Si es otro pago, «Anotar igual».",
  panel_panel_apagado: "El panel está apagado: préndelo y toca «Sí» otra vez.",
  panel_compilando: "El panel está arrancando: toca «Sí» en un minuto.",
  panel_sin_sesion: "No pude entrar al panel con la sesión de la conexión.",
};

export const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
export const plano = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const limpio = (v, n) => String(v ?? "").replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim().slice(0, n);
export const soles = (c) => `S/ ${String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${String(c % 100).padStart(2, "0")}`;
const etiqueta = (neg) => (neg && ETIQUETAS[neg]) || neg || "¿negocio?";
const horaLima = (iso) => new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// ── lectura del aviso ────────────────────────────────────────────────────────────────────────────────────────────────
/** «10» · «10.50» · «1,250.00» → céntimos. «10,50» o «1.250,00» = dudoso → null (mejor pendiente que un monto mal leído). */
export function centimosDe(crudo) {
  const s = String(crudo ?? "").trim().replace(/[.,]$/, "");
  let ent, dec = "";
  if (/^\d+$/.test(s)) ent = s;
  else if (/^\d+\.\d{1,2}$/.test(s)) [ent, dec] = s.split(".");
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) [ent, dec = ""] = s.replace(/,/g, "").split(".");
  else return null;
  const c = Number(ent) * 100 + Number(`${dec}00`.slice(0, 2));
  return Number.isSafeInteger(c) && c > 0 ? c : null;
}

const RE_PAGO = /\s*te\s+(?:envi[oó]|ha\s+enviado)\s+un\s+pago\s+(?:por|de)\s*:?\s*S\/\.?\s*(\d[\d.,]*)/iu;
// Palabra del nombre: «JUAN», «D'ANGELO», «QUISPE-ROJAS» o una inicial con punto («P.»). Así «Recibiste un pago. LUIS A.» da «LUIS A.».
const PAL = String.raw`(?:\p{L}{1,2}\.|\p{L}[\p{L}'&-]*)`;
const RE_NOMBRE = new RegExp(String.raw`(?<![\p{L}'&.-])(${PAL}(?:\s+${PAL}){0,5})$`, "u");
const RE_SALIDA = /\b(?:yapeaste|enviaste|pagaste)\b/iu;
const RE_CODIGO = /c[oó]d(?:igo)?\.?\s*(?:de\s+)?seguridad\s*(?:es)?\s*:?\s*(\d{3})(?!\d)/iu;
const RE_OPERACION = /(?:n(?:ro|um|úm|°|º)?\.?\s*(?:de\s+)?operaci[oó]n|operaci[oó]n\s*(?:n(?:ro|°|º)?\.?)?)\s*:?\s*(\d{4,20})(?!\d)/iu;

/**
 * Aviso de Yape recibido → { montoCentimos, pagador, codigo?, nroOperacion? }; cualquier otra cosa (Yapeaste, promos,
 * formato nuevo, monto dudoso) → null, que el procesador deja pendiente con el texto crudo.
 * @param {string} titulo @param {string} texto
 */
export function leerAviso(titulo, texto) {
  const t = limpio(titulo, 300), x = limpio(texto, 1500);
  const todo = `${t} ${x}`.trim();
  if (!todo || RE_SALIDA.test(todo)) return null;
  for (const fuente of [x, t, todo]) {
    const m = RE_PAGO.exec(fuente);
    if (!m) continue;
    const montoCentimos = centimosDe(m[1]);
    if (!montoCentimos) return null;
    const n = RE_NOMBRE.exec(fuente.slice(0, m.index).trimEnd());
    const pagador = n ? n[1].replace(/^yape\s+/iu, "").trim().slice(0, 80) : "";
    if ((pagador.match(/\p{L}/gu) ?? []).length < 2) return null;
    const codigo = RE_CODIGO.exec(todo)?.[1];
    const nroOperacion = RE_OPERACION.exec(todo)?.[1];
    return { montoCentimos, pagador, ...(codigo ? { codigo } : {}), ...(nroOperacion ? { nroOperacion } : {}) };
  }
  return null;
}

// ── llaves de contenido ──────────────────────────────────────────────────────────────────────────────────────────────
export const bloqueDe = (ms) => Math.floor((ms + LIMA_MS) / BLOQUE_MS);

/**
 * Con n.º de operación: sha256("op:<nro>") (único, sin vecinas). Sin él: sha256(nombre normalizado|céntimos|código|bloque de
 * 10 min hora Lima); se revisan el bloque anterior y el siguiente para que un aviso repetido a las 10:09:59 y 10:10:01 se vea.
 * @param {{montoCentimos:number, pagador:string, codigo?:string, nroOperacion?:string}} aviso @param {number} ms
 */
export function llavesDe(aviso, ms) {
  if (aviso.nroOperacion) return { actual: sha(`op:${aviso.nroOperacion}`), anterior: null, siguiente: null, vecinas: [] };
  const b = bloqueDe(ms);
  const k = (blq) => sha([plano(aviso.pagador), aviso.montoCentimos, aviso.codigo ?? "", blq].join("|"));
  const anterior = k(b - 1), siguiente = k(b + 1);
  return { actual: k(b), anterior, siguiente, vecinas: [anterior, siguiente] };
}

/** La hora del disparo en el celular (igual en los reintentos); si es absurda frente a la llegada, la llegada. */
export function momentoDe(e) {
  const llego = Number(e?.llego), envio = Number(e?.envio);
  if (!Number.isFinite(llego)) return Number.isFinite(envio) ? envio : Date.now();
  return Number.isFinite(envio) && envio <= llego + 120_000 && envio >= llego - 3 * 86_400_000 ? envio : llego;
}

/** Más de 24 h entre el pago y su llegada a la PC, o entre la llegada y este proceso (el respaldo del buzón lo relanzó tarde). */
export function atrasado(e, ahora = Date.now()) {
  const llego = Number(e?.llego), envio = Number(e?.envio);
  const base = Number.isFinite(llego) ? llego : ahora;
  return ahora - base > VIEJO_MS || (Number.isFinite(envio) && base - envio > VIEJO_MS);
}
// ── archivos privados ────────────────────────────────────────────────────────────────────────────────────────────────
function crearExclusivo(ruta, datos) {
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  let fd;
  try { fd = openSync(ruta, "wx", 0o600); } catch (e) { if (/** @type {any} */ (e)?.code === "EEXIST") return false; throw e; }
  try { writeSync(fd, datos); } finally { closeSync(fd); }
  return true;
}

function escribirPrivado(ruta, datos) {
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  const tmp = `${ruta}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  const fd = openSync(tmp, "wx", 0o600);
  try { writeSync(fd, datos); } finally { closeSync(fd); }
  renameSync(tmp, ruta);
}

/** Toma exclusiva (O_EXCL); una toma «procesando» de más de 10 min se da por muerta, y una «esperando» cumplida
 *  (`hasta` ya pasó) se retoma. */
function tomar(ruta) {
  const marca = JSON.stringify({ estado: "procesando", t: Date.now() });
  if (crearExclusivo(ruta, marca)) return true;
  try {
    const d = JSON.parse(readFileSync(ruta, "utf8"));
    const muerta = d.estado === "procesando" && Date.now() - Number(d.t) > VENCE_TOMA_MS;
    const cumplida = d.estado === "esperando" && Date.now() >= Number(d.hasta);
    if (muerta || cumplida) { escribirPrivado(ruta, marca); return true; }
  } catch { /* a medio escribir por otro proceso: se lo deja */ }
  return false;
}

const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Un proceso a la vez sobre las llaves (llaves/.candado con O_EXCL): reintenta cada 50 ms hasta 5 s; uno de más de 30 s
 *  es de un proceso muerto y se borra. Sin esto, dos avisos iguales en bloques vecinos podían pasar los dos como «nueva». */
function conCandado(fn) {
  const ruta = join(LLAVES, ".candado");
  const limite = Date.now() + CANDADO_ESPERA_MS;
  for (;;) {
    if (crearExclusivo(ruta, String(process.pid))) break;
    let muerto = false;
    try { muerto = Date.now() - statSync(ruta).mtimeMs > CANDADO_MUERTO_MS; } catch { /* lo soltó recién: reintentar */ }
    if (muerto) { rmSync(ruta, { force: true }); continue; }
    if (Date.now() > limite) throw new Error("las llaves de Yape siguen ocupadas después de 5 s");
    dormir(50);
  }
  try { return fn(); } finally { rmSync(ruta, { force: true }); }
}

/** Marca la llave como de esta entrada (h). «repetida» si la llave o una vecina es de OTRA entrada. */
function marcarLlave(ll, h) {
  const duena = (k) => { try { return readFileSync(join(LLAVES, k), "utf8").trim(); } catch { return null; } };
  return conCandado(() => {
    let repetida = !crearExclusivo(join(LLAVES, ll.actual), h) && duena(ll.actual) !== h;
    for (const k of ll.vecinas) { const d = duena(k); if (d !== null && d !== h) repetida = true; }
    return repetida ? "repetida" : "nueva";
  });
}

export function leerAjustes() {
  const def = { negocio: "main", aprender: true, tope: 500 };
  let a;
  try { a = JSON.parse(readFileSync(AJUSTES, "utf8")); } catch (e) {
    if (/** @type {any} */ (e)?.code === "ENOENT") { escribirPrivado(AJUSTES, `${JSON.stringify(def)}\n`); return { ...def, equipos: null, roto: false }; }
    return { negocio: null, equipos: null, aprender: true, tope: def.tope, roto: true };
  }
  const negocioOk = typeof a?.negocio === "string" && RE_NEGOCIO.test(a.negocio);
  // «equipos»: {"poco-c71":"main"}. Si está pero mal escrito = ajustes rotos (nunca se cae al negocio suelto).
  let equipos = null, equiposOk = true;
  if (a?.equipos !== undefined) {
    const filas = a.equipos && typeof a.equipos === "object" && !Array.isArray(a.equipos) ? Object.entries(a.equipos) : [];
    equiposOk = filas.length > 0 && filas.every(([k, v]) => RE_EQUIPO.test(k) && typeof v === "string" && RE_NEGOCIO.test(v));
    if (equiposOk) equipos = Object.fromEntries(filas);
  }
  return {
    negocio: negocioOk ? a.negocio : null,
    equipos,
    aprender: a?.aprender !== false, // cualquier cosa que no sea false = aprender (lo seguro)
    tope: Number.isFinite(a?.tope) && a.tope > 0 && a.tope <= 5000 ? a.tope : def.tope,
    roto: !equiposOk || (!equipos && !negocioOk),
  };
}

const lineasPersonales = () => { try { return readFileSync(PERSONALES, "utf8").split("\n").filter((l) => !l.trim().startsWith("#")); } catch { return []; } };
const esPersonal = (nombre) => new Set(lineasPersonales().map(plano).filter(Boolean)).has(plano(nombre));
function agregarPersonal(nombre) {
  if (esPersonal(nombre)) return;
  mkdirSync(dirname(PERSONALES), { recursive: true, mode: 0o700 });
  appendFileSync(PERSONALES, `${limpio(nombre, 80)}\n`, { mode: 0o600 });
}

// ── botones firmados (patrón pnl:) ──────────────────────────────────────────────────────────────────────────────────
const idNuevo = () => Array.from(randomBytes(24), (b) => B32[b & 31]).join("");
const canon = (v) => Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`
  : JSON.stringify(v ?? null);
const firmar = (id, st) => createHmac("sha256", id).update(canon({ ...st, firma: undefined })).digest("hex");
const rutaBoton = (id) => join(BOTONES, `${sha(id)}.json`);
function guardarBoton(id, st) { st.firma = firmar(id, st); escribirPrivado(rutaBoton(id), JSON.stringify(st)); }
function leerBoton(id) {
  let st;
  try { st = JSON.parse(readFileSync(rutaBoton(id), "utf8")); } catch { return null; }
  const a = Buffer.from(String(st?.firma ?? ""), "hex"), b = Buffer.from(firmar(id, st), "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? st : null;
}

function textoPendiente(st) {
  const a = st.aviso;
  const cab = st.prueba ? "🧪 PRUEBA Yape (no es plata real)\n" : "";
  const linea = a
    ? `💸 Yape ${soles(a.montoCentimos)} de ${a.pagador}${a.codigo ? ` · cód. ${a.codigo}` : ""}${a.nroOperacion ? ` · op. ${a.nroOperacion}` : ""} · ${horaLima(st.recibidoEn)}`
    : `💸 Aviso de Yape que no pude leer · ${horaLima(st.recibidoEn)}`;
  const desde = st.equipo ? ` · desde ${st.equipo}` : "";
  const dup = st.motivos.includes("duplicado");
  const motivos = st.motivos.map((m) => {
    const t = MOTIVOS[m];
    return `• ${typeof t === "function" ? t(st) : t ?? `El panel no lo anotó (${m}${st.detalle ? `: ${st.detalle}` : ""}).`}`;
  }).join("\n");
  const crudo = `Aviso: «${[st.titulo, st.texto].filter(Boolean).join(" — ").slice(0, 300)}»`;
  const pregunta = !a ? "No lo anoto solo: si es un pago, anótalo a mano en la caja."
    : dup ? `¿Es OTRO pago o el mismo que ya llegó? (caja de ${etiqueta(st.negocio)})`
    : `¿Lo anoto en la caja de ahora (${etiqueta(st.negocio)})?\nToca «Sí» solo si este Yape NO lo cobraste ya en la caja como venta.`;
  return [cab + linea + desde, motivos, crudo, pregunta].filter(Boolean).join("\n\n");
}

function botonesDe(id, st) {
  if (!st.aviso) return [[["❌ Listo, no va a la caja", `yp:${id}:no`]]];
  // Repetido: sin «Sí» (un «Sí» distraído anotaba el mismo pago dos veces); se elige entre otro pago o el mismo.
  if (st.motivos.includes("duplicado")) return [[["➕ Es otro pago, anotar", `yp:${id}:otro`], ["✅ Es el mismo, no anotar", `yp:${id}:no`]], [["🙋 Es personal", `yp:${id}:pers`]]];
  return [[["✅ Sí, a la caja", `yp:${id}:si`], ["➕ Anotar igual", `yp:${id}:otro`]], [["🙋 Es personal", `yp:${id}:pers`], ["❌ No", `yp:${id}:no`]]];
}

// ── salidas: panel y Telegram ────────────────────────────────────────────────────────────────────────────────────────
const cuerpoPanel = (st, forzar) => ({
  llave: st.llave, montoCentimos: st.aviso.montoCentimos, pagador: limpio(st.aviso.pagador, 80),
  ...(st.aviso.codigo ? { codigo: st.aviso.codigo } : {}), ...(st.aviso.nroOperacion ? { nroOperacion: st.aviso.nroOperacion } : {}),
  recibidoEn: st.recibidoEn, ...(forzar ? { forzar: true } : {}),
});

/** POST al panel con la sesión de la conexión (la misma de registro-telegram: sesion-<negocio>.json). */
async function llamarPanel(negocio, cuerpo, quien) {
  const [{ crearCliente }, { leerCredenciales }, { CARPETA_SESIONES, negocioDeConfig }, { anotar }] = await Promise.all([
    import("./src/cliente.mjs"), import("./src/credenciales.mjs"), import("./archivar-telegram.mjs"), import("./src/registro.mjs"),
  ]);
  let config;
  try { config = leerCredenciales(); } catch (e) { return { ok: false, status: 0, error: { codigo: "sin_sesion", mensaje: String(/** @type {any} */ (e)?.message ?? e) } }; }
  const nombre = negocio ? negocioDeConfig(config, negocio) : null;
  if (!nombre) return { ok: false, status: 0, error: { codigo: "argumentos", mensaje: `el negocio «${negocio}» no está en la conexión` } };
  const cliente = crearCliente({ config, carpetaSesiones: CARPETA_SESIONES });
  const t0 = Date.now();
  const r = await cliente.pedir(nombre, { metodo: "POST", ruta: RUTA_PANEL, cuerpo });
  await Promise.resolve()
    .then(() => anotar({ herramienta: "yape_caja", tipo: "confirmar", negocio: nombre, por: "telegram", quien: limpio(quien, 80), origen: "yape-caja", clave: cuerpo.llave.slice(0, 16), metodo: "POST", ruta: RUTA_PANEL, cuando: new Date().toISOString(), confirmado: true, status: r.status, ms: Date.now() - t0, error: r.ok ? undefined : r.error?.codigo }))
    .then(undefined, (e) => console.error("[yape-caja] registro de la conexión falló", String(e)));
  return r;
}

function resultadoPanel(r) {
  const d = r?.datos;
  if (r?.ok && (d?.estado === "anotado" || d?.estado === "ya_estaba")) return { listo: true, estado: d.estado };
  if (r?.ok && d?.estado === "pendiente") return { listo: false, motivo: String(d.motivo ?? "pendiente").slice(0, 40), detalle: d.detalle ? limpio(d.detalle, 200) : undefined };
  const cod = r?.error?.codigo ?? (r?.status ? `http_${r.status}` : "servidor");
  return { listo: false, motivo: `panel_${cod}`, detalle: limpio(r?.error?.mensaje, 200) || undefined };
}

function credTelegram() {
  const env = {};
  for (const l of readFileSync(join(CASA, ".bsm-notify.env"), "utf8").split("\n")) {
    const t = l.trim(), i = t.indexOf("=");
    if (!t || t.startsWith("#") || i < 0) continue;
    env[t.slice(0, i).replace(/^export\s+/, "").trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { token: env.TELEGRAM_BOT_TOKEN, chat: String(env.TELEGRAM_CHAT_ID) };
}

async function telegram(texto, botones) {
  const { token, chat } = credTelegram();
  const datos = new URLSearchParams({ chat_id: chat, text: texto.slice(0, 4000), disable_web_page_preview: "true" });
  if (botones) datos.set("reply_markup", JSON.stringify({ inline_keyboard: botones.map((fila) => fila.map(([text, callback_data]) => ({ text, callback_data }))) }));
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", body: datos, signal: AbortSignal.timeout(20_000) });
  let j = {};
  try { j = await r.json(); } catch { /* respuesta sin JSON: cae en el error de abajo */ }
  if (!j.ok) throw new Error(`Telegram respondió ${r.status}`); // sin la URL: lleva el token
  return j.result;
}

// ── procesar una entrada ─────────────────────────────────────────────────────────────────────────────────────────────
export async function procesar(archivo) {
  const ruta = resolve(archivo);
  if (dirname(ruta) !== ENTRADA || !/^[a-f0-9]{64}\.json$/.test(basename(ruta))) return { ok: false, error: "archivo fuera de la entrada" };
  const h = basename(ruta, ".json");
  const hecho = join(ENTRADA, `${h}.hecho`);
  if (!tomar(hecho)) return { ok: true, estado: "ya_procesado", h: h.slice(0, 8) };
  let e;
  try { e = JSON.parse(readFileSync(ruta, "utf8")); } catch {
    escribirPrivado(hecho, JSON.stringify({ estado: "invalido", t: Date.now() }));
    if (!SECO) {
      await telegram("⚠️ Llegó un aviso de Yape que no pude leer (archivo dañado): revisa tu Yape.")
        .catch((err) => console.error("[yape-caja] aviso de entrada ilegible a Telegram falló", String(err?.message ?? err)));
    }
    return { ok: false, error: "entrada ilegible", h: h.slice(0, 8) };
  }
  try {
    const r = await decidir(h, e);
    escribirPrivado(hecho, JSON.stringify({ estado: r.estado, motivos: r.motivos, t: Date.now(), ...(r.hasta ? { hasta: r.hasta } : {}), ...(SECO ? { seco: true } : {}) }));
    return { ok: true, ...r };
  } catch (err) {
    rmSync(hecho, { force: true }); // el respaldo del buzón (cada 5 min) lo vuelve a lanzar
    throw err;
  }
}

async function decidir(h, e) {
  const aj = leerAjustes();
  const titulo = limpio(e?.titulo, 300), texto = limpio(e?.texto, 1500);
  const equipo = RE_EQUIPO.test(String(e?.equipo ?? "")) ? String(e.equipo) : null;
  const ms = momentoDe(e);
  const aviso = leerAviso(titulo, texto);
  const motivos = [];
  let llave = null;
  if (!aviso) motivos.push("formato");
  else {
    const ll = llavesDe(aviso, ms);
    llave = ll.actual;
    if (marcarLlave(ll, h) === "repetida") motivos.push("duplicado");
    if (esPersonal(aviso.pagador)) motivos.push("personal");
    if (aviso.montoCentimos > Math.round(aj.tope * 100) || aviso.montoCentimos > MAX_CONTRATO_CENTIMOS) motivos.push("tope");
  }
  // Con «equipos», el negocio es el del equipo; uno que no está ahí queda pendiente (el toque usa el negocio suelto, si hay).
  const delEquipo = aj.equipos ? (equipo && Object.hasOwn(aj.equipos, equipo) ? aj.equipos[equipo] : null) : aj.negocio;
  if (aj.equipos && !delEquipo) motivos.push("equipo");
  const negocio = delEquipo ?? aj.negocio;
  if (atrasado(e)) motivos.push("viejo");
  if (aj.roto) motivos.push("ajustes");
  const fresco = Date.now() - ms < ESPERA_MS;
  const sinAprender = motivos.length ? "pendiente" : fresco ? "esperaria" : "anotaria";
  if (aj.aprender) motivos.push("aprender");
  const base = { h: h.slice(0, 8), monto: aviso ? soles(aviso.montoCentimos) : null, motivos };
  if (SECO) return { ...base, estado: motivos.length ? "pendiente" : sinAprender, sinAprender, seco: true, pagador: aviso?.pagador ?? null, negocio, equipo };
  const st = { v: 1, negocio, equipo, h, aviso, llave, titulo, texto, recibidoEn: new Date(ms).toISOString(), motivos, estado: "pendiente", creado: Date.now() };
  if (!motivos.length && aviso && fresco) return { ...base, estado: "esperando", hasta: ms + ESPERA_MS };
  if (!motivos.length && aviso) {
    const fin = resultadoPanel(await llamarPanel(negocio, cuerpoPanel(st, false), "automatico (yape-caja)"));
    if (fin.listo) {
      await telegram(`✅ Yape ${soles(aviso.montoCentimos)} de ${aviso.pagador} → caja de ahora (${etiqueta(negocio)})${fin.estado === "ya_estaba" ? " · ya estaba, no se repitió" : ""}`);
      return { ...base, estado: fin.estado };
    }
    st.motivos = [fin.motivo];
    st.detalle = fin.detalle;
  }
  const id = idNuevo();
  guardarBoton(id, st);
  await telegram(textoPendiente(st), botonesDe(id, st));
  return { ...base, estado: "pendiente", motivos: st.motivos };
}

// ── toque de Brandon ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function boton(data, quien = "?") {
  const m = RE_BOTON.exec(String(data ?? ""));
  if (!m) return { toque: "Botón inválido" };
  const [, id, acc] = m;
  const st = leerBoton(id);
  if (!st) return { toque: "Ese botón venció o no es válido" };
  if (st.estado !== "pendiente") return { toque: "Ya estaba resuelto", texto: st.final, botones: null };
  const base = textoPendiente(st);
  const cerrar = (final, toque) => {
    Object.assign(st, { estado: "resuelto", final, quien: limpio(quien, 80), cuando: Date.now() });
    guardarBoton(id, st);
    return { texto: final, botones: null, toque };
  };
  const dup = st.motivos.includes("duplicado");
  if (acc === "no") return dup ? cerrar(`${base}\n\n✅ No se anotó: era el mismo pago.`, "Era el mismo: no se anota") : cerrar(`${base}\n\n❌ No se anotó.`, "No se anota");
  if (!st.aviso) return { toque: "No leí el monto: anótalo a mano o toca «No»" };
  // La prueba va ANTES que «personal»: tocar «Es personal» en la prueba no mete a «PERSONA DE PRUEBA» en personales.txt.
  if (st.prueba) return cerrar(`${base}\n\n🧪 Era una prueba: no se anotó nada.`, "Prueba: nada se anotó");
  if (acc === "si" && dup) return { toque: "Es repetido: elige «Es otro pago» o «Es el mismo»" };
  if (acc === "pers") {
    agregarPersonal(st.aviso.pagador);
    return cerrar(`${base}\n\n🙋 Personal: no va a la caja. Los próximos de ${st.aviso.pagador} también quedan pendientes como personales.`, "Anotado como personal");
  }
  if (!st.negocio) return { toque: "No sé a qué negocio va: revisa los ajustes de Yape" };
  const toma = join(BOTONES, `${sha(id)}.tomado`);
  if (!tomar(toma)) return { toque: "Ya lo estoy anotando…" };
  try {
    let forzar = false;
    if (acc === "otro") {
      // Repetido de contenido → es OTRO pago: llave propia de esta entrada. Venta parecida del panel → el mismo, «anotar igual».
      if (st.motivos.includes("duplicado")) { st.llave = sha(`${st.llave}|otro|${st.h}`); st.motivos = st.motivos.filter((x) => x !== "duplicado"); }
      else forzar = true;
    }
    const r = SECO ? { ok: true, status: 0, datos: { estado: "anotado" } } : await llamarPanel(st.negocio, cuerpoPanel(st, forzar), quien);
    const fin = resultadoPanel(r);
    if (fin.listo) {
      return cerrar(`${base}\n\n${fin.estado === "ya_estaba" ? "ℹ️ Ya estaba en la caja: no se anotó dos veces." : `✅ Anotado en la caja de ahora (${etiqueta(st.negocio)}).`}`, "Listo");
    }
    st.motivos = [...st.motivos.filter((x) => x !== "aprender" && !x.startsWith("panel_") && !PANEL.has(x)), fin.motivo];
    st.detalle = fin.detalle;
    guardarBoton(id, st);
    return { texto: textoPendiente(st), botones: botonesDe(id, st), toque: "Todavía no se anotó" };
  } finally { rmSync(toma, { force: true }); }
}

/** UN mensaje marcado «PRUEBA Yape (no es plata real)»: sus botones nunca llaman al panel. */
async function prueba() {
  const ms = Date.now();
  const st = {
    v: 1, negocio: leerAjustes().negocio, h: sha(`prueba|${ms}`), aviso: { montoCentimos: 100, pagador: "PERSONA DE PRUEBA" }, llave: sha(`prueba|${ms}`),
    titulo: "PRUEBA Yape (no es plata real)", texto: "PERSONA DE PRUEBA te envió un pago por S/ 1.00", recibidoEn: new Date(ms).toISOString(),
    motivos: ["aprender"], estado: "pendiente", creado: ms, prueba: true,
  };
  const id = idNuevo();
  guardarBoton(id, st);
  const msj = SECO ? null : await telegram(textoPendiente(st), botonesDe(id, st));
  return { ok: true, id, mensaje: msj?.message_id ?? null, seco: SECO };
}

/** Solo para los tests (__tests__/yape-caja-botones.test.ts). */
export const _paraPruebas = { BOTONES, LLAVES, guardarBoton, leerBoton, botonesDe, textoPendiente, idNuevo };

async function cli(argv) {
  const [orden, ...resto] = argv;
  if (orden === "procesar" && resto[0]) return procesar(resto[0]);
  if (orden === "boton" && resto[0]) {
    const { values } = parseArgs({ args: resto.slice(1), options: { quien: { type: "string" } }, strict: false });
    return boton(resto[0], String(values.quien ?? "?"));
  }
  if (orden === "prueba-telegram") return prueba();
  return { ok: false, error: "Uso: yape-caja.mjs procesar <archivo> | boton <yp:…> --quien=<…> | prueba-telegram" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).then(
    (r) => { console.log(JSON.stringify({ cuando: new Date().toISOString(), ...r })); process.exit(0); },
    (e) => { console.log(JSON.stringify({ cuando: new Date().toISOString(), ok: false, error: String(e?.message ?? e).slice(0, 300) })); process.exit(1); },
  );
}
