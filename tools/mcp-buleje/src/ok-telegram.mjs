// OK por Telegram (01-11-2026, Brandon: «aprobar con un botón en el celular»).
//
// Cuando `confirmar` pide el OK, además de la ventana de Windows sale un mensaje al chat de Brandon con QUÉ se va a
// hacer y dos botones «✅ Sí» / «❌ No». Gana el primero que conteste (ventana o Telegram); a los 10 min sin respuesta = No.
//
// Cómo llega el toque (el MCP NO lee Telegram: el único lector es ~/.local/bin/buzon-telegram, con getUpdates):
//   1. Acá se sortea un id de 120 bits (24 letras base32) que viaja SOLO en el callback_data de los botones.
//   2. Se escribe <DIR_OK>/<sha256(id)>.pendiente (0600, carpeta 0700) con el vencimiento. El nombre es el hash: quien
//      mire la carpeta no saca el id.
//   3. El buzón recibe el toque (solo si lo tocó Brandon en SU chat), calcula el hash, ve que hay .pendiente vigente y
//      crea <hash>.respuesta con O_EXCL (el primer toque gana; los demás ven que ya existe) con el id EN CLARO adentro.
//   4. Acá se lee la respuesta y solo vale si su id es IGUAL al sorteado (timingSafeEqual): escribir un .respuesta a
//      mano sin saber el id no aprueba nada. Al terminar se borran los dos archivos y se edita el mensaje (sin botones).
// Un toque viejo o repetido encuentra el .pendiente borrado → el buzón contesta «ese botón ya no vale» y no escribe nada.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { armarBotones, sanearVentana } from "./clave-ok.mjs";
import { base32, normalizarResumen } from "./confirmaciones.mjs";
import { etiquetaNegocio } from "./dialogo-windows.mjs";
import { taparTexto } from "./tapar.mjs";

export const ESPERA_TELEGRAM_MS = 10 * 60_000; // 10 min sin respuesta = No
export const SONDEO_MS = 1_000;
export const DIR_OK = join(homedir(), ".local", "state", "buleje-ok");
export const RUTA_BOT = join(homedir(), ".bsm-notify.env");
export const PREFIJO = "okb"; // callback_data = okb:<id>:b0|b1|b2|no  (≤64 bytes: 3+1+24+1+2 = 31)
// 01-11 (Brandon eligió «3 botones como la ventana»): el dato correcto y 2 parecidos + ❌ No. Solo el correcto aprueba;
// cuál es lo sabe solo este proceso (el buzón escribe el botón tocado, b0/b1/b2, y acá se traduce).
export const RE_ID = /^[A-Z2-7]{24}$/;
export const MIN_HUMANO_MS = 1_500;

/** @param {string} s */
export const hashId = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Token y chat del bot (los mismos del buzón). null si no hay archivo o le falta algo: entonces solo hay ventana.
 * @param {string} [ruta]
 * @returns {{ token: string, chat: string } | null}
 */
