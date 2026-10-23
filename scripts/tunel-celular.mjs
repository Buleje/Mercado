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
 *   --fijo[=tailscale|ngrok|cloudflare]   dirección FIJA en vez de una al azar
 *                (por defecto Tailscale Funnel: https://<equipo>.<red>.ts.net,
 *                gratis y sin dominio). El celular se suscribe UNA vez y sirve
 *                siempre. Mismo filtro delante: el túnel apunta al filtro,
 *                nunca al dev server.
 *     --dominio H  (ngrok: tu dominio gratis `*.ngrok-free.app`; cloudflare:
 *                  el nombre en TU dominio, p. ej. celular.midominio.pe)
 *     --nombre N   (cloudflare) túnel con nombre (por defecto buleje-celular)
 *   --sin-tunel  sólo el filtro, sin abrir nada a internet (para probarlo)
 *   --puerto-filtro N  puerto fijo del filtro (por defecto al azar)
 *
 * IP del cliente: con Cloudflare vale `cf-connecting-ip` (la pone su borde);
 * con Tailscale y ngrok vale el ÚLTIMO `x-forwarded-for` (tailscaled lo pisa,
 * ngrok lo agrega al final). Un `cf-connecting-ip` que llegue por Tailscale lo
 * inventó el cliente: se descarta.
 *
 * Variables: CLOUDFLARED (ruta; por defecto ~/.local/bin/cloudflared),
 * TAILSCALE (ruta del CLI), TAILSCALE_SOCKET (otro tailscaled, para probar),
 * NGROK (ruta del binario).
 */

import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
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
const TAILSCALE = process.env.TAILSCALE ?? "tailscale";
const TS_SOCKET = process.env.TAILSCALE_SOCKET;
const NGROK = process.env.NGROK ?? "ngrok";

