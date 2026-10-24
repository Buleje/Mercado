#!/usr/bin/env node
/**
 * Túnel de la cámara del patio — `npm run camaras:tunel` (2026-10-01).
 *
 * La cámara 4G está detrás de CGNAT y el panel corre en `localhost`: ninguno de
 * los dos puede llamar al otro. Un túnel de Cloudflare (gratis, sin cuenta) le
 * da al panel una dirección pública a la que la cámara SÍ puede mandar.
 *
 * ## Sólo pasa la puerta de la cámara
 *
 * Un túnel apuntado a `localhost:3000` publicaría TODO el panel en modo
 * desarrollo —login, APIs, errores con el código a la vista— en una dirección
 * que cualquiera puede escanear. Por eso el túnel apunta a un portero local
 * (127.0.0.1:3099) que deja pasar exactamente `GET|POST /api/webhooks/camara` y a
 * todo lo demás le contesta 404. La cámara se identifica con su token; el resto
 * del sistema no existe del lado de internet.
 *
 * ## Qué más hace
 *
 * - Escribe la dirección en `.camaras-tunel.json` (fuera de git): el panel la
 *   lee y la muestra para copiarla en la cámara. Una dirección de túnel rápido
 *   CAMBIA cada vez que se reinicia: el panel avisa cuándo empezó la actual.
 * - Si cloudflared se cae, lo vuelve a levantar.
 * - A las 19:00 de Lima dispara el resumen del día del patio (el cron de Vercel
 *   no corre en esta PC).
 *
 * Uso: `npm run camaras:tunel` (necesita el dev server en :3000 y cloudflared).
 */

import { spawn } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const DESTINO = { host: "127.0.0.1", port: 3000 };
const PUERTO_PORTERO = Number(process.env.CAMARAS_PORTERO_PUERTO ?? 3099);
const RUTA = "/api/webhooks/camara";
/** Igual al tope del webhook (8 MB de foto + la alerta): lo demás ni se reenvía. */
const MAX_CUERPO = 8 * 1024 * 1024 + 256 * 1024;
const ARCHIVO = path.join(process.cwd(), ".camaras-tunel.json");
const HORA_RESUMEN = "19:00";

const log = (...a) => console.log(`[camaras-tunel ${new Date().toLocaleTimeString("es-PE", { timeZone: "America/Lima" })}]`, ...a);

// ─────────────────────────────── Portero ───────────────────────────────

/**
 * La ruta y la query, sin `new URL`: `new URL("//%zz/", base)` LANZA y tumbaba
 * el proceso con un solo pedido sin token, y `//x/ruta` se lee como dominio
 * (revisión de seguridad 2026-10-01). Se compara el texto exacto.
 */
function partirRuta(crudo) {
  const i = crudo.indexOf("?");
  return i === -1 ? { ruta: crudo, query: "" } : { ruta: crudo.slice(0, i), query: crudo.slice(i) };
}

/** Contesta una sola vez: con un cuerpo cortado a mitad, la respuesta ya pudo haber salido. */
function contestar(res, estado, cuerpo, tipo = "application/json") {
  if (res.writableEnded || res.destroyed) return;
  if (!res.headersSent) res.writeHead(estado, { "content-type": tipo });
  res.end(cuerpo);
}

const portero = http.createServer((req, res) => {
  /* Nada de lo que mande internet puede tirar el proceso: el túnel y el resumen
     de las 19:00 viven acá. `http.request` lanza con caracteres raros en la ruta. */
  try {
    atender(req, res);
  } catch (err) {
    log("pedido rechazado:", String(err));
    contestar(res, 400, '{"ok":false}');
    req.resume();
  }
});