export function leerBot(ruta = RUTA_BOT) {
  try {
    const env = {};
    for (const l of readFileSync(ruta, "utf8").split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      env[t.slice(0, i).replace(/^export\s+/, "").trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
    const token = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_CHAT_ID;
    if (!/^\d{5,15}:[\w-]{20,80}$/.test(token ?? "") || !/^-?\d{3,20}$/.test(chat ?? "")) return null;
    return { token, chat };
  } catch {
    return null;
  }
}

/**
 * Cliente mínimo de la API de Telegram (solo manda y edita; nunca lee updates: eso es del buzón).
 * @param {{ token: string, chat: string, fetch?: typeof fetch, tope?: number }} op
 */
export function crearTelegram(op) {
  const f = op.fetch ?? fetch;
  const llamar = async (metodo, cuerpo) => {
    const r = await f(`https://api.telegram.org/bot${op.token}/${metodo}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(op.tope ?? 15_000),
    });
    const j = await r.json().catch(() => ({}));
    // El token va en la URL: un error nunca la repite, solo lo que dijo Telegram.
    if (!j?.ok) throw new Error(`Telegram ${metodo}: ${String(j?.description ?? r.status).slice(0, 120)}`);
    return j.result;
  };
  return {
    chat: op.chat,
    /** @param {string} texto @param {{ texto: string, dato: string }[][]} [botones] @returns {Promise<number>} message_id */
    async enviar(texto, botones) {
      const cuerpo = { chat_id: op.chat, text: texto.slice(0, 4000), disable_web_page_preview: true };
      if (botones?.length) cuerpo.reply_markup = { inline_keyboard: botones.map((fila) => fila.map((b) => ({ text: b.texto.slice(0, 64), callback_data: b.dato }))) };
      const m = await llamar("sendMessage", cuerpo);
      return Number(m?.message_id);
    },
    /** Cambia el texto y saca los botones. Nunca lanza (si falla, el resultado ya está decidido). */
    async editar(mensajeId, texto) {
      try { await llamar("editMessageText", { chat_id: op.chat, message_id: mensajeId, text: texto.slice(0, 4000), disable_web_page_preview: true }); return true; } catch { return false; }
    },
  };
}

/** Claves que nunca viajan: «clave: xxx», «contraseña=…», tokens largos. Además DNI y celulares tapados. @param {string} s */
export function sinClaves(s) {
  return taparTexto(String(s ?? ""))
    .replace(/\b(clave(?:\s+sol)?|contrase(?:ñ|n)a|password|pass|pin|token|secreto?)(\s*[:=]\s*)\S+/gi, "$1$2••••")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "••••");
}

/**
 * El texto que lee Brandon en el celular: negocio, el resumen (sin la línea de «aprieta el botón…» de la ventana),
 * el dato clave en claro y las filas fijas. Todo sin claves.
 * @param {{ negocio: string, herramienta: string, resumen: string, ventana?: any, minutos: number }} p
 */
export function textoPregunta(p) {
  const lineas = normalizarResumen(p.resumen).split("\n").filter((l) => !/^Para hacerlo, aprieta el botón/.test(l.trim()));
  const v = p.ventana ?? {};
  // El dato clave NO va escrito suelto (sería tocar sin leer): está en el resumen y Brandon lo elige entre 3 botones.
  // Solo el código de 3 cifras (operaciones sin monto ni nombre) se muestra, igual que arriba en la ventana.
  const filas = [
    ...(v.clave?.valor && v.clave.palabra === "código" ? [`• ${v.clave.etiqueta}: ${v.clave.valor}`] : []),
    ...(Array.isArray(v.filas) ? v.filas.map((f) => `• ${f.etiqueta}: ${f.valor}`) : []),
  ];
  const palabra = v.clave?.palabra ?? "dato";
  return sinClaves([
    `🔐 Claude pide tu OK · ${etiquetaNegocio(p.negocio)}`,
    "",
    lineas.join("\n").trim(),
    ...(filas.length ? ["", ...filas] : []),
    "",
    `👉 Para aprobar, toca el ${palabra} correcto. Un botón equivocado o ❌ No = no se hace.`,
    `⏳ Vale ${p.minutos} min (sin respuesta = No). También puedes contestar en la ventana de la PC.`,
  ].join("\n"));
}

const RESULTADO = { si: "✅ Aprobado", no: "❌ Cancelado", vencio: "⌛ Caducó sin respuesta: no se hizo nada" };

/**
 * @param {{
 *   telegram: ReturnType<typeof crearTelegram>, dir?: string, ahora?: () => number, aleatorio?: (n: number) => Uint8Array,
 *   sondeoMs?: number, log?: (m: string) => void, esperar?: (ms: number) => Promise<void>, azar?: (n: number) => number,
 * }} op
 */
export function crearOkTelegram(op) {
  const dir = op.dir ?? DIR_OK;
  const ahora = op.ahora ?? Date.now;
  const aleatorio = op.aleatorio ?? ((n) => randomBytes(n));
  const sondeo = op.sondeoMs ?? SONDEO_MS;
  const log = op.log ?? ((m) => process.stderr.write(`[buleje-mcp] ${m}\n`));
  const esperar = op.esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  /**
   * Manda la pregunta y espera el toque. Nunca lanza.
   * @param {{ negocio: string, herramienta: string, resumen: string, ventana?: any, vence: number, signal?: AbortSignal }} p
   * @returns {Promise<{ respuesta: "si"|"no"|"vencio"|"sin_telegram", por: "telegram", quien?: string, cuando?: string }>}
   */
  async function preguntar(p) {
    const id = base32(aleatorio(15)); // 120 bits
    const h = hashId(id);
    const pendiente = join(dir, `${h}.pendiente`), respuesta = join(dir, `${h}.respuesta`);
    const limpiar = () => { for (const f of [pendiente, respuesta]) { try { rmSync(f, { force: true }); } catch { /* ya no está */ } } };
    let mensajeId = 0;
    /** @type {string[]} */ let textos = [];
    let correcto = -1;
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      chmodSync(dir, 0o700);
      writeFileSync(pendiente, JSON.stringify({ vence: p.vence, herramienta: p.herramienta, negocio: p.negocio }), { mode: 0o600, flag: "wx" });
      const minutos = Math.max(1, Math.round((p.vence - ahora()) / 60_000));
      const v = sanearVentana(p.ventana);
      ({ textos, correcto } = armarBotones(v.clave, op.azar));
      mensajeId = await op.telegram.enviar(textoPregunta({ ...p, ventana: v, minutos }), [
        textos.map((t, i) => ({ texto: t, dato: `${PREFIJO}:${id}:b${i}` })),
        [{ texto: "❌ No", dato: `${PREFIJO}:${id}:no` }],
      ]);
    } catch (e) {
      limpiar();
      log(`OK por Telegram no salió: ${String(/** @type {any} */ (e)?.message ?? e).slice(0, 160)}`);
      return { respuesta: "sin_telegram", por: "telegram" };
    }

    /** @type {{ respuesta: "si"|"no"|"vencio", por: "telegram", quien?: string, cuando?: string }} */
    let final = { respuesta: "vencio", por: "telegram" };
    let otro = false; // la ventana contestó antes (abort)
    try {
      while (ahora() < p.vence) {
        if (p.signal?.aborted) { otro = true; break; }
        if (existsSync(respuesta)) {
          let j = null;
          try { j = JSON.parse(readFileSync(respuesta, "utf8")); } catch { /* a medio escribir: el buzón escribe y cierra, se relee */ }
          if (j) {
            const leido = Buffer.from(String(j.id ?? ""), "utf8"), mio = Buffer.from(id, "utf8");
            const valido = leido.length === mio.length && timingSafeEqual(leido, mio) && /^(b[0-2]|no)$/.test(String(j.respuesta));
            if (valido) {
              // Solo el botón del dato correcto es «si»; un parecido o ❌ No = «no».
              const si = correcto >= 0 && j.respuesta === `b${correcto}`;
              final = { respuesta: si ? "si" : "no", por: "telegram", quien: String(j.quien ?? "").slice(0, 80), cuando: String(j.cuando ?? "").slice(0, 40), ...(j.respuesta !== "no" && !si ? { equivocado: true } : {}) };
              break;
            }
            // Un .respuesta sin el id correcto NO lo escribió el buzón con un toque de Brandon: se descarta y se avisa.
            log("OK por Telegram: llegó una respuesta con id equivocado; se descartó (no aprueba)");
            try { rmSync(respuesta, { force: true }); } catch { /* nada */ }
          }
        }
        await esperar(sondeo);
      }
    } finally {
      limpiar();
    }
    const cuando = new Date(ahora()).toLocaleString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
    const pie = otro ? "🖥️ Ya se contestó en la ventana de la PC: este botón no vale." : `${final.equivocado ? "❌ Tocaste un dato que no era: no se hizo nada" : RESULTADO[final.respuesta]} por Telegram · ${cuando}`;
    if (mensajeId) await op.telegram.editar(mensajeId, `${textoPregunta({ ...p, minutos: 1 }).split("\n👉")[0]}\n\n${pie}`);
    const { equivocado: _e, ...sal } = final;
    return otro ? { respuesta: "vencio", por: "telegram" } : sal;
  }

  return { preguntar };
}

/**
 * Carrera ventana ↔ Telegram. Gana el primero que contesta; el otro se cierra (su señal se aborta).
 * La ventana dura lo de siempre (2 min); si vence sin respuesta, Telegram sigue hasta su vencimiento (10 min).
 * Un «no» de la ventana (o un botón equivocado, o clics inyectados) termina la carrera en No.
 * @param {{ ventana: (p: any) => Promise<any>, telegram: ((p: any) => Promise<any>) | null, ventanaMs: number, ahora?: () => number }} op
 * @returns {(p: { negocio: string, herramienta: string, resumen: string, ventana?: any, vence: number, signal?: AbortSignal }) => Promise<{ respuesta: string, inyectados?: number, por: string, quien?: string, cuando?: string }>}
 */
export function crearCarrera(op) {
  const ahora = op.ahora ?? Date.now;
  return async (p) => {
    const ctlV = new AbortController(), ctlT = new AbortController();
    const atar = (ctl) => { if (p.signal?.aborted) ctl.abort(); else p.signal?.addEventListener("abort", () => ctl.abort(), { once: true }); };
    atar(ctlV); atar(ctlT);
    const venceV = Math.min(p.vence, ahora() + op.ventanaMs);
    const t0 = ahora();
    const deVentana = (async () => {
      try {
        const r = await op.ventana({ ...p, vence: venceV, signal: ctlV.signal });
        const o = r && typeof r === "object" ? r : { respuesta: String(r) };
        const inyectados = Number(o.inyectados) || 0;
        // La ventana bloquea sus botones los primeros 2 s (BLOQUEO_INICIAL_MS): un «no» antes de 1,5 s no lo apretó
        // nadie, es que no abrió (powershell ausente, PC sin escritorio). Con Telegram vivo eso no corta la carrera.
        if (String(o.respuesta) === "no" && !inyectados && op.telegram && ahora() - t0 < MIN_HUMANO_MS) return { respuesta: "rota", inyectados: 0, por: "ventana" };
        return { respuesta: String(o.respuesta), inyectados, por: "ventana" };
      } catch { return { respuesta: op.telegram ? "rota" : "no", inyectados: 0, por: "ventana" }; }
    })();
    const deTelegram = op.telegram ? op.telegram({ ...p, signal: ctlT.signal }) : Promise.resolve({ respuesta: "sin_telegram", por: "telegram" });

    // 1.º que dé una respuesta definitiva (si / no). «vencio» o «sin_telegram» de uno = esperar al otro.
    const definitiva = (r) => r.respuesta === "si" || r.respuesta === "no" || (r.inyectados ?? 0) > 0;
    const marcar = (prom, quien) => prom.then((r) => ({ r, quien }));
    const pend = new Map([["v", marcar(deVentana, "v")], ["t", marcar(deTelegram, "t")]]);
    let ganador = null;
    const vistos = [];
    while (pend.size) {
      const { r, quien } = await Promise.race(pend.values());
      pend.delete(quien);
      vistos.push(r.respuesta);
      if (definitiva(r)) { ganador = r; break; }
    }
    // Ni la ventana abrió ni Telegram salió: no hubo a quién preguntar → No (no «sin respuesta»).
    if (!ganador && vistos.includes("rota") && vistos.includes("sin_telegram")) ganador = { respuesta: "no", inyectados: 0, por: "ninguno" };
    ctlV.abort(); ctlT.abort(); // cierra la ventana o edita el mensaje del que perdió
    // Esperar a que los dos terminen (la ventana tiene que cerrar antes de abrir la siguiente de la fila).
    await Promise.allSettled([deVentana, deTelegram]);
    return ganador ?? { respuesta: "vencio", inyectados: 0, por: op.telegram ? "telegram" : "ventana" };
  };
}