/* `rapido` = quick tunnel de siempre; los otros tres dan dirección fija. */
const argFijo = args.find((a) => a === "--fijo" || a.startsWith("--fijo="));
const PROVEEDOR = argFijo ? argFijo.split("=")[1] || "tailscale" : "rapido";
if (!["rapido", "tailscale", "ngrok", "cloudflare"].includes(PROVEEDOR)) {
  console.error(`--fijo=${PROVEEDOR}: no lo conozco. Usa --fijo (Tailscale), --fijo=ngrok o --fijo=cloudflare.`);
  process.exit(2);
}
const FIJO = PROVEEDOR !== "rapido";
const SIN_TUNEL = args.includes("--sin-tunel");
const PUERTO_FILTRO_PEDIDO = Number(opcion("--puerto-filtro") ?? 0);
const DOMINIO = (opcion("--dominio") ?? process.env.TUNEL_DOMINIO ?? "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const NOMBRE_TUNEL = opcion("--nombre") ?? "buleje-celular";
if ((PROVEEDOR === "ngrok" || PROVEEDOR === "cloudflare") && !DOMINIO && !SIN_TUNEL) {
  console.error(
    PROVEEDOR === "ngrok"
      ? "Falta --dominio: reserva tu dominio gratis en https://dashboard.ngrok.com/domains y pásalo (p. ej. --dominio buleje.ngrok-free.app)."
      : "Falta --dominio: el nombre que apuntaste a este túnel en TU dominio de Cloudflare (p. ej. --dominio celular.midominio.pe).",
  );
  process.exit(2);
}

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

/** El camino decodificado UNA vez si es canónico (sin `..`, `.`, `//`, `%`, `\`); si no, `null`. */
function caminoCanonico(urlCruda = "") {
  const crudo = urlCruda.split("?")[0];
  if (!crudo.startsWith("/") || crudo.startsWith("//")) return null; // forma absoluta o `//host`
  if (/%(2e|2f|5c|25|00)/i.test(crudo)) return null; // punto, barras o `%` escondidos
  let camino;
  try {
    camino = decodeURIComponent(crudo);
  } catch {
    return null; // %-escape roto
  }
  if (/[%\\?#\u0000-\u001f\u007f]/.test(camino)) return null;
  if (camino.split("/").some((s) => s === ".." || s === ".")) return null;
  if (path.posix.normalize(camino) !== camino) return null; // `//` en el medio y similares
  return camino;
}

/** `true` sólo si el camino (decodificado UNA vez y canónico) está en la lista blanca. */
function permitida(urlCruda = "") {
  const camino = caminoCanonico(urlCruda);
  if (camino === null) return false;
  if (camino.includes("__nextjs") || camino.endsWith(".map") || camino.startsWith("/api/debug")) return false;
  if (NUNCA.some((n) => bajo(camino, n))) return false;
  return PERMITIDAS.exactas.has(camino) || PERMITIDAS.prefijos.some((p) => bajo(camino, p));
}

/* La IP que vio el borde del túnel (el cliente no la elige). Cloudflare la
   pone en `cf-connecting-ip`; tailscaled PISA `x-forwarded-for` con la IP de
   origen del funnel y ngrok la AGREGA al final: vale la última. Sin IP válida,
   la del socket (127.0.0.1: todos comparten el mismo cupo, más estricto). */
const IP_POR_CLOUDFLARE = PROVEEDOR === "rapido" || PROVEEDOR === "cloudflare";
function ipDelCliente(req) {
  if (IP_POR_CLOUDFLARE) {
    const cf = String(req.headers["cf-connecting-ip"] ?? "").trim();
    if (net.isIP(cf)) return cf;
  } else {
    const ultima = [req.headers["x-forwarded-for"] ?? ""].flat().join(",").split(",").map((s) => s.trim()).filter(Boolean).at(-1) ?? "";
    if (net.isIP(ultima)) return ultima;
  }
  return req.socket.remoteAddress ?? "127.0.0.1";
}

/* Lo que el cliente mande en `x-forwarded-*`/`x-real-ip`/`cf-connecting-ip`
   se descarta; arriba sólo llega la IP de `ipDelCliente` y el host real. */
function cabecerasHaciaArriba(req) {
  const h = { ...req.headers };
  const ip = ipDelCliente(req);
  for (const k of [
    "x-forwarded-for", "x-real-ip", "x-vercel-forwarded-for", "forwarded", "true-client-ip", "x-client-ip",
    "cf-connecting-ip", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port",
  ]) delete h[k];
  h["x-forwarded-for"] = ip;
  h["x-real-ip"] = ip;
  if (req.headers.host) h["x-forwarded-host"] = req.headers.host;
  if (!SIN_TUNEL) h["x-forwarded-proto"] = "https"; // los 4 túneles llegan por https
  return h;
}

/* Canario: lo contesta el FILTRO (nunca el dev server) con una marca al azar
   de esta corrida. Si por la dirección pública no vuelve, el túnel no pasa por
   el filtro (p. ej. uno de Cloudflare configurado en su panel web, que ignora
   `--url`) y se apaga todo. */
const CANARIO = "/__canario";
const MARCA = randomBytes(12).toString("hex");

/* Modo fijo: la dirección no cambia, así que se la puede atacar a la clave.
   10 POST de entrada por minuto por IP (elegir tienda es el 2.º POST). */
const LOGIN_POR_MINUTO = 10;
const intentosLogin = new Map(); // ip → marcas de tiempo del último minuto
function loginExcedido(req) {
  if (!FIJO || req.method !== "POST" || caminoCanonico(req.url) !== "/api/auth/login") return false;
  const ip = ipDelCliente(req);
  const ahora = Date.now();
  const recientes = (intentosLogin.get(ip) ?? []).filter((t) => ahora - t < 60_000);
  if (recientes.length >= LOGIN_POR_MINUTO) {
    intentosLogin.set(ip, recientes);
    return true;
  }
  recientes.push(ahora);
  intentosLogin.set(ip, recientes);
  return false;
}
setInterval(() => {
  const ahora = Date.now();
  for (const [ip, ts] of intentosLogin) if (ts.every((t) => ahora - t >= 60_000)) intentosLogin.delete(ip);
}, 60_000).unref();

/* ── 1. Aviso de seguridad ─────────────────────────────────────────────── */
console.log(
  [
    "",
    SIN_TUNEL
      ? "  SIN TÚNEL: sólo el filtro en esta PC (127.0.0.1), nada queda abierto en internet."
      : FIJO
        ? "  ATENCIÓN: mientras esto esté prendido, el panel de esta PC queda abierto en\n" +
          "  internet en una dirección FIJA (siempre la misma: alguien puede encontrarla).\n" +
          "  Por el túnel sólo pasan la entrada, el panel y Cámaras con sus avisos; lo\n" +
          "  demás da 404. La clave de tu usuario es lo que la protege: que sea buena."
        : "  ATENCIÓN: mientras esto esté prendido, el panel de esta PC queda abierto en\n" +
          "  internet en una dirección al azar. Por el túnel sólo pasan la entrada, el\n" +
          "  panel y Cámaras con sus avisos; lo demás da 404 (las otras pestañas no\n" +
          "  cargan desde el celular). Apágalo con Ctrl+C apenas termines y no compartas\n" +
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
  if (req.method === "GET" && String(req.url).split("?")[0] === CANARIO) {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-tunel-filtro": MARCA });
    res.end("filtro\n");
    return;
  }
  if (loginExcedido(req)) {
    log(`entrada frenada: más de ${LOGIN_POR_MINUTO} intentos en 1 min desde ${ipDelCliente(req)}`);
    res.writeHead(429, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": "60" });
    res.end(JSON.stringify({ error: "Demasiados intentos de entrar. Espera un minuto y vuelve a probar." }));
    return;
  }
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

await new Promise((ok) => {
  filtro.once("error", (err) => {
    log(`no pude abrir el filtro en :${PUERTO_FILTRO_PEDIDO}: ${err.code ?? err.message}`);
    process.exit(1);
  });
  filtro.listen(PUERTO_FILTRO_PEDIDO, "127.0.0.1", ok);
});
const PUERTO_FILTRO = filtro.address().port;
const HACIA = `http://127.0.0.1:${PUERTO_FILTRO}`;

/* ── 4. El túnel (siempre hacia el filtro, nunca al dev server) ────────── */
let apagando = false;
let vigia = null;
let tunel = null;
let urlPublica = null;
const ultimas = [];
const NOMBRE_PROV = { rapido: "cloudflared", tailscale: "tailscale funnel", ngrok: "ngrok", cloudflare: "cloudflared" }[PROVEEDOR];

/* Tailscale: el CLI habla con tailscaled; sin servicio o sin sesión no hay
   funnel, y eso lo resuelve Brandon con 1-2 comandos (los imprime). */
const ts = (...a) => [...(TS_SOCKET ? [`--socket=${TS_SOCKET}`] : []), ...a];
const tsCmd = (resto) => `tailscale${TS_SOCKET ? ` --socket=${TS_SOCKET}` : ""} ${resto}`;
function tsJson(...a) {
  try {
    const out = execFileSync(TAILSCALE, ts(...a), { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] });
    return { j: JSON.parse(out || "{}") };
  } catch (err) {
    return { error: err.code === "ENOENT" ? "ENOENT" : `${err.stderr ?? ""}${err.stdout ?? ""}`.trim() || String(err.message) };
  }
}
const hayFunnel = (c) =>
  Object.values(c?.AllowFunnel ?? {}).some(Boolean) || Object.values(c?.Foreground ?? {}).some(hayFunnel);
const SUBIR = tsCmd("up --operator=$USER --hostname=buleje-panel --accept-dns=false");

/** `{ pasos }` con lo que falta (para escribir en el chat con `!`) o `{ url }`. */
function revisarTailscale() {
  const st = tsJson("status", "--json");
  if (st.error === "ENOENT") return { pasos: [`no encuentro \`${TAILSCALE}\`. Instálalo:`, "! curl -fsSL https://tailscale.com/install.sh | sh"] };
  if (st.error) {
    return {
      pasos: [
        `Tailscale está instalado pero su servicio no corre («${st.error.split("\n")[0].slice(0, 90)}»). Escribe en el chat:`,
        existsSync("/run/systemd/system") && !TS_SOCKET
          ? "! sudo systemctl enable --now tailscaled"
          : "! sudo sh -c 'tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state > /var/log/tailscaled.log 2>&1 &'",
        "y vuelve a correr esto (te dirá el paso siguiente).",
      ],
    };
  }
  const estado = st.j.BackendState;
  if (estado === "NeedsMachineAuth") return { pasos: ["Tailscale espera que apruebes esta PC: entra a https://login.tailscale.com/admin/machines y apruébala."] };
  if (estado !== "Running" || !st.j.Self?.DNSName) {
    return {
      pasos: [
        `Tailscale no tiene sesión (estado: ${estado ?? "?"}). Escribe en el chat:`,
        `! sudo ${SUBIR}`,
        "Abre el enlace https://login.tailscale.com/… que sale y entra con tu cuenta de Google.",
        "Después vuelve a correr esto (la 1.ª vez te da otro enlace para «Enable Funnel»).",
      ],
    };
  }
  const fun = tsJson("funnel", "status", "--json");
  if (!fun.error && hayFunnel(fun.j)) {
    return {
      pasos: [
        "Ya hay un funnel de Tailscale prendido (puede ir directo al dev server, SIN filtro):",
        `    ${JSON.stringify(fun.j.Web ?? fun.j).slice(0, 200)}`,
        "Apágalo y vuelve a correr esto:",
        `! ${tsCmd("funnel reset")}`,
      ],
    };
  }
  return { url: `https://${String(st.j.Self.DNSName).replace(/\.$/, "")}` };
}

/* Si el funnel quedó prendido apuntando al filtro (tailscale murió raro), se apaga. */
function cerrarFunnelQueQuedo() {
  if (PROVEEDOR !== "tailscale" || !tunel) return;
  const nuestro = (c) => JSON.stringify(c ?? {}).includes(`127.0.0.1:${PUERTO_FILTRO}"`);
  const fun = tsJson("funnel", "status", "--json");
  if (fun.error || !nuestro(fun.j)) return;
  try {
    execFileSync(TAILSCALE, ts("funnel", "--https=443", "off"), { timeout: 10_000, stdio: "ignore" });
  } catch (err) {
    log(`tailscale funnel off falló: ${String(err.message).slice(0, 120)}`);
  }
  const otra = tsJson("funnel", "status", "--json");
  if (!otra.error && nuestro(otra.j)) log(`OJO: el funnel sigue prendido. Apágalo con  ! ${tsCmd("funnel reset")}`);
}

function urlDeLinea(l) {
  if (PROVEEDOR === "rapido") return l.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (PROVEEDOR === "tailscale") return l.match(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.ts\.net/i)?.[0];
  if (PROVEEDOR === "ngrok") return /started tunnel/.test(l) ? l.match(/url=(https:\/\/[^\s"]+)/)?.[1] : undefined;
  return /Registered tunnel connection/.test(l) ? `https://${DOMINIO}` : undefined;
}

function leerSalida(trozo) {
  for (const linea of String(trozo).split("\n")) {
    const l = linea.trim();
    if (!l) continue;
    ultimas.push(l);
    if (ultimas.length > 20) ultimas.shift();
    const url = urlDeLinea(l);
    if (url && !urlPublica) {
      urlPublica = url.replace(/\/$/, "");
      mostrar(urlPublica).catch((err) => log(`no se pudo mostrar la dirección: ${String(err)}`));
    } else if (PROVEEDOR === "tailscale" && /login\.tailscale\.com|not enabled|denied|operator|error|failed/i.test(l)) {
      log(`tailscale: ${l.slice(0, 220)}`);
      if (/denied|operator|permission/i.test(l)) log(`  si es por permiso, escribe en el chat:  ! sudo ${tsCmd("set --operator=$USER")}`);
    } else if (PROVEEDOR === "ngrok" && /lvl=(eror|crit)|ERR_NGROK/.test(l) && !apagando) {
      log(`ngrok: ${l.slice(0, 220)}`);
    } else if (/\bERR\b/.test(l) && urlPublica && !apagando) {
      log(`${NOMBRE_PROV}: ${l.replace(/^\S+\s+ERR\s+/, "").slice(0, 160)}`);
    }
  }
}

const AYUDA_INSTALAR = {
  rapido: `Instálalo o pasa CLOUDFLARED=/ruta/al/binario.`,
  cloudflare: `Instálalo o pasa CLOUDFLARED=/ruta/al/binario.`,
  tailscale: `Instálalo:  ! curl -fsSL https://tailscale.com/install.sh | sh`,
  ngrok: `Descárgalo de https://ngrok.com/download y después  ! ngrok config add-authtoken <tu token de dashboard.ngrok.com>`,
};
const AYUDA_SIN_URL = {
  rapido: "(¿hay internet?)",
  tailscale: "(si salió un enlace «To enable, visit», ábrelo y toca Enable; después vuelve a correr esto)",
  ngrok: "(¿pusiste el authtoken y el dominio es el tuyo de dashboard.ngrok.com/domains?)",
  cloudflare: `(¿hiciste una vez  ! cloudflared tunnel login  ,  ! cloudflared tunnel create ${NOMBRE_TUNEL}  y  ! cloudflared tunnel route dns ${NOMBRE_TUNEL} ${DOMINIO || "<dominio>"}  ?)`,
};
/* Tailscale espera a que Brandon toque «Enable Funnel» la 1.ª vez: más plazo. */
const PLAZO_URL = PROVEEDOR === "tailscale" ? 10 * 60_000 : 60_000;
let plazoUrl = null;

/* Si este Node muere sin avisar (kill -9, sin memoria: 137), el kernel le
   manda SIGINT al hijo (`setpriv --pdeathsig`, sobrevive al exec): el túnel
   no queda huérfano con la dirección abierta hacia un puerto muerto que otro
   programa podría tomar. */
const SETPRIV = "/usr/bin/setpriv";
function conPdeathsig(cmd, argv) {
  if (existsSync(SETPRIV)) return [SETPRIV, ["--pdeathsig", "INT", "--", cmd, ...argv]];
  log("OJO: no está setpriv; si este proceso muere de golpe, apaga el túnel a mano.");
  return [cmd, argv];
}
function existeComando(cmd) {
  if (cmd.includes("/")) return existsSync(cmd);
  return (process.env.PATH ?? "").split(":").some((d) => d && existsSync(path.join(d, cmd)));
}

function abrirTunel() {
  if (PROVEEDOR === "tailscale") {
    const r = revisarTailscale();
    if (r.pasos) {
      console.log("");
      for (const l of r.pasos) console.log(`  ${l}`);
      console.log("");
      return apagar(1);
    }
    log(`Tailscale listo; la dirección fija será ${r.url}`);
  }
  const comando = {
    rapido: [CLOUDFLARED, ["tunnel", "--no-autoupdate", "--url", HACIA]],
    tailscale: [TAILSCALE, ts("funnel", HACIA)], // en primer plano: si se cae, el funnel se apaga con él
    // sin inspector: el de ngrok (127.0.0.1:4040) guarda cada pedido, también la clave del login
    ngrok: [NGROK, ["http", HACIA, `--url=https://${DOMINIO}`, "--inspect=false", "--log=stdout", "--log-format=logfmt"]],
    cloudflare: [CLOUDFLARED, ["tunnel", "--no-autoupdate", "run", "--url", HACIA, NOMBRE_TUNEL]],
  }[PROVEEDOR];
  if (!existeComando(comando[0])) {
    log(`no encuentro ${NOMBRE_PROV} (${comando[0]}). ${AYUDA_INSTALAR[PROVEEDOR]}`);
    return apagar(1);
  }
  log(`arrancando ${NOMBRE_PROV} hacia el filtro :${PUERTO_FILTRO} (dev server en :${PUERTO})…`);
  tunel = spawn(...conPdeathsig(comando[0], comando[1]), { stdio: ["ignore", "pipe", "pipe"] });
  tunel.on("error", (err) => {
    log(`no se pudo arrancar ${NOMBRE_PROV} (${comando[0]}): ${err.message}. ${AYUDA_INSTALAR[PROVEEDOR]}`);
    apagar(1);
  });
  tunel.stdout.on("data", leerSalida);
  tunel.stderr.on("data", leerSalida);
  tunel.on("exit", (code) => {
    if (apagando) return;
    log(`${NOMBRE_PROV} se cerró (código ${code}).${urlPublica ? "" : ` ${AYUDA_SIN_URL[PROVEEDOR]} Últimas líneas:`}`);
    if (!urlPublica) for (const l of ultimas.slice(-8)) console.log(`    ${l}`);
    apagar(1);
  });
  plazoUrl = setTimeout(() => {
    if (urlPublica) return;
    log(`${NOMBRE_PROV} no dio la dirección en ${PLAZO_URL / 60_000} min ${AYUDA_SIN_URL[PROVEEDOR]}. Últimas líneas:`);
    for (const l of ultimas.slice(-8)) console.log(`    ${l}`);
    apagar(1);
  }, PLAZO_URL);
}

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
      FIJO
        ? "  Hazlo UNA sola vez: esta dirección es siempre la misma y la suscripción sirve\n" +
          "  para siempre (guárdala en favoritos). Activarlo de nuevo suma otro «celular»."
        : "  Hazlo UNA sola vez: cada vez que corres esto la dirección cambia, y activarlo\n" +
          "  de nuevo suma otro «celular» (aviso doble). Para una dirección fija: --fijo",
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
   WSL, que además recuerda el «no existe» un rato). Con Tailscale, la 1.ª vez
   saca el certificado HTTPS al primer pedido (10-60 s). Se pide el CANARIO:
   sólo el filtro de esta corrida lo contesta con `x-tunel-filtro: MARCA`. Un
   5xx o el «endpoint offline» de ngrok es el borde todavía sin origen: se
   espera. Cualquier otra respuesta sin la marca = la dirección llega a otro
   lado (al dev server directo) → se apaga todo. */
async function esperarQueConteste(url) {
  const hasta = Date.now() + 180_000;
  while (!apagando && Date.now() < hasta) {
    let r = null;
    try {
      r = await fetch(`${url}${CANARIO}`, {
        redirect: "manual",
        headers: { "cache-control": "no-store", "ngrok-skip-browser-warning": "1" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      /* DNS o certificado todavía no */
    }
    if (r && r.headers.get("x-tunel-filtro") === MARCA) {
      return log("el túnel ya contesta y pasa por el filtro: ya puedes abrirlo en el celular.");
    }
    if (r && r.status < 500 && !r.headers.get("ngrok-error-code")) {
      log(
        `PELIGRO: ${url} contesta (HTTP ${r.status}) pero NO pasa por el filtro de esta PC: el túnel llega a otro ` +
          "lado (¿uno de Cloudflare configurado en su panel web hacia el dev server?). Apago todo; revisa a dónde apunta.",
      );
      return apagar(1);
    }
    await new Promise((ok) => setTimeout(ok, 3_000));
  }
  if (!apagando) log("el túnel no contestó desde esta PC en 3 min (no pude comprobar que pase por el filtro); prueba igual en el celular (a veces es sólo el DNS de la PC).");
}

/* ── 5. Vigía (opcional) ───────────────────────────────────────────────── */
function arrancarVigia() {
  const envLocal = path.join(RAIZ, ".env.local");
  const flags = existsSync(envLocal) ? [`--env-file=${envLocal}`] : [];
  vigia = spawn(...conPdeathsig(process.execPath, [...flags, path.join(RAIZ, "scripts/camaras-vigia.mjs")]), {
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
  // tailscale en primer plano se apaga con SIGINT (lo mismo que Ctrl+C)
  const hijos = [tunel, vigia].filter((h) => h && h.exitCode === null && h.signalCode === null);
  for (const h of hijos) h.kill(h === vigia || PROVEEDOR === "tailscale" ? "SIGINT" : "SIGTERM");
  filtro.close();
  filtro.closeAllConnections?.();
  const fin = () => {
    cerrarFunnelQueQuedo();
    const que = SIN_TUNEL ? "el filtro" : CON_VIGIA ? "el túnel y el vigía" : "el túnel";
    const dir = SIN_TUNEL ? "" : FIJO ? "; la dirección fija queda cerrada hasta la próxima vez" : "; la dirección dejó de existir";
    log(!SIN_TUNEL && !urlPublica ? "apagado: no quedó nada abierto en internet." : `apagado: ${que} ya no corre${dir}.`);
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

if (SIN_TUNEL) {
  log(`filtro en ${HACIA} hacia el dev server de :${PUERTO} (sin túnel; IP del cliente como en «${PROVEEDOR}»). Ctrl+C para apagar.`);
} else {
  abrirTunel();
}
