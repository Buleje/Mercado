#!/usr/bin/env node
// Yape → caja (04-11-2026, diseño «Yape se anota solo en la caja», carril B: lado PC).
// El celular (MacroDroid) manda cada aviso de Yape al tablero (POST /api/yape, cabecera X-Llave-Yape); el tablero lo deja en
// ~/.local/state/yape/entrada/<sha256(equipo|envio)>.json y lanza `procesar <archivo>`.
//   procesar <archivo>          lee el aviso, arma la llave de contenido y decide: va solo a la caja (panel
//                               POST /api/cash-registers/yape) o queda PENDIENTE en Telegram con botones yp:<id>:si|otro|pers|no.
//   boton <yp:…> --quien=<…>    lo llama buzon-telegram cuando Brandon toca; imprime {texto, botones, toque} en una línea JSON.
//   prueba-telegram             manda UN mensaje «PRUEBA Yape (no es plata real)» con botones (tocarlo no anota nada).
//   revisar-aprender            (timer yape-aprender, 08:10) apaga el modo aprender tras 7 días, ≥5 Yape y 0 errores.
// El negocio sale de ~/.config/yape/ajustes.json ({"negocio":"main","aprender":true,"tope":500,"equipos":{"poco-c71":"main"}}),
// NUNCA del celular: con «equipos», el negocio es el del equipo que mandó el aviso y un equipo que no está ahí queda pendiente.
// Equipo con LISTA ({"poco-c71":["main","blas"]}, 04-11): cobra para varios negocios → un toque «✅ Bodega» · «✅ Blas»
// (yp:<id>:n<i> = índice en la lista FIRMADA del estado, nunca el slug). Lo elegido se recuerda por pagador en
// ~/.config/yape/negocio-por-persona.json: la próxima vez su botón sale primero «(como la vez pasada)» y, sin aprender, entra
// solo tras la espera; un pagador nuevo siempre pregunta.
// Modo aprender (aprender:true): TODO va a pendiente con el texto crudo; nada entra a la caja sin el toque de Brandon.
// Registro para apagarlo (~/.local/state/yape/aprender.jsonl, sin nombres): {t,tipo:"yape"|"error",motivo?,h}.
// Lo que va solo a la caja espera 10 min desde el pago (.hecho «esperando» con `hasta`): si en ese rato se cobró como venta
// por Yape en la caja, el panel la ve (venta_yape_parecida) y no se cuenta dos veces. Lo retoma el respaldo del buzón.
// Botones como los pnl: del 01-11: el estado vive en botones/<sha256(id)>.json firmado con HMAC(id); el id solo está en Telegram.
// YAPE_SECO=1: no llama al panel ni a Telegram (imprime lo que haría; llaves-seco/ y botones-seco/). Ley 29733: lo mínimo,
// 0600/0700, y el buzón borra lo de más de 60 días.
// Fiados (06-11, «Yape cobra solo»): si el pagador se parece POR NOMBRE a quien debe un fiado abierto en un negocio del
// equipo (src/fiados-yape.mjs, solo lectura de GET /api/fiados), el pendiente trae «💳 Cobrar fiado de <Nombre>» primero
// (yp:<id>:f<i>, índice en la lista FIRMADA, máx. 3) y ese Yape nunca entra solo a la caja. El toque cobra con la ruta de
// fiado_cobrar (aCaja:true = el panel baja la deuda y anota la caja en la misma transacción; NO se manda aparte a la caja),
// con marca de idempotencia llaves/fiado-<sha>.json, y deja el recibo de 3 líneas en el mensaje. Si el Yape pasa la deuda,
// lo que sobra queda con la pregunta normal «¿a la caja?» (llave propia). A seco: YAPE_FIADOS_STUB. YAPE_FIADOS=0 lo apaga.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { MAX_FIADOS, cobrar as cobrarFiado, crearPedir, fechaLima, leerDeudas, parecidos, recibo } from "./src/fiados-yape.mjs";

