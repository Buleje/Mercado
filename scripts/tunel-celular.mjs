#!/usr/bin/env node
/**
 * Túnel al celular — `node scripts/tunel-celular.mjs [--vigia] [--horas N]` (2026-10-23).
 *
 * El aviso de movimiento de las cámaras llega por Web Push, y el celular sólo
 * se suscribe si abre el panel por HTTPS. Esto abre una dirección https al azar
 * (`*.trycloudflare.com`, túnel rápido de Cloudflare, sin cuenta) que llega al
 * dev server de esta PC, la muestra grande y como QR para abrirla con la
 * cámara del celular, y con `--vigia` arranca también el vigía de movimientos
 * (`scripts/camaras-vigia.mjs`). Ctrl+C apaga todo.
 *
 * Entre Cloudflare y el dev server va un filtro propio (127.0.0.1, puerto al
 * azar) con LISTA BLANCA: sólo pasa lo que piden la entrada, el panel y
 * Cámaras con sus avisos (`PERMITIDAS`, medido navegando 23-10); todo lo demás
 * da 404. Antes era lista negra y `/api/auth/x/%2e%2e/bypass` la esquivaba
 * (sesión de admin de `main` SIN clave: revisión de seguridad 23-10). El
 * camino se decodifica UNA vez y tiene que quedar canónico (sin `..`, `.`,
 * `//`, `%`, `\`); `x-forwarded-for`/`x-real-ip` se pisan con la IP que da
 * Cloudflare (el límite por IP confía en el primer valor).
 * Para ver lo que se corta: `TUNEL_VER_CERRADAS=1`.
 *
 * Opciones:
 *   --vigia      arranca también el vigía (manda el aviso al celular cada 30 s)
 *   --horas N    se apaga solo a las N horas (por defecto no se apaga)
 *   --puerto N   puerto del dev server (por defecto 3000)
 *
 * Variables: CLOUDFLARED (ruta del binario; por defecto ~/.local/bin/cloudflared).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
};
const CON_VIGIA = args.includes("--vigia");
const PUERTO = Number(opcion("--puerto") ?? 3000);
const HORAS = Number(opcion("--horas") ?? 0);
/* Entra directo a Cámaras: el login respeta `from` (sólo caminos internos). */
const DESTINO = `/admin/login?from=${encodeURIComponent("/admin?tab=camaras")}`;
const VER_CERRADAS = process.env.TUNEL_VER_CERRADAS === "1";

const BIN_LOCAL = path.join(homedir(), ".local/bin/cloudflared");
const CLOUDFLARED = process.env.CLOUDFLARED ?? (existsSync(BIN_LOCAL) ? BIN_LOCAL : "cloudflared");

/* LISTA BLANCA (medida 23-10 con Playwright: login → /admin → Cámaras → push,
   en main y en la QA forestal). Las otras pestañas no cargan datos por el
   túnel: es a propósito. Pantalla nueva que haga falta → medir con
   `TUNEL_VER_CERRADAS=1` y sumar su camino EXACTO, nunca `/api` entero. */
const PERMITIDAS = {
  exactas: new Set([
    // archivos públicos
    "/favicon.ico", "/icon.png", "/manifest.webmanifest", "/sw-avisos.js", "/back-nav-refresh.js", "/perf-measure-patch.js",
    // entrada y sesión
    "/api/health", "/api/auth/login", "/api/auth/me", "/api/auth/refresh", "/api/auth/logout", "/api/auth/totp/verify",
    // lo que pide la cáscara del panel al cargar
    "/api/admin/alerts-summary", "/api/admin/chat/threads", "/api/admin/dashboard", "/api/admin/me/specializations",
    "/api/admin/notifications/stream", "/api/admin/platform-chat", "/api/admin/preferences/panel", "/api/admin/sse",
    "/api/admin/stats", "/api/ai-assistant/health", "/api/batches/expiring", "/api/design-system/active",
    "/api/notification-center", "/api/plan", "/api/platform/admin-template", "/api/products", "/api/settings",
    "/api/suppliers", "/api/tenants/resolve",
  ]),
  // `camino === p` o `camino` empieza con `p + "/"`
  prefijos: ["/admin", "/_next/static", "/icons", "/brand", "/api/pwa-icon", "/api/admin/camaras"],
};

