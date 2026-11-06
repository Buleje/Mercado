#!/usr/bin/env node
// Pendientes del panel → Telegram con botones (06-11-2026, carril D). Brandon: «cada ingreso por validar, cuadre pendiente o
// fiado vencido me llega por Telegram con Aprobar · Ver · Después; yo toco y tú ejecutas».
//   listar --negocio=<blas|qa-forestal|main> [--json]   SOLO LECTURA: lo que espera en el panel y qué acción lo cierra.
//   enviar --negocio=… [--seco] [--prender] [--prueba]  UN mensaje con hasta 5 pendientes nuevos (no repite lo mandado hoy
//                                                        ni lo dejado «Después» hasta mañana). Botones pend:<id><n>:ok|ver|luego.
//   boton <pend:…> --quien=<…>                          lo llama buzon-telegram al tocar; imprime {texto, botones, toque}.
// «✅ Aprobar» solo si hay UNA acción segura: validar un ingreso, darlo por recibido hoy en el patio, cuadrarlo con la suma
// de sus piezas. Plata (fiados, tratos, caja abierta) y trámites: solo Ver · Después (se cierran en el panel).
// Idempotencia: el mensaje tiene candado; antes de cada acción se relee el panel: si ya estaba hecho no se repite y si el
// número cambió desde el aviso no se hace. Nada se aprueba sin el toque de Brandon; nunca se borra nada del panel.
// Estado en ~/.local/state/pendientes/ (0700/0600): botones/<sha256(id)>.json firmado con HMAC(id) (el id solo vive en
// Telegram, como yape-caja), enviados/<día>.json y pospuestos.json con sha256 de cada pendiente (sin nombres; Ley 29733).
// PEND_SECO=1 o --seco: no llama al panel ni a Telegram; lee PEND_STUB (archivo o JSON {"ruta?query": datos}) o el ejemplo
// de abajo, y usa botones-seco/ y enviados-seco/. PEND_STUB siempre implica seco.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const CASA = process.env.PEND_CASA || homedir();
let SECO = process.env.PEND_SECO === "1" || Boolean(process.env.PEND_STUB);
const DIR = join(CASA, ".local/state/pendientes");
const carpeta = (n) => join(DIR, SECO ? `${n}-seco` : n);
const LIMA_MS = -5 * 3600_000, DIA_MS = 86_400_000; // Lima = UTC−5 todo el año
const MAX_MENSAJE = 5, MAX_RECEPCION = 4, DIAS_TRATO_SIN_VENCE = 30, DIAS_TRAMITE = 7;
const RE_BOTON = /^pend:([A-Z2-7]{24})([1-5]):(ok|ver|luego)$/; // ≤35 bytes (Telegram admite 64)
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const NEGOCIOS = { blas: { etiqueta: "Blas", forestal: true }, "qa-forestal": { etiqueta: "QA forestal", forestal: true }, main: { etiqueta: "Bodega", forestal: false } };
const R_ING = "/api/admin/forestal/wood-entries";
const MOTIVO_CUADRE = "Aprobado por Brandon desde Telegram: vale la suma de las piezas.";
const MUERTOS = new Set(["anulado", "rechazado"]);
const PRIORIDAD = { validar: 1, recepcionar: 2, cuadrar: 3, caja: 4, fiado: 5, trato: 6, tramite: 7, gtf_sin_numero: 8, gtf_sin_ingresar: 9 };
const HARIA = []; // a seco: lo que se habría mandado al panel

// ── formato ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const log = (...a) => console.error("[pendientes]", ...a);
const num = (v) => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const r3 = (v) => { const n = num(v); return n === null ? null : Math.round(n * 1000) / 1000; };
const r2 = (v) => { const n = num(v); return n === null ? null : Math.round(n * 100) / 100; };
const miles = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const corto = (s, n = 60) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
export const soles = (v, moneda) => {
  const n = num(v) ?? 0, c = Math.round(Math.abs(n) * 100);
  return `${n < 0 ? "−" : ""}${moneda === "USD" ? "US$" : "S/"} ${miles(String(Math.floor(c / 100)))}.${String(c % 100).padStart(2, "0")}`;
};
export const m3 = (v) => { const n = r3(v); if (n === null) return "? m³"; const [e, d] = Math.abs(n).toFixed(3).split("."); return `${n < 0 ? "−" : ""}${miles(e)}.${d} m³`; };
const diaLima = (ms) => new Date(ms + LIMA_MS).toISOString().slice(0, 10);
const inicioDiaLima = (ms) => Date.parse(`${diaLima(ms)}T00:00:00Z`) - LIMA_MS;
/** Campos que son una FECHA (vence, guía, límite): la parte AAAA-MM-DD tal cual, sin pasarla a hora de Lima. */
const diaDe = (v) => (v ? String(v).slice(0, 10) : null);
const fecha = (v) => { const d = diaDe(v); return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "?"; };
const horaLima = (v) => new Date(v).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const diasHasta = (v, ahora) => Math.round((Date.parse(`${diaDe(v)}T00:00:00Z`) - Date.parse(`${diaLima(ahora)}T00:00:00Z`)) / DIA_MS);
const vencePalabra = (v, ahora) => {
  const d = diasHasta(v, ahora);
  return d < 0 ? `venció hace ${-d} día${d === -1 ? "" : "s"} (${fecha(v)})` : d === 0 ? "vence HOY" : d === 1 ? `vence mañana (${fecha(v)})` : `vence en ${d} días (${fecha(v)})`;
};
const filas = (d, ...llaves) => {
  if (Array.isArray(d)) return d;
  for (const k of [...llaves, "items", "data"]) if (Array.isArray(d?.[k])) return d[k];
  return [];
};
const guiaDe = (e) => `${e?.gtfSeries ? `${e.gtfSeries}-` : ""}${e?.gtfNumber || "sin número"}`;
const ingresoDe = (d) => d?.entry ?? d?.woodEntry ?? d?.ingreso ?? d;
const nombreIngreso = (a, e) => `el ingreso ${e?.libroNro ?? a.libroNro ? `#${e?.libroNro ?? a.libroNro}` : `de la guía ${a.guia ?? guiaDe(e)}`} (${m3(a.m3 ?? a.guiaM3 ?? e?.volumeM3)} ${a.especie ?? corto(e?.speciesCommonName, 30)})`.replace(/ \)$/, ")");