const CASA = process.env.YAPE_CASA || homedir();
const SECO = process.env.YAPE_SECO === "1";
const DIR = join(CASA, ".local/state/yape");
export const ENTRADA = join(DIR, "entrada");
const LLAVES = join(DIR, SECO ? "llaves-seco" : "llaves");
const BOTONES = join(DIR, SECO ? "botones-seco" : "botones"); // un botón de prueba nunca se mezcla con los de verdad
const AJUSTES = join(CASA, ".config/yape/ajustes.json");
const PERSONALES = join(CASA, ".config/yape/personales.txt");
const PERSONALES_SECO = join(DIR, "personales-seco.txt"); // a seco se lee la lista real + esta, y se escribe solo esta
const MEMORIA = join(CASA, ".config/yape/negocio-por-persona.json");
const MEMORIA_SECO = join(DIR, "negocio-por-persona-seco.json");
const REGISTRO = join(DIR, "aprender.jsonl"); // a seco no se anota nada (no cuenta para apagar el modo aprender)
const ESTADO_APRENDER = join(DIR, "aprender-estado.json");
const DIA_MS = 86_400_000, SEMANA_DIAS = 7, MIN_YAPES = 5, REGISTRO_DIAS = 60;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RUTA_PANEL = "/api/cash-registers/yape";
const MAX_CONTRATO_CENTIMOS = 500_000; // el panel no acepta más (YapeEntranteSchema)
const BLOQUE_MS = 600_000; // 10 min
const LIMA_MS = -5 * 3600_000; // Lima = UTC−5 todo el año
const VENCE_TOMA_MS = 600_000;
const ESPERA_MS = 600_000; // lo automático espera 10 min desde el pago: así el panel ya ve la venta por Yape de la caja
const CANDADO_ESPERA_MS = 5_000, CANDADO_MUERTO_MS = 30_000;
const RE_NEGOCIO = /^[a-z0-9-]{1,60}$/, RE_EQUIPO = /^[a-z0-9._-]{1,40}$/;
const VIEJO_MS = 24 * 3600_000; // aviso que llega (o se procesa) con más de 24 h de atraso → pendiente
const RE_BOTON = /^yp:([A-Z2-7]{24}):(si|otro|pers|no|[no][0-3]|f[0-2])$/; // n<i> = a ese negocio · o<i> = es otro pago, a ese negocio · f<i> = cobrar ese fiado
const MAX_OPCIONES = 4;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ETIQUETAS = { main: "Bodega", blas: "Blas", "qa-forestal": "QA forestal" };
const PANEL = new Set(["sin_turno", "fuera_de_turno", "venta_yape_parecida"]);
// No es error del modo aprender: caja cerrada, venta del POS ya vista (el control contra doble cuenta funcionó) o panel apagado/arrancando (Brandon 04-11: «1 semana sin errores» = el programa no se equivocó).
const PANEL_NO_ES_ERROR = new Set(["sin_turno", "fuera_de_turno", "venta_yape_parecida", "panel_panel_apagado", "panel_compilando"]); // + anotado/ya_estaba (listo); lo demás cuenta como error
const MOTIVOS = {
  formato: "No reconocí el aviso (formato nuevo, monto dudoso o no es un pago recibido).",
  personal: "Quien pagó está en tu lista de personales.",
  tope: "Pasa el tope por Yape de los ajustes.",
  viejo: "Llegó con más de 24 horas de atraso: revisa que no lo hayas anotado ya antes de tocar «Sí».",
  duplicado: "Parece repetido: llegó otro igual (mismo pagador, monto y código) en estos 10 minutos.",
  ajustes: "Los ajustes de Yape están rotos (~/.config/yape/ajustes.json): no sé a qué negocio va.",
  aprender: "Modo aprender: todo pasa por ti antes de entrar a la caja.",
  elegir: (st) => `Este celular cobra para ${listaNegocios(st.opciones)} y ${st.aviso?.pagador ?? "quien pagó"} paga por primera vez: dime de cuál es.`,
  dos: (st) => `Este celular cobra para ${listaNegocios(st.opciones)}: confirma de cuál es (sale primero ${etiqueta(st.recordado)}, como la vez pasada).`,
  equipo: (st) => `Llegó de un equipo que no conozco: ${st.equipo ?? "sin nombre"}.`,
  sin_turno: "No hay caja abierta: ábrela y toca «Anotar igual».",
  fuera_de_turno: "Llegó antes de abrir la caja de ahora: «Anotar igual» lo pone en la caja de ahora.",
  venta_yape_parecida: "Hay una venta con Yape del mismo monto (±10 min): ¿no será la misma? Si es otro pago, «Anotar igual».",
  panel_panel_apagado: "El panel está apagado: préndelo y toca «Sí» otra vez.",
  panel_compilando: "El panel está arrancando: toca «Sí» en un minuto.",
  panel_sin_sesion: "No pude entrar al panel con la sesión de la conexión.",
  fiado: (st) => `Parece de alguien que te debe fiado: ${(st.fiados ?? []).map((f) => `${f.nombre} debe ${soles(f.saldoCentimos)} en ${etiqueta(f.negocio)}`).join(" · ")}.${st.fiadosMas ? " Hay más parecidos: si no es ninguno, cóbralo en el panel." : ""} Si este Yape es para pagarlo, toca «💳 Cobrar fiado»: baja la deuda y entra a la caja como Yape.`,
};
// A seco solo con YAPE_FIADOS_STUB (nunca el panel); de verdad solo en la casa real (con YAPE_CASA de los tests, sin panel).
const CONSULTA_FIADOS = process.env.YAPE_FIADOS !== "0" && (SECO ? Boolean(process.env.YAPE_FIADOS_STUB) : CASA === homedir());
const corto = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

export const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
export const plano = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const limpio = (v, n) => String(v ?? "").replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim().slice(0, n);
export const soles = (c) => `S/ ${String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${String(c % 100).padStart(2, "0")}`;
const etiqueta = (neg) => (neg && ETIQUETAS[neg]) || neg || "¿negocio?";
const listaNegocios = (ops) => (Array.isArray(ops) ? ops.map(etiqueta).join(" y ") : "");
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
  // «equipos»: {"poco-c71":"main"} o {"poco-c71":["main","blas"]} (lista = preguntar de cuál). Siempre se devuelve como
  // lista. Si está pero mal escrito (lista vacía, repetida, de más de 4) = ajustes rotos (nunca se cae al negocio suelto).
  let equipos = null, equiposOk = true;
  const listaOk = (v) => Array.isArray(v) && v.length >= 1 && v.length <= MAX_OPCIONES && new Set(v).size === v.length && v.every((n) => typeof n === "string" && RE_NEGOCIO.test(n));
  if (a?.equipos !== undefined) {
    const filas = a.equipos && typeof a.equipos === "object" && !Array.isArray(a.equipos) ? Object.entries(a.equipos) : [];
    const comoLista = filas.map(([k, v]) => [k, typeof v === "string" ? [v] : v]);
    equiposOk = comoLista.length > 0 && comoLista.every(([k, v]) => RE_EQUIPO.test(k) && listaOk(v));
    if (equiposOk) equipos = Object.fromEntries(comoLista);
  }
  return {
    negocio: negocioOk ? a.negocio : null,
    equipos,
    aprenderDesde: typeof a?.aprenderDesde === "string" && RE_DIA.test(a.aprenderDesde) ? a.aprenderDesde : null,
    aprender: a?.aprender !== false, // cualquier cosa que no sea false = aprender (lo seguro)
    tope: Number.isFinite(a?.tope) && a.tope > 0 && a.tope <= 5000 ? a.tope : def.tope,
    roto: !equiposOk || (!equipos && !negocioOk),
  };
}