function atender(req, res) {
  res.on("error", (err) => log("respuesta cortada:", err.message));
  req.on("error", (err) => log("pedido cortado:", err.message));
  const { ruta, query } = partirRuta(req.url ?? "/");
  const permitido = ruta === RUTA && (req.method === "GET" || req.method === "POST");
  if (!permitido) {
    contestar(res, 404, "no existe", "text/plain");
    req.resume();
    return;
  }
  const largo = Number(req.headers["content-length"] ?? 0);
  if (largo > MAX_CUERPO) {
    contestar(res, 413, '{"ok":false,"error":"muy_grande"}');
    req.resume();
    return;
  }

  const proxy = http.request(
    {
      ...DESTINO,
      method: req.method,
      path: `${RUTA}${query}`,
      headers: {
        ...(req.headers["content-type"] ? { "content-type": req.headers["content-type"] } : {}),
        ...(req.headers["content-length"] ? { "content-length": req.headers["content-length"] } : {}),
        /* El panel resuelve el negocio por el host: con el del túnel buscaría un
           dominio propio que no existe. La cámara se identifica por su token. */
        host: `localhost:${DESTINO.port}`,
        "x-forwarded-for": String(req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress ?? ""),
      },
      timeout: 60_000,
    },
    (r) => {
      if (res.writableEnded || res.destroyed) {
        r.resume();
        return;
      }
      res.writeHead(r.statusCode ?? 502, { "content-type": r.headers["content-type"] ?? "application/json" });
      r.pipe(res);
    },
  );
  proxy.on("timeout", () => proxy.destroy(new Error("timeout")));
  proxy.on("error", (err) => {
    if (err.message === "cuerpo demasiado grande") return;
    log("el panel no contestó:", err.message, "— ¿está corriendo `npm run dev`?");
    contestar(res, 502, '{"ok":false,"error":"panel_apagado"}');
  });

  /* Tope también para cuerpos sin content-length (chunked). */
  let recibidos = 0;
  req.on("data", (trozo) => {
    recibidos += trozo.length;
    if (recibidos > MAX_CUERPO && !res.writableEnded) {
      req.unpipe(proxy);
      proxy.destroy(new Error("cuerpo demasiado grande"));
      contestar(res, 413, '{"ok":false,"error":"muy_grande"}');
      req.resume();
    }
  });
  req.pipe(proxy);
  log(`${req.method} ${RUTA} (${largo ? `${Math.round(largo / 1024)} KB` : "sin largo"})`);
}

portero.on("clientError", (err, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

// ─────────────────────────────── Túnel ───────────────────────────────

let cloudflared = null;
let saliendo = false;
let reintento = 2_000;

function guardarDireccion(url) {
  const datos = { url, desde: new Date().toISOString(), pid: process.pid };
  writeFileSync(ARCHIVO, JSON.stringify(datos, null, 2));
  log(`dirección pública: ${url}`);
  log(`para la cámara:    ${url}${RUTA}?k=<token de la cámara>  (cópiala entera desde el panel → Cámaras)`);
}

function levantarTunel() {
  cloudflared = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PUERTO_PORTERO}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const leer = (trozo) => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(trozo));
    if (m) {
      reintento = 2_000;
      guardarDireccion(m[0]);
    }
  };
  cloudflared.stdout.on("data", leer);
  cloudflared.stderr.on("data", leer);
  cloudflared.on("error", (err) => log("no se pudo arrancar cloudflared:", err.message));
  cloudflared.on("exit", (codigo) => {
    if (saliendo) return;
    log(`cloudflared se cerró (código ${codigo}); reintento en ${reintento / 1000} s`);
    setTimeout(levantarTunel, reintento);
    reintento = Math.min(reintento * 2, 60_000);
  });
}

// ─────────────────────────── Resumen de las 19:00 ───────────────────────────

let ultimoResumen = null;
/** Si el pedido falló, no se marca el día: se reintenta, pero no cada minuto. */
let proximoIntento = 0;
/** Un resumen que tarda más de un minuto no se pide otra vez mientras tanto. */
let pidiendo = false;

const ahoraEnLima = () => {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const v = (t) => partes.find((p) => p.type === t)?.value ?? "";
  return { dia: `${v("year")}-${v("month")}-${v("day")}`, hora: `${v("hour")}:${v("minute")}` };
};

async function quizasResumen() {
  const { dia, hora } = ahoraEnLima();
  if (pidiendo || hora < HORA_RESUMEN || ultimoResumen === dia || Date.now() < proximoIntento) return;
  if (!process.env.CRON_SECRET) {
    ultimoResumen = dia;
    log("sin CRON_SECRET: no se manda el resumen del día (corre con `node --env-file=.env.local`)");
    return;
  }
  pidiendo = true;
  try {
    const r = await fetch(`http://${DESTINO.host}:${DESTINO.port}/api/cron/camaras-resumen`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    log(`resumen del día ${dia}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    if (r.ok) ultimoResumen = dia;
    else proximoIntento = Date.now() + 15 * 60_000;
  } catch (err) {
    proximoIntento = Date.now() + 15 * 60_000;
    log("no se pudo pedir el resumen del día:", String(err));
  } finally {
    pidiendo = false;
  }
}

// ─────────────────────────────── Arranque ───────────────────────────────

function salir() {
  saliendo = true;
  cloudflared?.kill();
  rmSync(ARCHIVO, { force: true });
  log("túnel cerrado: la cámara ya no puede mandar fotos hasta que lo vuelvas a abrir");
  process.exit(0);
}
process.on("SIGINT", salir);
process.on("SIGTERM", salir);

portero.listen(PUERTO_PORTERO, "127.0.0.1", () => {
  log(`portero en 127.0.0.1:${PUERTO_PORTERO} → sólo ${RUTA}`);
  levantarTunel();
  /* El resumen se evalúa al arrancar si ya pasó la hora: así un reinicio a las
     19:30 no se lo salta (el cron es idempotente por día). */
  void quizasResumen();
  setInterval(() => void quizasResumen(), 60_000);
});
