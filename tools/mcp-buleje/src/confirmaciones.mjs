// OK humano para plata, stock, borrar y envíos (contrato .claude/autonomo/mcp-buleje/contrato.md §3.4 + §10).
// Dos pasos: proponer() guarda la propuesta en memoria y devuelve un token; confirmar() abre la ventana de
// Windows (preguntar) y SOLO con «si» manda los pedidos. Lógica pura: sin SDK, sin red propia (enviar se inyecta).
// 29-10 (revisión de seguridad): cada propuesta guarda su `ventana` (dato clave de los 3 botones + filas fijas) dentro
// de la firma, y las ventanas van EN FILA: una sola abierta a la vez; la segunda espera a que se cierre la primera.
// 2.ª pasada: la fila espera a que el proceso de la ventana anterior haya CERRADO (si venció, se la manda a matar y se
// espera ≤8 s), máximo 5 propuestas vivas (la 6.ª → error «limite», nunca se cae una vieja en silencio) y una
// respuesta con clics inyectados es «no» + `inyectados` en el resultado.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sanearVentana } from "./clave-ok.mjs";

export const VIGENCIA_MS = 120_000; // el token vive 120 s
export const VENTANA_MS = 120_000; // la ventana de OK se cierra sola a los 120 s
export const HOLGURA_VENTANA_MS = 20_000; // si preguntar() no vuelve en VENTANA + esto → «vencio»
export const MAX_VIVAS = 5;
export const ESPERA_CIERRE_MS = 8_000; // la fila espera ≤8 s a que cierre el proceso de una ventana vencida o cancelada
const RETENCION_MS = 10 * 60_000; // usadas/vencidas se recuerdan 10 min para decir token_usado / token_vencido

const METODOS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);
const RE_TOKEN = /^[A-Z2-7]{26}$/;

/** POST que aceptan `idempotencyKey` en el cuerpo (un reintento de red no duplica plata). Medido 29-10 con grep en app/api. */
export const RUTAS_IDEMPOTENTES = [
  /^\/api\/sales$/,
  /^\/api\/sales\/devolucion$/,
  /^\/api\/adelantos$/,
  /^\/api\/adelantos\/entregar$/,
  /^\/api\/adelantos\/[\w-]{1,40}\/entregas$/,
  /^\/api\/purchases$/,
  /^\/api\/rrhh\/colaboradores\/[\w-]{1,40}\/adelanto$/,
];

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** base32 RFC 4648 sin relleno. @param {Uint8Array} bytes */
export function base32(bytes) {
  let bits = 0, valor = 0, sal = "";
  for (const b of bytes) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { sal += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) sal += ALFABETO[(valor << (5 - bits)) & 31];
  return sal;
}