const lineasDe = (ruta) => { try { return readFileSync(ruta, "utf8").split("\n").filter((l) => !l.trim().startsWith("#")); } catch { return []; } };
const lineasPersonales = () => [...lineasDe(PERSONALES), ...(SECO ? lineasDe(PERSONALES_SECO) : [])];
const esPersonal = (nombre) => new Set(lineasPersonales().map(plano).filter(Boolean)).has(plano(nombre));
function agregarPersonal(nombre) {
  if (esPersonal(nombre)) return;
  const ruta = SECO ? PERSONALES_SECO : PERSONALES;
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  appendFileSync(ruta, `${limpio(nombre, 80)}\n`, { mode: 0o600 });
}

// ── negocio por persona (equipos con lista) ─────────────────────────────────────────────────────────────────────────
/** {"juan perez":"blas"}: clave = nombre normalizado. Lo que no sea un negocio válido se ignora. A seco manda la copia seco. */
function leerMemoria() {
  const de = (ruta) => {
    try {
      const j = JSON.parse(readFileSync(ruta, "utf8"));
      return j && typeof j === "object" && !Array.isArray(j) ? Object.fromEntries(Object.entries(j).filter(([k, v]) => k && typeof v === "string" && RE_NEGOCIO.test(v))) : {};
    } catch { return {}; }
  };
  return { ...de(MEMORIA), ...(SECO ? de(MEMORIA_SECO) : {}) };
}
/** El negocio recordado para ese pagador, solo si está entre las opciones de este equipo. */
export function recordadoDe(pagador, opciones) {
  const neg = leerMemoria()[plano(pagador)];
  return neg && opciones.includes(neg) ? neg : null;
}
function recordar(pagador, negocio) {
  const k = plano(pagador);
  if (!k) return;
  const ruta = SECO ? MEMORIA_SECO : MEMORIA;
  let j = {};
  try { const x = JSON.parse(readFileSync(ruta, "utf8")); if (x && typeof x === "object" && !Array.isArray(x)) j = x; } catch { /* primera vez */ }
  if (j[k] === negocio) return;
  j[k] = negocio;
  escribirPrivado(ruta, `${JSON.stringify(j, null, 1)}\n`);
}

// ── registro para apagar el modo aprender ───────────────────────────────────────────────────────────────────────────
function anotarEvento(ev) {
  if (SECO) return;
  try {
    mkdirSync(DIR, { recursive: true, mode: 0o700 });
    appendFileSync(REGISTRO, `${JSON.stringify({ t: Date.now(), ...ev })}\n`, { mode: 0o600 });
  } catch (err) { console.error("[yape-caja] anotar en aprender.jsonl falló", String(/** @type {any} */ (err)?.message ?? err)); }
}
const errorDePanel = (fin, h) => { if (!fin.listo && !PANEL_NO_ES_ERROR.has(fin.motivo)) anotarEvento({ tipo: "error", motivo: String(fin.motivo).slice(0, 40), h: h.slice(0, 8) }); };

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
  const ops = conOpciones(st);
  const antes = ops && st.recordado ? `\nLa vez pasada ${a?.pagador} fue de ${etiqueta(st.recordado)}.` : "";
  const fh = st.fiadoHecho;
  const cobro = fh ? textoCobro(st) : "";
  const pregunta = fh && !st.restoCentimos ? ""
    : fh ? `Sobran ${soles(st.restoCentimos)} de este Yape (ya no debía más). ¿Los anoto en la caja de ahora${ops ? `? Toca el negocio (${ops.map(etiqueta).join(" o ")})` : ` (${etiqueta(st.negocio)})?`}`
    : !a ? "No lo anoto solo: si es un pago, anótalo a mano en la caja."
    : dup && ops ? `¿Es OTRO pago o el mismo que ya llegó? Si es otro, toca el negocio al que va.${antes}`
    : dup ? `¿Es OTRO pago o el mismo que ya llegó? (caja de ${etiqueta(st.negocio)})`
    : ops && !(st.negocio && enPanel(st)) ? `¿De qué negocio es: ${ops.map(etiqueta).join(" o ")}? Lo anoto en la caja de ahora de ese negocio.${antes}\nToca solo si este Yape NO lo cobraste ya en la caja como venta.`
    : `¿Lo anoto en la caja de ahora (${etiqueta(st.negocio)})?\nToca «Sí» solo si este Yape NO lo cobraste ya en la caja como venta.`;
  return [cab + linea + desde, motivos, crudo, cobro, pregunta].filter(Boolean).join("\n\n");
}