/* Nunca, aunque un prefijo de arriba crezca (defensa en profundidad). */
const NUNCA = [
  "/api/auth/bypass", "/api/dev", "/api/cron", "/api/auth/customer/test-session",
  "/api/whatsapp/concierge/test", "/api/auth/otp/send", "/_next/mcp",
];

const hora = () =>
  new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
const log = (m) => console.log(`[túnel ${hora()}] ${m}`);

const bajo = (camino, p) => camino === p || camino.startsWith(`${p}/`);

/** `true` sólo si el camino (decodificado UNA vez y canónico) está en la lista blanca. */
function permitida(urlCruda = "") {
  const crudo = urlCruda.split("?")[0];
  if (!crudo.startsWith("/") || crudo.startsWith("//")) return false; // forma absoluta o `//host`
  if (/%(2e|2f|5c|25|00)/i.test(crudo)) return false; // punto, barras o `%` escondidos
  let camino;
  try {
    camino = decodeURIComponent(crudo);
  } catch {
    return false; // %-escape roto
  }
  if (/[%\\?#\u0000-\u001f\u007f]/.test(camino)) return false;
  if (camino.split("/").some((s) => s === ".." || s === ".")) return false;
  if (path.posix.normalize(camino) !== camino) return false; // `//` en el medio y similares
  if (camino.includes("__nextjs") || camino.endsWith(".map") || camino.startsWith("/api/debug")) return false;
  if (NUNCA.some((n) => bajo(camino, n))) return false;
  return PERMITIDAS.exactas.has(camino) || PERMITIDAS.prefijos.some((p) => bajo(camino, p));
}

/* La IP que vio Cloudflare (la pone su borde, el cliente no la elige). Lo que
   el cliente mande en `x-forwarded-for`/`x-real-ip` se descarta. */
function cabecerasHaciaArriba(req) {
  const h = { ...req.headers };
  const cf = String(req.headers["cf-connecting-ip"] ?? "").trim();
  const ip = net.isIP(cf) ? cf : (req.socket.remoteAddress ?? "127.0.0.1");
  for (const k of ["x-forwarded-for", "x-real-ip", "x-vercel-forwarded-for", "forwarded", "true-client-ip", "x-client-ip"]) delete h[k];
  h["x-forwarded-for"] = ip;
  h["x-real-ip"] = ip;
  return h;
}

/* ── 1. Aviso de seguridad ─────────────────────────────────────────────── */
console.log(
  [
    "",
    "  ATENCIÓN: mientras esto esté prendido, el panel de esta PC queda abierto en",
    "  internet en una dirección al azar. Por el túnel sólo pasan la entrada, el",
    "  panel y Cámaras con sus avisos; lo demás da 404 (las otras pestañas no",
    "  cargan desde el celular). Apágalo con Ctrl+C apenas termines y no compartas",
    "  la dirección.",
    "",
  ].join("\n"),
);

/* ── 2. ¿Contesta el dev server? ───────────────────────────────────────── */
async function devServerVivo() {
  const hasta = Date.now() + 90_000;
  let avisado = false;
  while (Date.now() < hasta) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/api/health`, { signal: AbortSignal.timeout(20_000) });
      if (r.status < 500) return true;
    } catch {
      /* todavía no */
    }
    if (!avisado) {
      log(`el dev server de :${PUERTO} no contesta; espero hasta 90 s (¿está corriendo \`npm run dev\`?)`);
      avisado = true;
    }
    await new Promise((ok) => setTimeout(ok, 3_000));
  }
  return false;
}

if (!(await devServerVivo())) {
  log(`el dev server de :${PUERTO} no contestó. Arráncalo con \`npm run dev\` y vuelve a correr esto.`);
  process.exit(1);
}