/** JSON con claves ordenadas (mismo objeto → mismo texto, sin importar el orden de las claves). @param {unknown} v */
export function jsonCanonico(v) {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : jsonCanonico(x))).join(",")}]`;
  const claves = Object.keys(v).filter((k) => /** @type {any} */ (v)[k] !== undefined).sort();
  return `{${claves.map((k) => `${JSON.stringify(k)}:${jsonCanonico(/** @type {any} */ (v)[k])}`).join(",")}}`;
}

/** @param {string} s */
export const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/** El modelo puede devolver el resumen con \r\n o espacios al final: eso no lo vuelve «otro» resumen. @param {unknown} s */
export function normalizarResumen(s) {
  return String(s ?? "").normalize("NFC").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trim();
}

/** @param {string} a @param {string} b */
function igualesHex(a, b) {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

function congelar(v) {
  if (v && typeof v === "object") { for (const k of Object.keys(v)) congelar(v[k]); Object.freeze(v); }
  return v;
}

/** @param {import("./tipos.mjs").ErrorMcp} codigo @param {string} mensaje @param {Record<string, unknown>} [extra] */
const fallo = (codigo, mensaje, extra = {}) => ({ ok: false, ...extra, error: { codigo, mensaje } });

/**
 * @param {unknown} p
 * @returns {string | null} motivo si el pedido está mal armado
 */
function pedidoInvalido(p) {
  const x = /** @type {any} */ (p);
  if (!x || typeof x !== "object") return "pedido vacío";
  if (!METODOS.has(x.metodo)) return `método «${x.metodo}» no permitido`;
  if (typeof x.ruta !== "string" || !x.ruta.startsWith("/api/") || x.ruta.includes("..") || x.ruta.includes("//") || /[\\?#\s]/.test(x.ruta)) return `ruta «${x.ruta}» inválida`;
  return null;
}

/**
 * @typedef {Object} Pregunta
 * @property {import("./tipos.mjs").Negocio} negocio
 * @property {string} herramienta
 * @property {string} resumen   el que generó el MCP (nunca el que manda el modelo)
 * @property {import("./tipos.mjs").Ventana} ventana  dato de los botones y filas fijas (saneados)
 * @property {number} vence     epoch ms: la ventana se cierra sola a esa hora
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {Object} ResultadoConfirmar
 * @property {boolean} ok
 * @property {string} [negocio]
 * @property {string} [herramienta]
 * @property {boolean} [seco]                    true = no salió nada a la red
 * @property {import("./tipos.mjs").Pedido[]} [pedidos]   en seco: lo que se mandaría
 * @property {import("./tipos.mjs").Respuesta[]} [resultados]  respuestas de los pedidos que se mandaron
 * @property {"si"|"no"|"vencio"} [respuesta]   lo que contestó la ventana
 * @property {number} [inyectados]              clics inyectados (no del mouse de Brandon) que la ventana descartó
 * @property {{ codigo: import("./tipos.mjs").ErrorMcp, mensaje: string }} [error]
 */

/**
 * @param {{
 *   preguntar: (p: Pregunta) => Promise<"si"|"no"|"vencio"|string|{ respuesta: string, inyectados?: number }>,
 *   enviar: (negocio: string, pedido: import("./tipos.mjs").Pedido) => Promise<import("./tipos.mjs").Respuesta>,
 *   ahora?: () => number,
 *   aleatorio?: (n: number) => Uint8Array,
 *   seco?: boolean | (() => boolean),
 * }} op
 */
export function crearConfirmador(op) {
  if (typeof op?.preguntar !== "function" || typeof op?.enviar !== "function") throw new TypeError("crearConfirmador necesita preguntar() y enviar()");
  const ahora = op.ahora ?? Date.now;
  const aleatorio = op.aleatorio ?? ((n) => randomBytes(n));
  const secoGlobal = () => (typeof op.seco === "function" ? op.seco() : op.seco === true);
  /** @type {Map<string, import("./tipos.mjs").Propuesta & { firma: string, seco: boolean, cancelada?: boolean }>} */
  const propuestas = new Map();

  const firmaDe = (p) => sha256(`${p.negocio}\n${p.herramienta}\n${p.hashPedidos}\n${p.hashResumen}\n${p.hashVentana}`);
  /** Espera `p` (el cierre del proceso de una ventana) con tope ESPERA_CIERRE_MS. */
  const esperarCierre = (p) => {
    if (!p) return undefined;
    let t;
    return Promise.race([p, new Promise((r) => { t = setTimeout(r, ESPERA_CIERRE_MS); })]).finally(() => clearTimeout(t));
  };
  /** Fila de ventanas: cada turno arranca cuando el anterior terminó Y su proceso cerró (o pasó el tope). */
  let fila = Promise.resolve();
  const enFila = (tarea) => {
    const turno = fila.then(tarea);
    fila = turno.then((r) => esperarCierre(r?.cerrada), () => undefined).then(() => undefined, () => undefined);
    return turno;
  };

  function podar() {
    const t = ahora();
    for (const [k, p] of propuestas) if (t > p.vence + RETENCION_MS) propuestas.delete(k);
  }
  const vivas = () => { const t = ahora(); return [...propuestas.values()].filter((p) => !p.usada && t <= p.vence).length; };

  /**
   * Guarda la propuesta. No toca la red.
   * @param {{ negocio: string, herramienta: string, pedidos: import("./tipos.mjs").Pedido | import("./tipos.mjs").Pedido[], resumen: string, ventana?: unknown, seco?: boolean }} a
   * @returns {{ token: string, resumen: string, vence: number, seco: boolean }}
   */
  function proponer(a) {
    if (typeof a?.negocio !== "string" || !a.negocio) throw new TypeError("proponer: falta negocio");
    if (typeof a.herramienta !== "string" || !a.herramienta) throw new TypeError("proponer: falta herramienta");
    const lista = Array.isArray(a.pedidos) ? a.pedidos : [a.pedidos];
    if (lista.length === 0 || lista.length > 20) throw new TypeError("proponer: entre 1 y 20 pedidos");
    for (const p of lista) { const m = pedidoInvalido(p); if (m) throw new TypeError(`proponer: ${m}`); }
    const resumen = normalizarResumen(a.resumen);
    if (!resumen) throw new TypeError("proponer: el resumen es obligatorio (es lo que Brandon lee en la ventana)");
    if (resumen.length > 3000) throw new TypeError("proponer: resumen de más de 3000 caracteres");
    podar();
    if (vivas() >= MAX_VIVAS) {
      throw Object.assign(new Error(`Ya hay ${MAX_VIVAS} propuestas esperando el OK de Brandon: confirmá o cancelá alguna (pendientes / cancelar) antes de proponer otra.`), { codigo: "limite" });
    }

    const pedidos = lista.map((p) => {
      const c = structuredClone(p);
      const cuerpo = /** @type {any} */ (c).cuerpo;
      if (c.metodo === "POST" && RUTAS_IDEMPOTENTES.some((re) => re.test(c.ruta)) && cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo) && cuerpo.idempotencyKey === undefined) {
        cuerpo.idempotencyKey = `mcp-${base32(aleatorio(15))}`;
      }
      return c;
    });
    const ventana = congelar(sanearVentana(a.ventana));
    const token = base32(aleatorio(16)); // 128 bits → 26 caracteres
    const creada = ahora();
    const base = { token, negocio: a.negocio, herramienta: a.herramienta, pedidos: congelar(pedidos), resumen, ventana, hashResumen: sha256(resumen), hashPedidos: sha256(jsonCanonico(pedidos)), hashVentana: sha256(jsonCanonico(ventana)), creada, vence: creada + VIGENCIA_MS, usada: false, seco: a.seco === true };
    propuestas.set(token, { ...base, firma: firmaDe(base) });
    return { token, resumen, vence: base.vence, seco: base.seco || secoGlobal() };
  }

  /** Valida sin consumir. @returns {{ p?: any, error?: ReturnType<typeof fallo> }} */
  function revisar(token, resumen, negocio) {
    const t = typeof token === "string" ? token.trim().toUpperCase() : "";
    if (!RE_TOKEN.test(t)) return { error: fallo("token_vencido", "Ese token no tiene la forma de uno del MCP (26 letras A-Z y 2-7).") };
    const p = propuestas.get(t);
    if (!p) return { error: fallo("token_vencido", "Ese token no existe o venció hace rato. Volvé a pedir la propuesta.") };
    if (p.usada) return { error: fallo("token_usado", p.cancelada ? "Esa propuesta se canceló." : "Ese token ya se usó (un token sirve una sola vez). Pedí una propuesta nueva.") };
    if (ahora() > p.vence) return { error: fallo("token_vencido", `El token venció (vive ${VIGENCIA_MS / 1000} s). Pedí una propuesta nueva.`) };
    if (negocio !== undefined && negocio !== null && negocio !== "" && negocio !== p.negocio) {
      return { error: fallo("token_otro_negocio", `Ese token es de «${p.negocio}», no de «${negocio}».`) };
    }
    if (!igualesHex(sha256(normalizarResumen(resumen)), p.hashResumen)) {
      return { error: fallo("resumen_distinto", "El resumen no es el mismo que generó la propuesta: pasa el resumen tal cual vino.") };
    }
    if (sha256(jsonCanonico(p.pedidos)) !== p.hashPedidos || sha256(jsonCanonico(p.ventana)) !== p.hashVentana || firmaDe(p) !== p.firma) {
      p.usada = true;
      return { error: fallo("servidor", "La propuesta cambió en memoria después de crearse; se anuló.") };
    }
    return { p };
  }

  /**
   * Ejecuta una propuesta. Orden: valida → la marca usada (antes de cualquier await) → espera su turno en la fila
   * de ventanas → ventana → envía. El vencimiento de la ventana corre desde que se abre, no desde que entró a la fila.
   * @param {{ token: string, resumen: string, negocio?: string, seco?: boolean, signal?: AbortSignal }} a
   * @returns {Promise<ResultadoConfirmar>}
   */
  async function confirmar(a) {
    podar();
    const { p, error } = revisar(a?.token, a?.resumen, a?.negocio);
    if (error) return error;
    p.usada = true; // un solo uso: dos confirmar en paralelo → el segundo ve token_usado
    const base = { negocio: p.negocio, herramienta: p.herramienta };

    if (p.seco || a.seco === true || secoGlobal()) {
      return { ok: true, ...base, seco: true, pedidos: structuredClone(p.pedidos) };
    }
    if (a.signal?.aborted) return fallo("no_confirmado", "Se canceló la llamada antes de abrir la ventana; no se hizo nada.", base);

    /**
     * Un turno de la fila: abre la ventana (si la llamada sigue viva) y espera su respuesta o el tope. La ventana recibe
     * su propia señal (atada a la de la llamada): al vencer el tope se la manda a cerrar y `cerrada` avisa cuándo cerró.
     */
    const turno = async () => {
      if (a.signal?.aborted) return { respuesta: "abortada" };
      const ctl = new AbortController();
      const alAbortar = () => ctl.abort();
      a.signal?.addEventListener("abort", alAbortar, { once: true });
      const vence = ahora() + VENTANA_MS;
      const pregunta = (async () => op.preguntar({ negocio: p.negocio, herramienta: p.herramienta, resumen: p.resumen, ventana: structuredClone(p.ventana), vence, signal: ctl.signal }))();
      const cerrada = pregunta.then(() => undefined, () => undefined).finally(() => a.signal?.removeEventListener("abort", alAbortar));
      let reloj;
      try {
        const r = await Promise.race([pregunta, new Promise((res) => { reloj = setTimeout(() => res("vencio"), VENTANA_MS + HOLGURA_VENTANA_MS); })]);
        const o = r && typeof r === "object" ? r : { respuesta: r };
        const inyectados = Number.isSafeInteger(o.inyectados) && o.inyectados > 0 ? o.inyectados : 0;
        return { respuesta: inyectados > 0 ? "no" : String(o.respuesta), inyectados, cerrada };
      } catch {
        return { respuesta: "no", inyectados: 0, cerrada }; // ventana rota = no hay OK
      } finally {
        clearTimeout(reloj);
        ctl.abort(); // si venció el tope, esto cierra la ventana; si ya contestó, no hace nada
      }
    };
    /** @type {string} */ let respuesta;
    let inyectados = 0;
    let quitar = () => undefined;
    const abortada = new Promise((r) => {
      if (!a.signal) return;
      const al = () => r("abortada");
      a.signal.addEventListener("abort", al, { once: true });
      quitar = () => a.signal?.removeEventListener("abort", al);
    });
    try {
      const r = await Promise.race([enFila(turno), abortada]);
      respuesta = typeof r === "string" ? r : r.respuesta;
      inyectados = typeof r === "object" && r.inyectados > 0 ? r.inyectados : 0;
    } catch {
      respuesta = "no";
    } finally {
      quitar();
    }
    if (inyectados > 0) {
      return fallo("no_confirmado", `Llegaron ${inyectados} clic(s) inyectados por programa (no del mouse de Brandon) a la ventana de OK: se descartaron y la respuesta es «no». No se hizo nada.`, { ...base, respuesta: "no", inyectados });
    }
    if (respuesta === "abortada") return fallo("no_confirmado", "Se canceló la llamada mientras esperaba su turno o el OK; no se hizo nada.", base);
    if (respuesta === "vencio") return fallo("sin_respuesta", `Brandon no contestó la ventana en ${VENTANA_MS / 1000} s; no se hizo nada.`, { ...base, respuesta: "vencio" });
    if (respuesta !== "si") return fallo("no_confirmado", "Brandon dijo que no (o la ventana no se pudo abrir); no se hizo nada.", { ...base, respuesta: "no" });
    if (a.signal?.aborted) return fallo("no_confirmado", "Se canceló la llamada mientras esperaba el OK; no se hizo nada.", { ...base, respuesta: "si" });

    /** @type {import("./tipos.mjs").Respuesta[]} */ const resultados = [];
    for (let i = 0; i < p.pedidos.length; i++) {
      let r;
      try {
        r = await op.enviar(p.negocio, structuredClone(p.pedidos[i]));
      } catch (e) {
        r = { ok: false, status: 0, ms: 0, error: { codigo: "servidor", mensaje: String(/** @type {any} */ (e)?.message ?? e).slice(0, 300) } };
      }
      resultados.push(r);
      if (!r?.ok) {
        const quedan = p.pedidos.length - i - 1;
        const msg = `Falló el paso ${i + 1} de ${p.pedidos.length} (${p.pedidos[i].metodo} ${p.pedidos[i].ruta}): ${r?.error?.mensaje ?? `HTTP ${r?.status}`}.` +
          (i > 0 ? ` Los ${i} anteriores SÍ se hicieron (no hay deshacer automático).` : "") + (quedan ? ` Los ${quedan} siguientes no se mandaron.` : "");
        return { ok: false, ...base, respuesta: "si", resultados, error: { codigo: r?.error?.codigo ?? "servidor", mensaje: msg } };
      }
    }
    return { ok: true, ...base, respuesta: "si", resultados };
  }

  /** Propuestas vivas (recurso buleje://pendientes). */
  function pendientes() {
    podar();
    const t = ahora();
    return [...propuestas.values()].filter((p) => !p.usada && t <= p.vence).map((p) => ({
      token: p.token, negocio: p.negocio, herramienta: p.herramienta, resumen: p.resumen, vence: p.vence,
      quedanSegundos: Math.max(0, Math.round((p.vence - t) / 1000)), pasos: p.pedidos.length,
    }));
  }

  /** @param {{ token: string }} a */
  function cancelar(a) {
    const t = typeof a?.token === "string" ? a.token.trim().toUpperCase() : "";
    const p = propuestas.get(t);
    if (!p) return fallo("token_vencido", "No hay una propuesta con ese token.");
    if (p.usada) return fallo("token_usado", "Esa propuesta ya se usó o se canceló.");
    p.usada = true; p.cancelada = true;
    return { ok: true, negocio: p.negocio, herramienta: p.herramienta };
  }

  return { proponer, confirmar, pendientes, cancelar };
}