/** «✅ Cobrado S/ Y del fiado de X · queda S/ Z» + caja + el recibo de 3 líneas listo para pegar en WhatsApp. */
function textoCobro(st) {
  const fh = st.fiadoHecho;
  const calculado = fh.quedaCentimos == null;
  const queda = calculado ? Math.max(0, fh.saldoVistoCentimos - fh.cobradoCentimos) : fh.quedaCentimos;
  const caja = fh.sinCaja ? "⚠️ No había caja abierta: la deuda bajó, pero el Yape NO entró a la caja. Anótalo a mano al abrirla."
    : `Entró a la caja de ahora (${etiqueta(fh.negocio)}) como Yape.`;
  return `✅ Cobrado ${soles(fh.cobradoCentimos)} del fiado de ${fh.nombre} · queda ${soles(queda)}${calculado ? " (calculado: no pude releer el panel, confírmalo)" : ""}\n${caja}\n\n📄 Recibo listo para pegar en WhatsApp:\n${recibo({ nombre: fh.nombre, cobradoCentimos: fh.cobradoCentimos, quedaCentimos: queda, fecha: fechaLima(st.recibidoEn) })}`;
}

/** Lista firmada de negocios del equipo (≥2) o null. */
const conOpciones = (st) => (Array.isArray(st.opciones) && st.opciones.length > 1 ? st.opciones : null);
/** El panel ya contestó algo (sin caja, venta parecida, error): queda «Sí»/«Anotar igual» sobre el negocio elegido. */
const enPanel = (st) => st.motivos.some((m) => PANEL.has(m) || String(m).startsWith("panel_"));

/** Una fila «💳 Cobrar fiado» por cada parecido de la lista firmada (nunca en repetidos ni tras cobrar). */
function filasFiado(id, st) {
  if (!st.aviso || st.fiadoHecho || st.motivos.includes("duplicado") || !Array.isArray(st.fiados)) return [];
  const dos = new Set(st.fiados.map((f) => f.negocio)).size > 1 || Boolean(conOpciones(st));
  return st.fiados.slice(0, MAX_FIADOS).map((f, i) => [[`💳 Cobrar fiado de ${corto(f.nombre, 28)} (debe ${soles(f.saldoCentimos)})${dos ? ` · ${etiqueta(f.negocio)}` : ""}`, `yp:${id}:f${i}`]]);
}

const botonesDe = (id, st) => [...filasFiado(id, st), ...botonesBase(id, st)];

function botonesBase(id, st) {
  if (!st.aviso) return [[["❌ Listo, no va a la caja", `yp:${id}:no`]]];
  const dup = st.motivos.includes("duplicado");
  const lista = conOpciones(st);
  // Índice en la lista firmada (no el slug); el recordado va primero.
  const ops = lista ? lista.map((neg, i) => ({ neg, i })).sort((x, y) => Number(y.neg === st.recordado) - Number(x.neg === st.recordado)) : null;
  const comoAntes = (neg) => (neg === st.recordado ? " (como la vez pasada)" : "");
  const pers = ["🙋 Es personal", `yp:${id}:pers`];
  // Repetido: sin «Sí» (un «Sí» distraído anotaba el mismo pago dos veces); se elige entre otro pago o el mismo.
  if (dup && ops) return [ops.map(({ neg, i }) => [`➕ Otro pago → ${etiqueta(neg)}${comoAntes(neg)}`, `yp:${id}:o${i}`]), [["✅ Es el mismo, no anotar", `yp:${id}:no`], pers]];
  if (dup) return [[["➕ Es otro pago, anotar", `yp:${id}:otro`], ["✅ Es el mismo, no anotar", `yp:${id}:no`]], [pers]];
  if (ops && !(st.negocio && enPanel(st))) return [ops.map(({ neg, i }) => [`✅ ${etiqueta(neg)}${comoAntes(neg)}`, `yp:${id}:n${i}`]), [pers, ["❌ No es pago", `yp:${id}:no`]]];
  const filas = [[["✅ Sí, a la caja", `yp:${id}:si`], ["➕ Anotar igual", `yp:${id}:otro`]], [pers, ["❌ No", `yp:${id}:no`]]];
  // «Mejor a…» solo si el panel dijo con certeza que NO anotó (sin caja, fuera de turno, venta parecida). Tras un corte o un
  // error del servidor el Yape pudo quedar grabado en el primero, y el control contra doble cuenta es por negocio.
  if (ops && st.motivos.some((m) => PANEL.has(m))) filas.splice(1, 0, ops.filter(({ neg }) => neg !== st.negocio).map(({ neg, i }) => [`↔️ Mejor a ${etiqueta(neg)}`, `yp:${id}:n${i}`]));
  return filas;
}