/* ── 3. Filtro entre Cloudflare y el dev server ────────────────────────── */
const filtro = http.createServer((req, res) => {
  if (!permitida(req.url)) {
    if (VER_CERRADAS) log(`cerrado: ${req.method} ${String(req.url).slice(0, 160)}`);
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end("No disponible por el túnel del celular.\n");
    return;
  }
  const salida = http.request(
    { host: "127.0.0.1", port: PUERTO, method: req.method, path: req.url, headers: cabecerasHaciaArriba(req) },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.statusMessage, r.headers);
      r.pipe(res);
    },
  );
  salida.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`El dev server no contestó (${err.code ?? err.message}).\n`);
  });
  res.on("close", () => salida.destroy()); // SSE: si el celular se va, se corta arriba también
  req.pipe(salida);
});

/* El websocket de recarga de Next (sólo ése): sin él la página del dev server
   reintenta conectarse y termina recargándose sola. */
filtro.on("upgrade", (req, socket, head) => {
  if (String(req.url).split("?")[0] !== "/_next/webpack-hmr") {
    if (VER_CERRADAS) log(`cerrado (websocket): ${String(req.url).slice(0, 160)}`);
    socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    return;
  }
  const arriba = net.connect(PUERTO, "127.0.0.1", () => {
    const lineas = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (const [k, v] of Object.entries(cabecerasHaciaArriba(req))) for (const uno of [v].flat()) lineas.push(`${k}: ${uno}`);
    arriba.write(`${lineas.join("\r\n")}\r\n\r\n`);
    if (head?.length) arriba.write(head);
    arriba.pipe(socket);
    socket.pipe(arriba);
  });
  arriba.on("error", () => socket.destroy());
  socket.on("error", () => arriba.destroy());
});

await new Promise((ok) => filtro.listen(0, "127.0.0.1", ok));
const PUERTO_FILTRO = filtro.address().port;

/* ── 4. cloudflared ────────────────────────────────────────────────────── */
let apagando = false;
let vigia = null;
const ultimas = [];