// ── archivos privados (como yape-caja) ───────────────────────────────────────────────────────────────────────────────
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
const leerJson = (ruta, def) => { try { return JSON.parse(readFileSync(ruta, "utf8")); } catch { return def; } };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
/** Un toque a la vez por mensaje (O_EXCL). Espera hasta 25 s; un candado de más de 2 min es de un proceso muerto. */
async function conCandado(ruta, fn) {
  const limite = Date.now() + 25_000;
  for (;;) {
    if (crearExclusivo(ruta, String(process.pid))) break;
    let muerto = false;
    try { muerto = Date.now() - statSync(ruta).mtimeMs > 120_000; } catch { continue; /* lo soltó recién */ }
    if (muerto) { rmSync(ruta, { force: true }); continue; }
    if (Date.now() > limite) return null;
    await dormir(100);
  }
  try { return await fn(); } finally { rmSync(ruta, { force: true }); }
}

// ── botones firmados (patrón pnl:/yp:) ───────────────────────────────────────────────────────────────────────────────
const idNuevo = () => Array.from(randomBytes(24), (b) => B32[b & 31]).join("");
const canon = (v) => Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`
  : JSON.stringify(v ?? null);
const firmar = (id, st) => createHmac("sha256", id).update(canon({ ...st, firma: undefined })).digest("hex");
const rutaBoton = (id) => join(carpeta("botones"), `${sha(id)}.json`);
function guardarBoton(id, st) { st.firma = firmar(id, st); escribirPrivado(rutaBoton(id), JSON.stringify(st)); }
function leerBoton(id) {
  const st = leerJson(rutaBoton(id), null);
  if (!st) return null;
  const a = Buffer.from(String(st.firma ?? ""), "hex"), b = Buffer.from(firmar(id, st), "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? st : null;
}
const llaveDe = (negocio, clave) => sha(`${negocio}|${clave}`);
const rutaPospuestos = () => join(DIR, SECO ? "pospuestos-seco.json" : "pospuestos.json");
function posponer(negocio, clave, ahora) {
  const p = Object.fromEntries(Object.entries(leerJson(rutaPospuestos(), {})).filter(([, hasta]) => Number(hasta) > ahora));
  p[llaveDe(negocio, clave)] = inicioDiaLima(ahora) + DIA_MS; // hasta la medianoche de Lima: sale en el aviso de mañana
  escribirPrivado(rutaPospuestos(), JSON.stringify(p));
}

// ── panel (real, o stub a seco) ──────────────────────────────────────────────────────────────────────────────────────
const claveStub = (ruta, query) => { const q = new URLSearchParams(Object.entries(query ?? {}).sort(([a], [b]) => a.localeCompare(b))).toString(); return q ? `${ruta}?${q}` : ruta; };
function panelStub(ahora) {
  const f = process.env.PEND_STUB;
  const datos = f ? JSON.parse(f.trim().startsWith("{") ? f : readFileSync(f, "utf8")) : ejemplo(ahora);
  return {
    get: async (ruta, query) => {
      const k = claveStub(ruta, query), d = k in datos ? datos[k] : datos[ruta];
      return d === undefined ? { ok: false, status: 404, error: { codigo: "stub_sin_dato", mensaje: k } } : { ok: true, status: 200, datos: d };
    },
    patch: async (ruta, cuerpo) => { HARIA.push({ metodo: "PATCH", ruta, cuerpo }); log(`(a seco) haría PATCH ${ruta} ${JSON.stringify(cuerpo)}`); return { ok: true, status: 200, datos: { seco: true } }; },
  };
}
const _paneles = new Map();
async function panel(negocio, ahora = Date.now()) {
  if (SECO) return panelStub(ahora);
  if (_paneles.has(negocio)) return _paneles.get(negocio);
  const [{ crearCliente }, { leerCredenciales }, { CARPETA_SESIONES, negocioDeConfig }, { anotar }] = await Promise.all([
    import("./src/cliente.mjs"), import("./src/credenciales.mjs"), import("./archivar-telegram.mjs"), import("./src/registro.mjs"),
  ]);
  const config = leerCredenciales();
  const nombre = negocioDeConfig(config, negocio);
  if (!nombre) throw new Error(`el negocio «${negocio}» no está en la conexión del panel`);
  const cliente = crearCliente({ config, carpetaSesiones: CARPETA_SESIONES });
  const p = {
    // sinRecorte: la lista entera para filtrar aquí (es lectura; no vuelve a ningún modelo).
    get: (ruta, query) => cliente.pedir(nombre, { metodo: "GET", ruta, ...(query ? { query } : {}), sinRecorte: true }),
    patch: async (ruta, cuerpo, quien) => {
      const t0 = Date.now();
      const r = await cliente.pedir(nombre, { metodo: "PATCH", ruta, cuerpo });
      await Promise.resolve()
        .then(() => anotar({ herramienta: "pendientes_telegram", tipo: "confirmar", negocio: nombre, por: "telegram", quien: corto(quien, 80), origen: "pendientes-telegram", metodo: "PATCH", ruta, cuando: new Date().toISOString(), confirmado: true, status: r.status, ms: Date.now() - t0, error: r.ok ? undefined : r.error?.codigo }))
        .then(undefined, (e) => log("registro de la conexión falló", String(e)));
      return r;
    },
  };
  _paneles.set(negocio, p);
  return p;
}
async function leerGet(p, ruta, query) {
  const r = await p.get(ruta, query);
  if (r.ok) return r.datos;
  const e = new Error(`${r.error?.codigo ?? `http_${r.status}`}${r.error?.mensaje ? `: ${corto(r.error.mensaje, 120)}` : ""}`);
  /** @type {any} */ (e).codigo = r.error?.codigo ?? `http_${r.status}`;
  throw e;
}
const esApagado = (cod) => /apagado|compilando|sin_conexion|ECONNREFUSED/i.test(String(cod ?? ""));

// ── fuentes de pendientes ────────────────────────────────────────────────────────────────────────────────────────────
function detalleIngreso(e) {
  return [
    `${e.docType ?? "GTF"} ${guiaDe(e)}${e.gtfDate ? ` del ${fecha(e.gtfDate)}` : ""}${e.libroNro ? ` · libro #${e.libroNro}` : ""}`,
    `Proveedor: ${corto(e.providerName, 50) || "?"}`,
    `${corto(e.speciesCommonName, 30) || "?"}${e.productType ? ` (${corto(e.productType, 20).toLowerCase()})` : ""} · ${m3(e.volumeM3)} · ${num(e.pieces) ?? "?"} piezas en la guía`,
    num(e.trozasCount) ? `Piezas cargadas: ${e.trozasCount}, suman ${m3(e.trozasM3)}` : "Piezas cargadas: ninguna todavía",
    `Estado: ${e.status ?? "?"} · ${e.fechaRecepcion ? `recibida el ${fecha(e.fechaRecepcion)}` : "sin recibir en el patio"}`,
    ...(num(e.costoTotal) ? [`Costo: ${soles(e.costoTotal, e.moneda)}`] : []),
  ].slice(0, 6);
}
const queIngreso = (e) => `${e.libroNro ? `#${e.libroNro} · ` : ""}guía ${guiaDe(e)} · ${m3(e.volumeM3)} ${corto(e.speciesCommonName, 30)}`.trim();

const F_VALIDAR = { fuente: "ingresos por validar", ruta: `GET ${R_ING}?status=pendiente`, leer: async (p) =>
  filas(await leerGet(p, R_ING, { status: "pendiente", limit: "50" }), "entries").filter((e) => e?.id && e.status === "pendiente").map((e) => ({
    id: e.id, tipo: "validar", icono: "🪵", clave: `val:${e.id}`, titulo: `Ingreso por validar: ${queIngreso(e)}`, m3: r3(e.volumeM3),
    cierra: "validarlo (entra al libro y al saldo de madera)",
    accion: { tipo: "validar", id: e.id, m3: r3(e.volumeM3), especie: corto(e.speciesCommonName, 30), libroNro: e.libroNro ?? null, guia: guiaDe(e) },
    detalle: detalleIngreso(e),
  })) };

const F_RECIBIR = { fuente: "guías sin recibir en el patio", ruta: `GET ${R_ING}?sinRecibir=1`, leer: async (p) => {
  const s = (await leerGet(p, R_ING, { sinRecibir: "1" }))?.sinRecibir ?? {};
  return filas(s.detalle).filter((g) => g?.gtf).map((g) => {
    const etiqueta = `${g.serie ? `${g.serie}-` : ""}${g.gtf}`;
    return {
      id: etiqueta, tipo: "recepcionar", icono: "🚚", clave: `rec:${g.serie ?? ""}|${g.gtf}|${r3(g.m3)}`, m3: r3(g.m3),
      titulo: `Guía ${etiqueta} sin recibir en el patio · ${m3(g.m3)} · ${num(g.trozas) ?? "?"} piezas${g.fecha ? ` · guía del ${fecha(g.fecha)}` : ""}`,
      cierra: "darla por recibida HOY en el patio",
      accion: { tipo: "recepcionar", gtf: String(g.gtf), serie: g.serie ? String(g.serie) : null, m3: r3(g.m3) },
      detalle: [`Guía ${etiqueta}${g.fecha ? ` del ${fecha(g.fecha)}` : ""}`, `Madera: ${m3(g.m3)} · ${num(g.trozas) ?? "?"} piezas`, "Aprobar = la doy por recibida hoy; si llegó otro día, recíbela en el panel con su fecha.", ...(num(s.enMesCerrado) ? [`Ojo: ${s.enMesCerrado} guía(s) sin recibir son de un mes ya cerrado.`] : [])],
    };
  });
} };

/** Últimos 100 ingresos: los que no cuadran con sus piezas y las GTF sin número (una sola lectura para las dos). */
const F_CUADRE = { fuente: "ingresos que no cuadran / GTF sin número", ruta: `GET ${R_ING}?limit=100`, leer: async (p) => {
  const vivos = filas(await leerGet(p, R_ING, { limit: "100" }), "entries").filter((e) => e?.id && !MUERTOS.has(e.status));
  const out = [];
  for (const e of vivos) {
    const vol = r3(e.volumeM3), suma = r3(e.trozasM3), n = num(e.trozasCount) ?? 0;
    // Tolerancia en la unidad del papel: m³ con 3 decimales. «Sin piezas cargadas» (null) no es descuadre.
    if (n > 0 && suma !== null && vol !== null && Math.abs(suma - vol) >= 0.001) {
      out.push({
        id: e.id, tipo: "cuadrar", icono: "⚖️", clave: `cua:${e.id}:${vol}:${suma}`, m3: vol,
        titulo: `No cuadra el ingreso ${queIngreso(e)}: la guía dice ${m3(vol)} y sus ${n} piezas suman ${m3(suma)}`,
        cierra: `cuadrarlo con la suma de las piezas (${m3(suma)})`,
        accion: { tipo: "cuadrar", id: e.id, guiaM3: vol, piezasM3: suma, piezas: n, especie: corto(e.speciesCommonName, 30), libroNro: e.libroNro ?? null, guia: guiaDe(e) },
        detalle: [...detalleIngreso(e).slice(0, 5), `Aprobar = vale la suma de las piezas (${m3(suma)}); si la guía está bien, corrige la pieza en el panel.`],
      });
    }
    if (String(e.docType ?? "GTF").toUpperCase() === "GTF" && !e.gtfNumber) {
      out.push({ id: e.id, tipo: "gtf_sin_numero", icono: "📄", clave: `sn:${e.id}`, m3: vol, titulo: `Ingreso${e.entryDate ? ` del ${fecha(e.entryDate)}` : ""} sin número de GTF · ${m3(vol)} ${corto(e.speciesCommonName, 30)}`, cierra: "poner el número de la guía en el ingreso (panel)", detalle: detalleIngreso(e) });
    }
  }
  return out;
} };

const F_GTF = { fuente: "GTF sin ingresar al libro", ruta: "GET /api/admin/forestal/gtf?sinIngresar=1", leer: async (p) =>
  filas(await leerGet(p, "/api/admin/forestal/gtf", { sinIngresar: "1" }), "gtfs").map((g) => {
    const n = corto(g.gtfNumber ?? g.numero ?? g.id, 40), t = corto(g.titularName ?? g.titular, 40);
    return { id: g.id ?? n, tipo: "gtf_sin_ingresar", icono: "📄", clave: `gsi:${g.id ?? n}`, titulo: `GTF ${n} sin ingresar al libro${g.gtfDate ?? g.fecha ? ` · del ${fecha(g.gtfDate ?? g.fecha)}` : ""}${t ? ` · ${t}` : ""}`, cierra: "registrar el ingreso de esa guía en el libro (panel)", detalle: [`GTF ${n}`, ...(t ? [`Titular: ${t}`] : []), ...(g.destino ? [`Destino: ${corto(g.destino, 50)}`] : []), ...(g.status ?? g.estado ? [`Estado: ${g.status ?? g.estado}`] : [])] };
  }) };

const TIPO_DEUDA = { madera: "por madera", fiado: "de fiado", prestamo: "de préstamo", adelanto: "de adelanto" };
const F_TRATOS = { fuente: "tratos sin cobrar", ruta: "GET /api/admin/por-cobrar?detalle=1", leer: async (p, ahora) =>
  filas(await leerGet(p, "/api/admin/por-cobrar", { detalle: "1" }), "items").filter((it) => {
    if (!it?.id || !(num(it.monto) > 0)) return false;
    if (it.vence) return diasHasta(it.vence, ahora) < 0;
    return it.tipo === "madera" && it.desde && diasHasta(it.desde, ahora) <= -DIAS_TRATO_SIN_VENCE;
  }).map((it) => ({
    id: it.id, tipo: "trato", icono: "💵", clave: `cob:${it.id}:${r2(it.monto)}`, soles: r2(it.monto), moneda: it.moneda ?? "PEN",
    titulo: `${corto(it.quien, 40) || "Alguien"} debe ${soles(it.monto, it.moneda)} ${TIPO_DEUDA[it.tipo] ?? ""}${it.vence ? ` · venció el ${fecha(it.vence)}` : ` · desde el ${fecha(it.desde)}`}`.replace(/  +/g, " "),
    cierra: "cobrarlo y anotarlo en el panel (es plata: no lo apruebo desde aquí)",
    detalle: [`${corto(it.quien, 40)} · ${TIPO_DEUDA[it.tipo] ?? it.tipo ?? ""}`, `Monto: ${soles(it.monto, it.moneda)}`, `Desde: ${fecha(it.desde)}${it.vence ? ` · vence: ${fecha(it.vence)}` : " · sin fecha de vencimiento"}`, ...(it.nota ? [`Nota: ${corto(it.nota, 80)}`] : [])],
  })) };

const F_FIADOS = { fuente: "fiados vencidos", ruta: "GET /api/fiados?status=VENCIDO + ACTIVO con fecha pasada", leer: async (p, ahora) => {
  const vistos = new Map();
  for (const status of ["VENCIDO", "ACTIVO"]) {
    for (const f of filas(await leerGet(p, "/api/fiados", { status }), "fiados")) {
      const vence = f?.dueDate ?? f?.fechaVence, saldo = num(f?.saldo ?? f?.balance);
      if (!f?.id || !(saldo > 0) || (status === "ACTIVO" && !(vence && diasHasta(vence, ahora) < 0))) continue;
      vistos.set(f.id, { f, vence, saldo });
    }
  }
  return [...vistos.values()].map(({ f, vence, saldo }) => ({
    id: f.id, tipo: "fiado", icono: "💵", clave: `fia:${f.id}:${r2(saldo)}`, soles: r2(saldo),
    titulo: `Fiado de ${corto(f.customerName, 40) || "un cliente"} ${vence ? `vencido el ${fecha(vence)}` : "vencido"} · debe ${soles(saldo)}`,
    cierra: "cobrarlo en la caja (es plata: no lo apruebo desde aquí)",
    detalle: [`Cliente: ${corto(f.customerName, 40)}`, `Debe: ${soles(saldo)} de ${soles(f.total)}`, `Venció: ${fecha(vence)}`, `Cuotas: ${filas(f.cuotas).length}`],
  }));
} };

const F_CAJA = { fuente: "caja abierta de días pasados", ruta: "GET /api/cash-registers", leer: async (p, ahora) =>
  filas(await leerGet(p, "/api/cash-registers"), "cajas", "cashRegisters").filter((c) => c?.id && /^(abierta|open)$/i.test(String(c.status ?? "")) && Date.parse(c.openedAt) < inicioDiaLima(ahora)).map((c) => ({
    id: c.id, tipo: "caja", icono: "🧾", clave: `caja:${c.id}`, soles: r2(c.openingAmount),
    titulo: `Caja${c.name ? ` «${corto(c.name, 30)}»` : ""} abierta desde el ${horaLima(c.openedAt)} y sin cerrar`,
    cierra: "cerrarla en el panel con el conteo del efectivo (es plata: no la cierro desde aquí)",
    detalle: [`Abierta: ${horaLima(c.openedAt)}`, `Monto inicial: ${soles(c.openingAmount)}`, `Movimientos: ${filas(c.movements).length}`, ...(num(c.expectedAmount) ? [`Esperado ahora: ${soles(c.expectedAmount)}`] : [])],
  })) };

const ABIERTOS_FORESTAL = new Set(["borrador", "presentado", "observado"]);
const F_TRAMITES_FOR = { fuente: "trámites ARFFS/SERFOR/OSINFOR", ruta: "GET /api/admin/forestal/tramites", leer: async (p, ahora) =>
  filas(await leerGet(p, "/api/admin/forestal/tramites"), "tramites").filter((t) => t?.id && ABIERTOS_FORESTAL.has(t.estado) && t.fechaLimite && diasHasta(t.fechaLimite, ahora) <= DIAS_TRAMITE).map((t) => ({
    id: t.id, tipo: "tramite", icono: "📑", clave: `tra:${t.id}:${diaDe(t.fechaLimite)}`,
    titulo: `Trámite «${corto(t.asunto, 60)}»${t.autoridad ? ` ante ${corto(t.autoridad, 30)}` : ""} ${vencePalabra(t.fechaLimite, ahora)}`,
    cierra: "presentarlo o anotar la respuesta en el panel",
    detalle: [`Asunto: ${corto(t.asunto, 80)}`, `Autoridad: ${corto(t.autoridad, 40) || "?"} · estado ${t.estado}`, `Límite: ${fecha(t.fechaLimite)}`, ...(t.expedienteAutoridad ? [`Expediente: ${corto(t.expedienteAutoridad, 40)}`] : []), ...(t.fechaPresentacion ? [`Presentado: ${fecha(t.fechaPresentacion)}`] : [])],
  })) };

const CERRADOS_ADMIN = /^(terminado|cerrado|archivado|cancelado|resuelto|desistido|completado|hecho)$/i;
const F_TRAMITES_ADM = { fuente: "trámites de Administración", ruta: "GET /api/admin/tramites?vencen=7", leer: async (p, ahora) =>
  filas(await leerGet(p, "/api/admin/tramites", { vencen: String(DIAS_TRAMITE) }), "tramites").filter((t) => t?.id && t.venceEl && !CERRADOS_ADMIN.test(String(t.estado ?? "")) && diasHasta(t.venceEl, ahora) <= DIAS_TRAMITE).map((t) => ({
    id: t.id, tipo: "tramite", icono: "📑", clave: `tad:${t.id}:${diaDe(t.venceEl)}`,
    titulo: `Trámite «${corto(t.asunto, 60)}»${t.entidadNombre ?? t.entidad ? ` (${corto(t.entidadNombre ?? t.entidad, 30)})` : ""} ${vencePalabra(t.venceEl, ahora)}`,
    cierra: "avanzarlo en el panel (Administración › Trámites)",
    detalle: [`Asunto: ${corto(t.asunto, 80)}`, `Estado: ${t.estado ?? "?"} · vence ${fecha(t.venceEl)}`, ...(t.proximoPaso ? [`Próximo paso: ${corto(t.proximoPaso, 80)}`] : []), ...(t?.conteo?.falta ? [`Faltan ${t.conteo.falta} requisito(s)`] : [])],
  })) };

const FUENTES = { forestal: [F_VALIDAR, F_RECIBIR, F_CUADRE, F_GTF, F_TRATOS, F_CAJA, F_TRAMITES_FOR, F_TRAMITES_ADM], bodega: [F_FIADOS, F_CAJA, F_TRAMITES_ADM] };

export async function listar(negocio, ahora = Date.now()) {
  const def = NEGOCIOS[negocio];
  if (!def) throw new Error(`negocio «${negocio}» no válido (blas, qa-forestal o main)`);
  const p = await panel(negocio, ahora);
  const items = [], fuentes = [];
  // En fila (no en paralelo): la primera lectura abre la sesión y las demás la reusan.
  for (const f of def.forestal ? FUENTES.forestal : FUENTES.bodega) {
    try {
      const xs = await f.leer(p, ahora);
      items.push(...xs);
      fuentes.push({ fuente: f.fuente, ruta: f.ruta, ok: true, n: xs.length });
    } catch (e) {
      fuentes.push({ fuente: f.fuente, ruta: f.ruta, ok: false, error: String(/** @type {any} */ (e)?.message ?? e).slice(0, 160), codigo: /** @type {any} */ (e)?.codigo });
      if (esApagado(/** @type {any} */ (e)?.codigo)) break; // panel apagado: las demás darían lo mismo
    }
  }
  items.sort((a, b) => (PRIORIDAD[a.tipo] ?? 99) - (PRIORIDAD[b.tipo] ?? 99));
  const panelApagado = fuentes.length > 0 && fuentes.every((f) => !f.ok) && fuentes.some((f) => esApagado(f.codigo));
  return { negocio, etiqueta: def.etiqueta, items, fuentes, panelApagado };
}

// ── mensaje y botones ────────────────────────────────────────────────────────────────────────────────────────────────
function render(st) {
  const cab = `${st.prueba ? "🧪 PRUEBA (no toques nada en serio)\n" : ""}📋 Pendientes de ${NEGOCIOS[st.negocio]?.etiqueta ?? st.negocio} · ${horaLima(st.creado)}`;
  const cuerpo = st.items.map((it, i) => {
    const pie = it.estado === "abierto" ? `${it.aviso ? `${it.aviso}\n` : ""}${it.accion ? `✅ Aprobar = ${it.cierra}` : `Se cierra: ${it.cierra}`}` : it.final;
    const ver = it.ver && it.estado === "abierto" ? `\n${it.detalle.slice(0, 6).map((l) => `   · ${l}`).join("\n")}` : "";
    return `${i + 1}. ${it.icono} ${it.titulo}${ver}\n   ${pie.replace(/\n/g, "\n   ")}`;
  }).join("\n\n");
  const abiertos = st.items.some((it) => it.estado === "abierto");
  const mas = st.mas > 0 ? `\n\nHay ${st.mas} más: salen en el próximo aviso o en el panel.` : "";
  const ayuda = abiertos ? "\n\nToca ✅ y lo hago yo · 👁 para ver el detalle · ⏰ para que te lo recuerde mañana." : "\n\n✔️ Este aviso ya quedó resuelto.";
  return `${cab}\n\n${cuerpo}${mas}${ayuda}`.slice(0, 4000);
}
function botonesDe(id, st) {
  const filasB = st.items.map((it, i) => {
    if (it.estado !== "abierto") return null;
    const n = i + 1;
    return [...(it.accion ? [[`✅ Aprobar ${n}`, `pend:${id}${n}:ok`]] : []), [`👁 Ver ${n}`, `pend:${id}${n}:ver`], [`⏰ Después ${n}`, `pend:${id}${n}:luego`]];
  }).filter(Boolean);
  return filasB.length ? filasB : null;
}

// ── Telegram (mismas credenciales que yape-caja) ─────────────────────────────────────────────────────────────────────
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
  try { j = await r.json(); } catch { /* sin JSON: cae abajo */ }
  if (!j.ok) throw new Error(`Telegram respondió ${r.status}`); // sin la URL: lleva el token
  return j.result;
}

async function asegurarPanel() {
  const { estadoPanel, prenderPanel } = await import("./src/panel-local.mjs");
  if ((await estadoPanel()).saludable) return true;
  const r = await prenderPanel();
  if (!r.ok) { log("no pude prender el panel:", r.mensaje); return false; }
  for (let i = 0; i < 18; i++) { await dormir(10_000); if ((await estadoPanel()).saludable) return true; }
  return false;
}

export async function enviar(negocio, op = {}) {
  const ahora = Date.now();
  if (!SECO && op.prender && !(await asegurarPanel())) return { ok: false, motivo: "panel_apagado", mensaje: "No pude prender el panel: no mandé nada." };
  const l = await listar(negocio, ahora);
  const fuentes = l.fuentes.map((f) => `${f.ok ? "✓" : "✗"} ${f.fuente}${f.ok ? ` ${f.n}` : ` (${f.error})`}`);
  if (l.panelApagado) return { ok: false, motivo: "panel_apagado", mensaje: "El panel está apagado: no mandé nada (prende el panel o usa --prender).", fuentes };
  const rutaEnv = join(carpeta("enviados"), `${diaLima(ahora)}.json`);
  const enviados = leerJson(rutaEnv, {}), posp = leerJson(rutaPospuestos(), {});
  const nuevos = l.items.filter((it) => { const k = llaveDe(negocio, it.clave); return !enviados[k] && !(Number(posp[k]) > ahora); });
  if (!nuevos.length) return { ok: true, enviados: 0, total: l.items.length, mensaje: "Nada nuevo que avisar.", fuentes };
  const lote = nuevos.slice(0, MAX_MENSAJE), id = idNuevo();
  const st = { v: 1, negocio, creado: ahora, mas: nuevos.length - lote.length, prueba: Boolean(op.prueba), items: lote.map((it) => ({
    clave: it.clave, tipo: it.tipo, icono: it.icono, titulo: it.titulo, cierra: it.cierra, accion: it.accion, detalle: it.detalle ?? [], estado: "abierto",
  })) };
  guardarBoton(id, st);
  const texto = render(st), botones = botonesDe(id, st);
  const msj = SECO ? null : await telegram(texto, botones);
  for (const it of lote) enviados[llaveDe(negocio, it.clave)] = ahora;
  escribirPrivado(rutaEnv, JSON.stringify(enviados));
  if (msj?.message_id) { st.mensaje = msj.message_id; guardarBoton(id, st); }
  return { ok: true, enviados: lote.length, quedan: st.mas, total: l.items.length, fuentes, ...(SECO ? { seco: true, texto, botones } : { mensaje: msj?.message_id }) };
}

// ── acciones (solo con el toque) ─────────────────────────────────────────────────────────────────────────────────────
const fallo = (r, que) => esApagado(r?.error?.codigo)
  ? { cerrar: false, linea: "⚠️ El panel está apagado: tócalo de nuevo cuando esté prendido.", toque: "Panel apagado: no hice nada" }
  : { cerrar: false, linea: `⚠️ El panel no dejó ${que}: ${corto(r?.error?.mensaje ?? r?.error?.codigo ?? `error ${r?.status}`, 140)}`, toque: "El panel no lo hizo: mira el mensaje" };

async function validar(p, a, quien) {
  const r = await p.get(`${R_ING}/${a.id}`);
  if (!r.ok) return fallo(r, "leer el ingreso");
  const e = ingresoDe(r.datos), nombre = nombreIngreso(a, e);
  if (e?.status !== "pendiente") return { cerrar: true, linea: `ℹ️ ${nombre} ya estaba «${e?.status ?? "?"}»: no hice nada.`, toque: "Ya estaba hecho" };
  if (r3(e.volumeM3) !== a.m3) return { cerrar: false, linea: `⚠️ ${nombre} cambió: te avisé ${m3(a.m3)} y ahora dice ${m3(e.volumeM3)}. No lo validé; revísalo en el panel.`, toque: "Cambió: no lo validé" };
  const w = await p.patch(`${R_ING}/${a.id}`, { action: "validate" }, quien);
  if (!w.ok) return fallo(w, "validarlo");
  return { cerrar: true, linea: `✅ Validado ${nombre}.`, toque: "Validado" };
}

async function recepcionar(p, a, quien) {
  const etiqueta = `la guía ${a.serie ? `${a.serie}-` : ""}${a.gtf}`;
  const r = await p.get(R_ING, { gtf: a.gtf, limit: "20" });
  if (!r.ok) return fallo(r, `leer ${etiqueta}`);
  const todas = filas(r.datos, "entries").filter((e) => String(e?.gtfNumber ?? "") === a.gtf && (!a.serie || String(e?.gtfSeries ?? "") === a.serie) && !MUERTOS.has(e?.status));
  const faltan = todas.filter((e) => !e.fechaRecepcion);
  if (!todas.length) return { cerrar: false, linea: `⚠️ No encontré ${etiqueta} en el libro: revísala en el panel.`, toque: "No la encontré" };
  if (!faltan.length) return { cerrar: true, linea: `ℹ️ ${etiqueta} ya estaba recibida: no hice nada.`, toque: "Ya estaba hecho" };
  const suma = r3(faltan.reduce((s, e) => s + (num(e.volumeM3) ?? 0), 0));
  if (a.m3 !== null && Math.abs(suma - a.m3) >= 0.001) return { cerrar: false, linea: `⚠️ ${etiqueta} cambió: te avisé ${m3(a.m3)} y ahora falta recibir ${m3(suma)}. No la recibí; revísala en el panel.`, toque: "Cambió: no la recibí" };
  if (faltan.length > MAX_RECEPCION) return { cerrar: false, linea: `⚠️ ${etiqueta} tiene ${faltan.length} ingresos: recíbela en bloque en el panel.`, toque: "Son muchos: hazlo en el panel" };
  const malos = [];
  for (const e of faltan) { const w = await p.patch(`${R_ING}/${e.id}`, { action: "recepcionar" }, quien); if (!w.ok) malos.push(w); }
  if (!malos.length) return { cerrar: true, linea: `✅ Recibida hoy en el patio ${etiqueta} (${m3(suma)}${faltan.length > 1 ? `, ${faltan.length} ingresos` : ""}).`, toque: "Recibida" };
  const f = fallo(malos[0], "recibirla");
  return { cerrar: false, linea: faltan.length > malos.length ? `⚠️ Recibí ${faltan.length - malos.length} de ${faltan.length} ingresos de ${etiqueta}. ${f.linea.replace(/^⚠️ /, "")}` : f.linea, toque: f.toque };
}

async function cuadrar(p, a, quien) {
  const r = await p.get(`${R_ING}/${a.id}`);
  if (!r.ok) return fallo(r, "leer el ingreso");
  const e = ingresoDe(r.datos), nombre = nombreIngreso(a, e), vol = r3(e?.volumeM3);
  if (MUERTOS.has(e?.status)) return { cerrar: true, linea: `ℹ️ ${nombre} está «${e.status}»: no hice nada.`, toque: "Ya no aplica" };
  if (vol === a.piezasM3) return { cerrar: true, linea: `ℹ️ ${nombre} ya cuadraba con sus piezas (${m3(vol)}): no hice nada.`, toque: "Ya estaba hecho" };
  if (vol !== a.guiaM3) return { cerrar: false, linea: `⚠️ ${nombre} cambió: la guía decía ${m3(a.guiaM3)} y ahora ${m3(vol)}. No lo cuadré; revísalo en el panel.`, toque: "Cambió: no lo cuadré" };
  const w = await p.patch(`${R_ING}/${a.id}`, { action: "cuadrar", lado: "lista", motivo: MOTIVO_CUADRE }, quien);
  if (!w.ok) return fallo(w, "cuadrarlo");
  const nuevo = r3(ingresoDe(w.datos)?.volumeM3) ?? a.piezasM3;
  return { cerrar: true, linea: `✅ Cuadrado ${nombre.replace(m3(a.guiaM3), m3(nuevo))}: ahora vale la suma de sus ${a.piezas} piezas (antes ${m3(a.guiaM3)}).`, toque: "Cuadrado" };
}
const ACCIONES = { validar, recepcionar, cuadrar };

export async function boton(data, quien = "?") {
  const m = RE_BOTON.exec(String(data ?? ""));
  if (!m) return { toque: "Botón inválido" };
  const [, id, n, acc] = m;
  if (!existsSync(rutaBoton(id))) return { toque: "Ese botón venció o no es válido" };
  const r = await conCandado(`${rutaBoton(id)}.candado`, async () => {
    const st = leerBoton(id);
    if (!st) return { toque: "Ese botón venció o no es válido" };
    const it = st.items[Number(n) - 1];
    if (!it) return { toque: "Botón inválido" };
    if (it.estado !== "abierto") return { toque: it.estado === "pospuesto" ? "Ya lo dejaste para mañana" : "Ya estaba resuelto", texto: render(st), botones: botonesDe(id, st) };
    const ahora = Date.now();
    let toque;
    if (acc === "ver") { it.ver = true; toque = `Detalle del ${n} en el mensaje`; }
    else if (acc === "luego") {
      posponer(st.negocio, it.clave, ahora);
      Object.assign(it, { estado: "pospuesto", final: "⏰ Lo dejé para mañana.", cuando: ahora, quien: corto(quien, 80) });
      toque = "Te lo recuerdo mañana";
    } else {
      if (!it.accion || !ACCIONES[it.accion.tipo]) return { toque: "Este no se aprueba desde aquí: ciérralo en el panel" };
      const fin = await ACCIONES[it.accion.tipo](await panel(st.negocio, ahora), it.accion, quien);
      if (fin.cerrar) Object.assign(it, { estado: "resuelto", final: fin.linea, aviso: undefined, cuando: ahora, quien: corto(quien, 80) });
      else it.aviso = fin.linea;
      toque = fin.toque;
    }
    guardarBoton(id, st);
    return { texto: render(st), botones: botonesDe(id, st), toque };
  });
  return { ...(r ?? { toque: "Estoy con otro botón de este mensaje: tócalo de nuevo en un rato" }), ...(SECO && HARIA.length ? { seco: true, haria: HARIA } : {}) };
}

// ── ejemplo para --seco sin PEND_STUB (fechas relativas a hoy; nada real) ────────────────────────────────────────────
function ejemplo(ahora) {
  const dia = (d) => diaLima(ahora + d * DIA_MS), iso = (d) => `${dia(d)}T00:00:00.000Z`;
  const ing1 = { id: "ejemplo-ing-1", libroNro: null, docType: "GTF", gtfSeries: "001", gtfNumber: "0012345", gtfDate: dia(-2), providerName: "Proveedor de ejemplo", speciesCommonName: "Tornillo", productType: "ROLLO", volumeM3: 12.5, pieces: 18, trozasCount: 18, trozasM3: 12.5, status: "pendiente", fechaRecepcion: iso(-1), entryDate: iso(-1) };
  const ing2 = { id: "ejemplo-ing-2", libroNro: 87, docType: "GTF", gtfSeries: "001", gtfNumber: "0011111", gtfDate: dia(-9), providerName: "Proveedor de ejemplo", speciesCommonName: "Capirona", productType: "ROLLO", volumeM3: 10, pieces: 14, trozasCount: 14, trozasM3: 9.874, status: "validado", fechaRecepcion: iso(-8), entryDate: iso(-8) };
  const ing3 = { id: "ejemplo-ing-3", libroNro: 88, docType: "GTF", gtfSeries: null, gtfNumber: null, providerName: "Proveedor de ejemplo", speciesCommonName: "Cumala", volumeM3: 4.2, pieces: 6, trozasCount: 0, trozasM3: null, status: "validado", fechaRecepcion: iso(-3), entryDate: iso(-3) };
  const ing4 = { id: "ejemplo-ing-4", libroNro: 89, docType: "GTF", gtfSeries: "002", gtfNumber: "0045678", volumeM3: 8.214, pieces: 11, speciesCommonName: "Shihuahuaco", status: "validado", fechaRecepcion: null };
  return {
    [`${R_ING}?limit=50&status=pendiente`]: { entries: [ing1], total: 1 },
    [`${R_ING}?sinRecibir=1`]: { sinRecibir: { guias: 1, m3: 8.214, trozas: 11, enMesCerrado: 0, gtfs: ["002-0045678"], detalle: [{ gtf: "0045678", serie: "002", fecha: dia(-4), m3: 8.214, trozas: 11 }] } },
    [`${R_ING}?limit=100`]: { entries: [ing1, ing2, ing3, ing4], total: 4 },
    [`${R_ING}?gtf=0045678&limit=20`]: { entries: [ing4], total: 1 },
    [`${R_ING}/ejemplo-ing-1`]: ing1, [`${R_ING}/ejemplo-ing-2`]: ing2,
    "/api/admin/forestal/gtf?sinIngresar=1": { gtfs: [] },
    "/api/admin/por-cobrar?detalle=1": { items: [{ id: "ejemplo-cob-1", tipo: "madera", quien: "Cliente de ejemplo", monto: 1760.7, moneda: "PEN", desde: iso(-40), vence: iso(-10) }] },
    "/api/cash-registers": [{ id: "ejemplo-caja-1", name: "Caja principal", status: "abierta", openedAt: `${dia(-1)}T13:05:00.000Z`, openingAmount: 200, movements: [{}, {}, {}] }],
    "/api/admin/forestal/tramites": { tramites: [{ id: "ejemplo-tra-1", asunto: "Renovación de la licencia del CTP", autoridad: "ARFFS Ucayali", estado: "presentado", fechaLimite: iso(4) }] },
    "/api/admin/tramites?vencen=7": { tramites: [] },
    "/api/fiados?status=VENCIDO": [{ id: "ejemplo-fia-1", customerName: "Cliente 4455", total: 150, saldo: 150, status: "VENCIDO", dueDate: iso(-5), cuotas: [] }],
    "/api/fiados?status=ACTIVO": [],
  };
}

export const _paraPruebas = { render, botonesDe, guardarBoton, leerBoton, idNuevo, RE_BOTON, ejemplo };

async function cli(argv) {
  const [orden, ...resto] = argv;
  const { values, positionals } = parseArgs({ args: resto, allowPositionals: true, strict: false, options: {
    negocio: { type: "string" }, json: { type: "boolean" }, seco: { type: "boolean" }, prender: { type: "boolean" }, prueba: { type: "boolean" }, quien: { type: "string" },
  } });
  if (values.seco) SECO = true;
  const negocio = String(values.negocio ?? "");
  if (orden === "listar" && negocio) {
    const l = await listar(negocio);
    if (values.json) return { ok: !l.panelApagado, seco: SECO || undefined, negocio, total: l.items.length, panelApagado: l.panelApagado || undefined,
      items: l.items.map((it) => ({ id: it.id, tipo: it.tipo, titulo: it.titulo, ...(it.soles !== undefined ? { soles: it.soles } : {}), ...(it.m3 !== undefined && it.m3 !== null ? { m3: it.m3 } : {}), cierra: it.cierra, aprobar: Boolean(it.accion) })),
      fuentes: l.fuentes };
    const txt = [`📋 Pendientes de ${l.etiqueta}: ${l.items.length}${SECO ? " (a seco, datos de ejemplo)" : ""}`, ...l.items.map((it, i) => `${i + 1}. ${it.icono} ${it.titulo}\n   → ${it.accion ? "✅ Aprobar = " : "Se cierra: "}${it.cierra}`), "", ...l.fuentes.map((f) => `${f.ok ? "✓" : "✗"} ${f.fuente} (${f.ruta})${f.ok ? `: ${f.n}` : `: ${f.error}`}`)];
    return { texto: txt.join("\n") };
  }
  if (orden === "enviar" && negocio) return enviar(negocio, { prender: values.prender, prueba: values.prueba });
  if (orden === "boton" && positionals[0]) return boton(positionals[0], String(values.quien ?? "?"));
  return { ok: false, error: "Uso: pendientes-telegram.mjs listar --negocio=<blas|qa-forestal|main> [--json] | enviar --negocio=… [--seco] [--prender] | boton <pend:…> --quien=<…>" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).then(
    (r) => { if (r && Object.keys(r).length === 1 && typeof r.texto === "string") console.log(r.texto); else console.log(JSON.stringify({ cuando: new Date().toISOString(), ...r })); process.exit(0); },
    (e) => { console.log(JSON.stringify({ cuando: new Date().toISOString(), ok: false, error: String(e?.message ?? e).slice(0, 300) })); process.exit(1); },
  );
}