// ── salidas: panel y Telegram ────────────────────────────────────────────────────────────────────────────────────────
const cuerpoPanel = (st, forzar) => ({
  // Tras cobrar un fiado solo va lo que sobró, con llave propia (el resto del Yape es otro movimiento de caja).
  llave: st.restoCentimos ? sha(`${st.llave}|resto-fiado`) : st.llave, montoCentimos: st.restoCentimos || st.aviso.montoCentimos, pagador: limpio(st.aviso.pagador, 80),
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
    anotarEvento({ tipo: "error", motivo: "ilegible", h: h.slice(0, 8) });
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
  if (!aviso) {
    motivos.push("formato");
    // Un «Yapeaste» (salida) se reconoce bien: no es error. Lo demás que no se pudo leer, sí.
    if (!RE_SALIDA.test(`${titulo} ${texto}`)) anotarEvento({ tipo: "error", motivo: "no_leido", h: h.slice(0, 8) });
  } else {
    anotarEvento({ tipo: "yape", h: h.slice(0, 8) });
    const ll = llavesDe(aviso, ms);
    llave = ll.actual;
    if (marcarLlave(ll, h) === "repetida") motivos.push("duplicado");
    if (esPersonal(aviso.pagador)) motivos.push("personal");
    if (aviso.montoCentimos > Math.round(aj.tope * 100) || aviso.montoCentimos > MAX_CONTRATO_CENTIMOS) motivos.push("tope");
  }
  // Con «equipos», el negocio es el del equipo; uno que no está ahí queda pendiente (el toque usa el negocio suelto, si hay).
  // Equipo con lista: el negocio recordado de ese pagador; pagador nuevo → «elegir» (siempre pregunta).
  // Ajustes rotos = no sé a qué negocio va (ni el «negocio» suelto: con un equipo mal escrito podría ser el otro negocio).
  const lista = aj.roto ? null : aj.equipos ? (equipo && Object.hasOwn(aj.equipos, equipo) ? aj.equipos[equipo] : null) : aj.negocio ? [aj.negocio] : null;
  if (aj.equipos && !lista) motivos.push("equipo");
  // Equipo desconocido: se ofrecen TODOS los negocios de los equipos conocidos (nunca se supone la Bodega; revisión 04-11).
  const posibles = lista ?? (aj.roto || !aj.equipos ? null : [...new Set(Object.values(aj.equipos).flat())]);
  const opciones = posibles && posibles.length > 1 ? posibles : null;
  const recordado = opciones && aviso ? recordadoDe(aviso.pagador, opciones) : null;
  // Con 2+ negocios NUNCA se anota solo (reviewer + security 04-11): el control contra doble cuenta del panel es POR negocio,
  // así que un cliente recordado como Blas que paga una venta Yape del POS de la Bodega entraría también a Blas. Lo recordado
  // solo pone su botón primero.
  if (opciones && aviso) motivos.push(recordado ? "dos" : "elegir");
  const negocio = aj.roto ? null : opciones ? recordado : (posibles?.[0] ?? null);
  if (atrasado(e)) motivos.push("viejo");
  if (aj.roto) motivos.push("ajustes");
  // Fiados: quien paga debe en un negocio del equipo → botón «Cobrar fiado» y no entra solo a la caja (repetido: no se busca).
  const fiados = aviso && !motivos.includes("duplicado") && posibles?.length && CONSULTA_FIADOS ? await buscarFiados(aviso.pagador, posibles) : null;
  if (fiados?.lista.length) motivos.push("fiado");
  const fresco = Date.now() - ms < ESPERA_MS;
  const sinAprender = motivos.length ? "pendiente" : fresco ? "esperaria" : "anotaria";
  if (aj.aprender) motivos.push("aprender");
  const base = { h: h.slice(0, 8), monto: aviso ? soles(aviso.montoCentimos) : null, motivos };
  const st = { v: 1, negocio, equipo, h, aviso, llave, titulo, texto, recibidoEn: new Date(ms).toISOString(), motivos, estado: "pendiente", creado: Date.now(), ...(opciones ? { opciones, recordado } : {}), ...(fiados?.lista.length ? { fiados: fiados.lista, fiadosMas: fiados.mas } : {}) };
  if (SECO) {
    // A seco el pendiente deja su botón en botones-seco/ (para `buzon-telegram --simular-toque`) y muestra los botones.
    const extra = {};
    if (motivos.length) { const id = idNuevo(); guardarBoton(id, st); extra.botones = botonesDe(id, st); }
    return { ...base, estado: motivos.length ? "pendiente" : sinAprender, sinAprender, seco: true, pagador: aviso?.pagador ?? null, negocio, equipo, ...(opciones ? { opciones, recordado } : {}), ...(st.fiados ? { fiados: st.fiados.length } : {}), ...extra };
  }
  if (!motivos.length && aviso && fresco) return { ...base, estado: "esperando", hasta: ms + ESPERA_MS };
  if (!motivos.length && aviso) {
    const fin = resultadoPanel(await llamarPanel(negocio, cuerpoPanel(st, false), "automatico (yape-caja)"));
    errorDePanel(fin, h);
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

/** Deudores parecidos en los negocios del equipo; nunca rompe ni demora el aviso (15 s de tope, error = sin botón). */
async function buscarFiados(pagador, negocios) {
  let tope;
  try {
    const deudas = await Promise.race([
      leerDeudas(negocios.filter((n) => RE_NEGOCIO.test(String(n))), crearPedir("automatico (yape-caja)")),
      new Promise((_, no) => { tope = setTimeout(() => no(new Error("los fiados tardaron más de 15 s")), 15_000); }),
    ]);
    return parecidos(pagador, deudas);
  } catch (err) {
    console.error("[yape-caja] no pude buscar fiados", String(/** @type {any} */ (err)?.message ?? err));
    return null;
  } finally { clearTimeout(tope); }
}

// ── toque de Brandon ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function boton(data, quien = "?") {
  const m = RE_BOTON.exec(String(data ?? ""));
  if (!m) return { toque: "Botón inválido" };
  const [, id, accion] = m;
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
  // n<i>/o<i>: el negocio sale de la lista FIRMADA del estado; un índice que no está ahí no anota nada.
  const ix = /^[no]([0-3])$/.exec(accion);
  const elegido = ix ? conOpciones(st)?.[Number(ix[1])] ?? null : null;
  if (ix && !elegido) return { toque: "Botón inválido" };
  const acc = ix ? (accion[0] === "n" ? "si" : "otro") : accion;
  if (acc === "no") return dup ? cerrar(`${base}\n\n✅ No se anotó: era el mismo pago.`, "Era el mismo: no se anota") : cerrar(`${base}\n\n❌ No se anotó.`, "No se anota");
  if (!st.aviso) return { toque: "No leí el monto: anótalo a mano o toca «No»" };
  // La prueba va ANTES que «personal»: tocar «Es personal» en la prueba no mete a «PERSONA DE PRUEBA» en personales.txt.
  if (st.prueba) return cerrar(`${base}\n\n🧪 Era una prueba: no se anotó nada.`, "Prueba: nada se anotó");
  const fx = /^f([0-2])$/.exec(accion);
  if (fx) return tocarFiado(id, st, Number(fx[1]), quien, base, cerrar);
  if (acc === "si" && dup) return { toque: conOpciones(st) ? "Es repetido: elige «Otro pago» o «Es el mismo»" : "Es repetido: elige «Es otro pago» o «Es el mismo»" };
  if (acc === "pers") {
    agregarPersonal(st.aviso.pagador);
    return cerrar(`${base}\n\n🙋 Personal: no va a la caja. Los próximos de ${st.aviso.pagador} también quedan pendientes como personales.`, "Anotado como personal");
  }
  if (!st.negocio && !elegido) return { toque: conOpciones(st) ? "Toca el negocio al que va" : "No sé a qué negocio va: revisa los ajustes de Yape" };
  const toma = join(BOTONES, `${sha(id)}.tomado`);
  if (!tomar(toma)) return { toque: "Ya lo estoy anotando…" };
  try {
    let recuerdo = "";
    if (elegido) {
      // Se recuerda al elegir (antes del panel): la próxima vez ese botón sale primero. Elegir distinto de lo recordado = error
      // para el modo aprender (una vez por mensaje).
      if (st.recordado && elegido !== st.recordado && !st.cambioAnotado) { anotarEvento({ tipo: "error", motivo: "cambio_negocio", h: String(st.h).slice(0, 8) }); st.cambioAnotado = true; }
      recordar(st.aviso.pagador, elegido);
      st.negocio = elegido;
      st.motivos = st.motivos.filter((x) => x !== "elegir");
      recuerdo = `\nLa próxima vez que pague ${st.aviso.pagador} pongo primero ${etiqueta(elegido)}.`;
    }
    let forzar = false;
    if (acc === "otro") {
      // Repetido de contenido → es OTRO pago: llave propia de esta entrada. Venta parecida del panel → el mismo, «anotar igual».
      if (st.motivos.includes("duplicado")) { st.llave = sha(`${st.llave}|otro|${st.h}`); st.motivos = st.motivos.filter((x) => x !== "duplicado"); }
      else forzar = true;
    }
    const r = SECO ? { ok: true, status: 0, datos: { estado: "anotado" } } : await llamarPanel(st.negocio, cuerpoPanel(st, forzar), quien);
    const fin = resultadoPanel(r);
    if (!SECO) errorDePanel(fin, String(st.h));
    if (fin.listo) {
      const ok = st.restoCentimos ? `✅ Lo que sobró (${soles(st.restoCentimos)}) entró a la caja de ahora (${etiqueta(st.negocio)}).` : `✅ Anotado en la caja de ahora (${etiqueta(st.negocio)}).`;
      return cerrar(`${base}\n\n${fin.estado === "ya_estaba" ? "ℹ️ Ya estaba en la caja: no se anotó dos veces." : ok}${recuerdo}`, "Listo");
    }
    st.motivos = [...st.motivos.filter((x) => x !== "aprender" && !x.startsWith("panel_") && !PANEL.has(x)), fin.motivo];
    st.detalle = fin.detalle;
    guardarBoton(id, st);
    return { texto: textoPendiente(st), botones: botonesDe(id, st), toque: "Todavía no se anotó" };
  } finally { rmSync(toma, { force: true }); }
}

/**
 * «💳 Cobrar fiado»: cobra el Yape contra el fiado elegido de la lista FIRMADA (ruta de fiado_cobrar, aCaja:true).
 * Idempotencia: marca exclusiva por llave del aviso; se suelta solo si el panel dijo con certeza que no cobró.
 */
async function tocarFiado(id, st, i, quien, base, cerrar) {
  const f = Array.isArray(st.fiados) ? st.fiados[i] : null;
  if (st.fiadoHecho) return { toque: "Ese fiado ya se cobró" };
  if (!f || st.motivos.includes("duplicado") || !RE_NEGOCIO.test(String(f.negocio))) return { toque: "Botón inválido" };
  const toma = join(BOTONES, `${sha(id)}.tomado`);
  if (!tomar(toma)) return { toque: "Ya lo estoy cobrando…" };
  try {
    const marca = join(LLAVES, `fiado-${sha(`fiado|${st.llave}`)}.json`);
    if (!crearExclusivo(marca, JSON.stringify({ estado: "cobrando", t: Date.now(), h: String(st.h).slice(0, 8) }))) {
      return cerrar(`${base}\n\nℹ️ Este Yape ya se usó para cobrar un fiado: no se cobró dos veces. Míralo en el panel (Clientes › Fiados).`, "Ya estaba cobrado");
    }
    const r = await cobrarFiado({ negocio: f.negocio, cliente: f.cliente, nombre: f.nombre, montoCentimos: st.aviso.montoCentimos, clave: st.llave }, crearPedir(quien));
    if (r.estado === "no_cobrado" || r.estado === "sin_deuda") rmSync(marca, { force: true });
    else escribirPrivado(marca, JSON.stringify({ estado: r.estado, t: Date.now(), h: String(st.h).slice(0, 8) }));
    if (r.estado === "sin_deuda") {
      st.fiados = st.fiados.filter((_, j) => j !== i);
      if (!st.fiados.length) st.motivos = st.motivos.filter((x) => x !== "fiado");
      guardarBoton(id, st);
      return { texto: `${textoPendiente(st)}\n\nℹ️ ${f.nombre} ya no tiene fiado abierto en ${etiqueta(f.negocio)}: no se cobró nada. Elige qué hacer con el Yape.`, botones: botonesDe(id, st), toque: "Ya no debe" };
    }
    if (r.estado === "no_cobrado") {
      const porque = { panel_apagado: "el panel está apagado, préndelo.", sin_sesion: "no pude entrar al panel con la sesión de la conexión.", seco_sin_stub: "prueba a seco sin fiados de prueba." }[r.motivo] ?? `el panel no lo cobró (${r.motivo}).`;
      return { texto: `${base}\n\n⚠️ Todavía no se cobró el fiado: ${porque} Toca «Cobrar fiado» otra vez cuando esté listo.`, botones: botonesDe(id, st), toque: "Todavía no se cobró" };
    }
    if (r.estado === "dudoso") {
      anotarEvento({ tipo: "error", motivo: `fiado_${r.motivo}`.slice(0, 40), h: String(st.h).slice(0, 8) });
      return cerrar(`${base}\n\n⚠️ El panel no respondió bien (${r.motivo}): NO SÉ si se cobró. Revisa en el panel el fiado de ${f.nombre} y la caja; si no se cobró, cóbralo ahí con Yape. Este botón ya no cobra, para no cobrar dos veces.`, "No sé si se cobró: revisa el panel");
    }
    if (conOpciones(st)?.includes(f.negocio)) recordar(st.aviso.pagador, f.negocio);
    st.negocio = f.negocio;
    st.fiadoHecho = { nombre: f.nombre, negocio: f.negocio, cobradoCentimos: r.cobradoCentimos, quedaCentimos: r.quedaCentimos, saldoVistoCentimos: f.saldoCentimos, sinCaja: r.sinCaja };
    st.motivos = st.motivos.filter((x) => !["fiado", "elegir", "dos"].includes(x));
    if (r.restoCentimos > 0) {
      st.restoCentimos = r.restoCentimos;
      guardarBoton(id, st);
      return { texto: textoPendiente(st), botones: botonesDe(id, st), toque: `Cobrado ${soles(r.cobradoCentimos)}; sobran ${soles(r.restoCentimos)}` };
    }
    return cerrar(textoPendiente(st), "Fiado cobrado");
  } finally { rmSync(toma, { force: true }); }
}

/** UN mensaje marcado «PRUEBA Yape (no es plata real)»: sus botones nunca llaman al panel. */
async function prueba() {
  const ms = Date.now();
  const aj = leerAjustes();
  const opciones = Object.values(aj.equipos ?? {}).find((l) => l.length > 1) ?? null;
  const st = {
    v: 1, negocio: opciones ? null : aj.negocio, ...(opciones ? { opciones, recordado: null } : {}), h: sha(`prueba|${ms}`), aviso: { montoCentimos: 100, pagador: "PERSONA DE PRUEBA" }, llave: sha(`prueba|${ms}`),
    titulo: "PRUEBA Yape (no es plata real)", texto: "PERSONA DE PRUEBA te envió un pago por S/ 1.00", recibidoEn: new Date(ms).toISOString(),
    motivos: opciones ? ["elegir", "aprender"] : ["aprender"], estado: "pendiente", creado: ms, prueba: true,
  };
  const id = idNuevo();
  guardarBoton(id, st);
  const msj = SECO ? null : await telegram(textoPendiente(st), botonesDe(id, st));
  return { ok: true, id, mensaje: msj?.message_id ?? null, seco: SECO };
}

// ── apagar el modo aprender solo (timer yape-aprender, diario 08:10) ────────────────────────────────────────────────
const diaLima = (ms) => new Date(ms + LIMA_MS).toISOString().slice(0, 10);
const inicioDiaLima = (dia) => Date.parse(`${dia}T00:00:00Z`) - LIMA_MS;
const leerJson = (ruta) => { try { const j = JSON.parse(readFileSync(ruta, "utf8")); return j && typeof j === "object" && !Array.isArray(j) ? j : null; } catch { return null; } };
const NOMBRE_ERROR = { no_leido: "aviso que no pude leer", ilegible: "aviso dañado", cambio_negocio: "elegiste otro negocio que el recordado" };

/**
 * ≥7 días desde aprenderDesde, ≥5 Yape y 0 errores en ese tramo → aprender:false + Telegram. Error en el tramo, o 7 días con
 * menos de 5 Yape → aprenderDesde = hoy (vuelve a contar desde ahora) y 1 línea a Telegram (máx. 1 por semana). Antes de los 7
 * días sin errores: nada. A seco: solo dice qué haría. El aviso va ANTES de apagar: si Telegram falla, sigue aprendiendo.
 */
export async function revisarAprender(ahora = Date.now()) {
  const crudo = leerJson(AJUSTES);
  if (!crudo) return { ok: false, error: "ajustes de Yape rotos o ausentes" };
  if (crudo.aprender === false) return { ok: true, accion: "ya_apagado" };
  const hoy = diaLima(ahora);
  const escribirAjustes = (cambios) => escribirPrivado(AJUSTES, `${JSON.stringify({ ...leerJson(AJUSTES), ...cambios })}\n`);
  const desde = typeof crudo.aprenderDesde === "string" && RE_DIA.test(crudo.aprenderDesde) ? crudo.aprenderDesde : null;
  // Prendido de nuevo a mano tras un apagado: la cuenta arranca HOY (con la fecha vieja se volvía a apagar al día siguiente).
  const apagado = typeof crudo.aprenderApagado === "string" && RE_DIA.test(crudo.aprenderApagado) ? crudo.aprenderApagado : null;
  if (!desde || (apagado && desde <= apagado)) {
    if (!SECO) escribirAjustes({ aprenderDesde: hoy, aprenderApagado: undefined });
    return { ok: true, accion: "empieza", desde: hoy, seco: SECO };
  }
  const est = leerJson(ESTADO_APRENDER) ?? {};
  // «corte» = hora exacta del último reinicio: un error de esta mañana no vuelve a contar mañana.
  const inicio = Math.max(inicioDiaLima(desde), est.desde === desde ? Number(est.corte) || 0 : 0);
  const dias = Math.floor((inicioDiaLima(hoy) - inicioDiaLima(desde)) / DIA_MS);
  const lineas = lineasDe(REGISTRO);
  const evs = lineas.flatMap((l) => { try { const e = JSON.parse(l); return Number.isFinite(e?.t) ? [e] : []; } catch { return []; } });
  const tramo = evs.filter((e) => e.t >= inicio && e.t <= ahora);
  const yapes = new Set(tramo.filter((e) => e.tipo === "yape").map((e) => String(e.h))).size;
  const errores = tramo.filter((e) => e.tipo === "error");
  const res = { ok: true, desde, dias, yapes, errores: errores.length, seco: SECO };
  if (!SECO) {
    // Ley 29733, lo mínimo: el registro guarda solo 60 días.
    const viejas = evs.filter((e) => ahora - e.t > REGISTRO_DIAS * DIA_MS).length;
    if (viejas) escribirPrivado(REGISTRO, evs.filter((e) => ahora - e.t <= REGISTRO_DIAS * DIA_MS).map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
  if (!errores.length && dias < SEMANA_DIAS) return { ...res, accion: "esperando" };
  if (!errores.length && yapes >= MIN_YAPES) {
    // Con 2+ negocios en un equipo, ese equipo SIEMPRE pregunta (ver decidir): el aviso lo dice para no prometer lo que no hace.
    const aj = leerAjustes();
    const dos = aj.equipos ? Object.values(aj.equipos).find((l) => l.length > 1) : null;
    const mensaje = `✅ Apagué el modo aprender: ${dias} días, ${yapes} Yape, 0 errores.`
      + (dos ? ` Los Yape del celular que cobra para ${listaNegocios(dos)} te siguen preguntando de cuál es (1 toque), para no contar dos veces una venta.` : " Desde ahora los Yape entran solos 10 min después.");
    if (SECO) return { ...res, accion: "apagaria", mensaje };
    await telegram(mensaje);
    escribirAjustes({ aprender: false, aprenderApagado: hoy, aprenderDesde: undefined });
    return { ...res, accion: "apagado" };
  }
  const tipos = [...new Set(errores.map((e) => NOMBRE_ERROR[e.motivo] ?? `respuesta del panel «${String(e.motivo).replace(/^panel_/, "")}»`))];
  const motivo = errores.length ? `${errores.length === 1 ? "hubo 1 error" : `hubo ${errores.length} errores`} (${tipos.slice(0, 3).join(", ")})` : `en ${dias} días llegaron ${yapes} Yape y necesito ${MIN_YAPES}`;
  const mensaje = `⏳ Sigo en modo aprender: ${motivo}. Vuelvo a contar 7 días desde hoy.`;
  const avisar = ahora - (Number(est.ultimoAviso) || 0) >= SEMANA_DIAS * DIA_MS;
  if (SECO) return { ...res, accion: "reiniciaria", motivo, avisaria: avisar, mensaje };
  escribirAjustes({ aprenderDesde: hoy });
  let avisado = false;
  if (avisar) {
    avisado = await telegram(mensaje).then(() => true, (err) => { console.error("[yape-caja] aviso de modo aprender a Telegram falló", String(err?.message ?? err)); return false; });
  }
  escribirPrivado(ESTADO_APRENDER, JSON.stringify({ desde: hoy, corte: ahora, ultimoAviso: avisado ? ahora : Number(est.ultimoAviso) || 0 }));
  return { ...res, accion: "reiniciado", motivo, avisado };
}

/** Solo para los tests (__tests__/yape-caja-botones.test.ts). */
export const _paraPruebas = { BOTONES, LLAVES, REGISTRO, MEMORIA, MEMORIA_SECO, guardarBoton, leerBoton, botonesDe, textoPendiente, idNuevo };

async function cli(argv) {
  const [orden, ...resto] = argv;
  if (orden === "procesar" && resto[0]) return procesar(resto[0]);
  if (orden === "boton" && resto[0]) {
    const { values } = parseArgs({ args: resto.slice(1), options: { quien: { type: "string" } }, strict: false });
    return boton(resto[0], String(values.quien ?? "?"));
  }
  if (orden === "prueba-telegram") return prueba();
  if (orden === "revisar-aprender") return revisarAprender();
  return { ok: false, error: "Uso: yape-caja.mjs procesar <archivo> | boton <yp:…> --quien=<…> | prueba-telegram | revisar-aprender" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).then(
    (r) => { console.log(JSON.stringify({ cuando: new Date().toISOString(), ...r })); process.exit(0); },
    (e) => { console.log(JSON.stringify({ cuando: new Date().toISOString(), ok: false, error: String(e?.message ?? e).slice(0, 300) })); process.exit(1); },
  );
}