const tunel = spawn(CLOUDFLARED, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PUERTO_FILTRO}`], {
  stdio: ["ignore", "pipe", "pipe"],
});
tunel.on("error", (err) => {
  log(`no se pudo arrancar cloudflared (${CLOUDFLARED}): ${err.message}. Instálalo o pasa CLOUDFLARED=/ruta/al/binario.`);
  apagar(1);
});

let urlPublica = null;
function leerSalida(trozo) {
  for (const linea of String(trozo).split("\n")) {
    if (!linea.trim()) continue;
    ultimas.push(linea);
    if (ultimas.length > 20) ultimas.shift();
    const m = linea.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !urlPublica) {
      urlPublica = m[0];
      mostrar(urlPublica).catch((err) => log(`no se pudo mostrar la dirección: ${String(err)}`));
    } else if (/\bERR\b/.test(linea) && urlPublica && !apagando) {
      log(`cloudflared: ${linea.replace(/^\S+\s+ERR\s+/, "").slice(0, 160)}`);
    }
  }
}
tunel.stdout.on("data", leerSalida);
tunel.stderr.on("data", leerSalida);
tunel.on("exit", (code) => {
  if (apagando) return;
  log(`cloudflared se cerró (código ${code}).${urlPublica ? "" : " Últimas líneas:"}`);
  if (!urlPublica) for (const l of ultimas.slice(-8)) console.log(`    ${l}`);
  apagar(1);
});

const plazoUrl = setTimeout(() => {
  if (urlPublica) return;
  log("cloudflared no dio la dirección en 60 s (¿hay internet?). Últimas líneas:");
  for (const l of ultimas.slice(-8)) console.log(`    ${l}`);
  apagar(1);
}, 60_000);

async function mostrar(url) {
  clearTimeout(plazoUrl);
  const destino = `${url}${DESTINO}`;
  const qr = await QRCode.toString(destino, { type: "terminal", small: true });
  const ancho = destino.length + 6;
  const raya = "═".repeat(ancho);
  console.log(`\n  ╔${raya}╗\n  ║${" ".repeat(ancho)}║\n  ║   ${destino}   ║\n  ║${" ".repeat(ancho)}║\n  ╚${raya}╝\n`);
  console.log(qr);
  console.log(
    [
      "  En el celular: abre esa dirección (o apunta la cámara al QR), entra con tu",
      "  usuario de siempre (si te pide elegir tienda, toca la tuya, no las «QA»), ve a",
      "  Cámaras, abre la cámara y toca «Avisarme en este celular».",
      "  Hazlo UNA sola vez: cada vez que corres esto la dirección cambia, y activarlo",
      "  de nuevo suma otro «celular» (aviso doble).",
      "",
    ].join("\n"),
  );
  if (CON_VIGIA && !apagando) arrancarVigia();
  esperarQueConteste(url).catch((err) => log(`no se pudo probar el túnel: ${String(err)}`));
  if (HORAS > 0) {
    log(`se apaga solo en ${HORAS} h.`);
    setTimeout(() => {
      log(`pasaron ${HORAS} h: apago el túnel${vigia ? " y el vigía" : ""}.`);
      apagar(0);
    }, HORAS * 3_600_000);
  }
  log("Ctrl+C para apagar.");
}

/* La dirección nueva tarda en existir en el DNS (medido 23-10: ~70 s desde
   WSL, que además recuerda el «no existe» un rato). */
async function esperarQueConteste(url) {
  const hasta = Date.now() + 180_000;
  while (!apagando && Date.now() < hasta) {
    try {
      const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(15_000) });
      if (r.ok) return log(`el túnel ya contesta (HTTP ${r.status}): ya puedes abrirlo en el celular.`);
    } catch {
      /* DNS todavía no */
    }
    await new Promise((ok) => setTimeout(ok, 3_000));
  }
  if (!apagando) log("el túnel no contestó desde esta PC en 3 min; prueba igual en el celular (a veces es sólo el DNS de la PC).");
}

/* ── 5. Vigía (opcional) ───────────────────────────────────────────────── */
function arrancarVigia() {
  const envLocal = path.join(RAIZ, ".env.local");
  const flags = existsSync(envLocal) ? [`--env-file=${envLocal}`] : [];
  vigia = spawn(process.execPath, [...flags, path.join(RAIZ, "scripts/camaras-vigia.mjs")], {
    cwd: RAIZ,
    stdio: ["ignore", "inherit", "inherit"],
  });
  vigia.on("exit", (code) => {
    vigia = null;
    if (!apagando) log(`el vigía se cerró (código ${code}); el túnel sigue prendido.`);
  });
}

/* ── 6. Apagar todo ────────────────────────────────────────────────────── */
function apagar(codigo = 0) {
  if (apagando) return;
  apagando = true;
  clearTimeout(plazoUrl);
  const hijos = [tunel, vigia].filter((h) => h && h.exitCode === null && h.signalCode === null);
  for (const h of hijos) h.kill(h === vigia ? "SIGINT" : "SIGTERM");
  filtro.close();
  filtro.closeAllConnections?.();
  const fin = () => {
    log(`apagado: ${CON_VIGIA ? "el túnel y el vigía ya no corren" : "el túnel ya no corre"}; la dirección dejó de existir.`);
    process.exit(codigo);
  };
  if (hijos.length === 0) return fin();
  let quedan = hijos.length;
  for (const h of hijos) h.once("exit", () => --quedan === 0 && fin());
  setTimeout(() => {
    for (const h of hijos) if (h.exitCode === null && h.signalCode === null) h.kill("SIGKILL");
    fin();
  }, 5_000).unref();
}
process.on("SIGINT", () => apagar(0));
process.on("SIGTERM", () => apagar(0));
process.on("SIGHUP", () => apagar(0));

log(`arrancando cloudflared hacia el dev server de :${PUERTO} (filtro en :${PUERTO_FILTRO})…`);
