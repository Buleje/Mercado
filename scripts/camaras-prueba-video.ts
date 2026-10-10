/**
 * Prueba de punta a punta del video en vivo, sin comprar nada (05-10).
 *
 *   cámara RTSP → `lib/camaras/hls.ts` (ffmpeg → HLS) → navegador → `VisorEnVivo`
 *
 * Sin `CAMARA_RTSP` simula la cámara: MediaMTX (servidor RTSP) + un ffmpeg que
 * le publica una imagen de prueba con la HORA quemada, en la misma ruta que una
 * Hikvision (`/Streaming/Channels/102`, H.264 640×360 25 fps, un cuadro llave
 * cada 2 s, 512 kb/s). Con `CAMARA_RTSP` prueba una cámara de verdad (la URL va
 * por variable de entorno, no por argumento: los argumentos se ven en `ps`).
 *
 * ## Qué NO toca
 *
 * La base. Para que la pestaña muestre una cámara conectada, el navegador ve la
 * lista de cámaras real con una cámara simulada agregada (Playwright `route`), y
 * los pedidos de video de ESA cámara los atiende este proceso con las MISMAS
 * funciones que usa la ruta (`abrirVivo` y `leerOReabrir`). Lo que no se prueba
 * así es la sesión y la búsqueda de la cámara en la base: eso lo cubre
 * `__tests__/camaras-ruta-vivo.test.ts`.
 *
 * ## Qué mide
 *
 * Segundos hasta el primer pedazo y hasta el primer cuadro en pantalla, el
 * retraso contra la hora quemada, CPU/RAM del ffmpeg, pedidos por minuto por
 * pestaña, cuántos ffmpeg con N pestañas, si revive tras la pestaña de fondo, y
 * cuánto tarda en apagarse al cerrar.
 *
 * Uso (dev server en :3000 para la parte del navegador):
 *   npx tsx scripts/camaras-prueba-video.ts
 *     [--sin-navegador] [--pestanas 3] [--capturas <dir>] [--canal 102|101]
 *     [--forzar-hlsjs] [--csp-arreglada] [--solo-ver]
 *   `--canal 101` publica el flujo PRINCIPAL en H.265 (1080p): lo que pasa si la
 *   cámara manda H.265 al visor.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import Module from "node:module";
import type { Stream } from "@/lib/camaras/hls";
import { resolverChromium } from "./dev-helpers/chromium-path.mjs";

/* `hls.ts` empieza con `import "server-only"`, que fuera de Next no existe:
   se resuelve al vacío de Next antes de cargarlo (por eso va con `import()`). */
const M = Module as unknown as { _resolveFilename: (pedido: string, ...resto: unknown[]) => string };
const resolverOriginal = M._resolveFilename;
M._resolveFilename = function (pedido: string, ...resto: unknown[]) {
  if (pedido === "server-only") return path.join(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js");
  return resolverOriginal.call(this, pedido, ...resto);
};
let H: typeof import("@/lib/camaras/hls");

const BASE = process.env.QA_BASE ?? "http://localhost:3000";
const TENANT = process.env.QA_TENANT ?? "main";
const ID = "cam-sim";
const CLAVE = `qa-prueba:${ID}`;
const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : (process.argv[i + 1] ?? d);
};
const bandera = (n: string) => process.argv.includes(`--${n}`);
const PESTANAS = Number(arg("pestanas", "3"));
const CAPTURAS = arg("capturas", path.join(tmpdir(), "camaras-prueba-video"));
const CANAL = arg("canal", "102");
const seg = (ms: number) => Math.round(ms / 100) / 10;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.error("[prueba-video]", ...a);

const hijos: ChildProcess[] = [];
let consolaGlobal: string[] = [];
const temporales: string[] = [];
function limpiar() {
  H?.detenerStream(CLAVE);
  for (const h of hijos) if (h.exitCode === null) h.kill("SIGTERM");
  for (const t of temporales) rmSync(t, { recursive: true, force: true });
}
for (const senal of ["SIGINT", "SIGTERM"] as const)
  process.on(senal, () => {
    limpiar();
    process.exit(130);
  });

// ─── La cámara simulada ─────────────────────────────────────────────────────

function mediamtx(): string | null {
  const candidatos = [process.env.MEDIAMTX, path.join(homedir(), ".local/opt/mediamtx/mediamtx"), "mediamtx"];
  for (const c of candidatos) if (c && spawnSync(c, ["--version"], { stdio: "ignore" }).status === 0) return c;
  return null;
}

const puertoAbierto = (puerto: number) =>
  new Promise<boolean>((r) => {
    const s = connect(puerto, "127.0.0.1", () => {
      s.end();
      r(true);
    });
    s.on("error", () => r(false));
  });

async function simularCamara(): Promise<string> {
  const bin = mediamtx();
  if (!bin) throw new Error("Falta MediaMTX: bájalo a ~/.local/opt/mediamtx/ (ver docs/camaras/video-real.md)");
  const dir = mkdtempSync(path.join(tmpdir(), "camara-sim-"));
  temporales.push(dir);
  const clave = randomBytes(9).toString("base64url");
  const conf = path.join(dir, "mediamtx.yml");
  writeFileSync(
    conf,
    [
      "logLevel: warn",
      "rtspAddress: 127.0.0.1:8554",
      "rtspTransports: [tcp]",
      "rtmp: false", "hls: false", "webrtc: false", "srt: false", "moq: false",
      "api: false", "metrics: false", "pprof: false", "playback: false",
      "authInternalUsers:",
      "  - user: visor",
      `    pass: ${clave}`,
      "    ips: ['127.0.0.1/32']",
      "    permissions:",
      "      - action: publish",
      "      - action: read",
      "paths:",
      "  all_others:",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  log("MediaMTX en 127.0.0.1:8554");
  const srv = spawn(bin, [conf], { stdio: ["ignore", "ignore", "inherit"] });
  hijos.push(srv);
  for (let i = 0; i < 50 && !(await puertoAbierto(8554)); i++) await dormir(100);

  const rtsp = `rtsp://visor:${clave}@127.0.0.1:8554/Streaming/Channels/${CANAL}`;
  const h265 = CANAL === "101";
  /* La hora quemada en la imagen: con la captura y su `Date.now()` se lee el
     retraso real, de la cámara a la pantalla. */
  const hora = "drawtext=text='%{localtime\\:%T}':fontsize=64:fontcolor=white:box=1:boxcolor=black@0.7:x=24:y=24";
  const pub = spawn(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-re",
      "-f", "lavfi", "-i", `testsrc2=size=${h265 ? "1920x1080" : "640x360"}:rate=25`,
      "-vf", hora,
      ...(h265
        ? ["-c:v", "libx265", "-preset", "ultrafast", "-x265-params", "keyint=50:min-keyint=50:log-level=error", "-b:v", "2M"]
        : ["-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-g", "50", "-keyint_min", "50",
           "-b:v", "512k", "-maxrate", "512k", "-bufsize", "1M"]),
      "-pix_fmt", "yuv420p",
      "-f", "rtsp", "-rtsp_transport", "tcp", rtsp,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  hijos.push(pub);
  await dormir(1500);
  return rtsp;
}

// ─── Medir el ffmpeg del stream ─────────────────────────────────────────────

function registro(): Map<string, Stream> {
  return (globalThis as unknown as { __camarasHls?: Map<string, Stream> }).__camarasHls ?? new Map();
}
const pidDelStream = () => registro().get(CLAVE)?.proceso.pid ?? null;
const ffmpegsDelVisor = () =>
  Number(spawnSync("pgrep", ["-c", "-f", "^ffmpeg .*camara-hls-"], { encoding: "utf8" }).stdout.trim() || 0);

function ticks(pid: number): number {
  const campos = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1]!.split(" ");
  return Number(campos[11]) + Number(campos[12]); // utime + stime
}
async function cpuYRam(pid: number, ventanaMs: number) {
  const hz = 100;
  const a = ticks(pid);
  await dormir(ventanaMs);
  const b = ticks(pid);
  const rss = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, "utf8"))?.[1];
  return { cpuPctDeUnNucleo: Math.round(((b - a) / hz / (ventanaMs / 1000)) * 1000) / 10, ramMB: Math.round(Number(rss) / 1024) };
}

function probarSegmento(): Record<string, unknown> | null {
  const s = registro().get(CLAVE);
  if (!s) return null;
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,r_frame_rate:format=duration,bit_rate", "-of", "json", path.join(s.carpeta, "s000.ts")],
    { encoding: "utf8" },
  );
  try {
    const j = JSON.parse(r.stdout) as { streams?: Record<string, unknown>[]; format?: Record<string, unknown> };
    return { ...j.streams?.[0], ...j.format };
  } catch {
    return null;
  }
}

async function esperarApagado(desde: number, topeMs = 70_000): Promise<number | null> {
  while (Date.now() - desde < topeMs) {
    if (!registro().has(CLAVE)) return seg(Date.now() - desde);
    await dormir(500);
  }
  return null;
}

// ─── El navegador ───────────────────────────────────────────────────────────

async function navegador(rtsp: string, informe: Record<string, unknown>) {
  const chrome = resolverChromium();
  if (!chrome) throw new Error("No hay Chromium de Playwright");
  mkdirSync(CAPTURAS, { recursive: true });
  /* Un documento servido por `route.fulfill` no tiene dirección: Chrome lo trata
     como «público» y le bloquea todo lo de localhost (página en blanco). Sólo
     hace falta al reescribir la CSP. */
  const browser = await chromium.launch({
    headless: true,
    executablePath: chrome,
    args: bandera("csp-arreglada") ? ["--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests"] : [],
  });
  try {
    await recorrido(browser, rtsp, informe);
  } finally {
    await browser.close();
  }
}

async function recorrido(browser: Browser, rtsp: string, informe: Record<string, unknown>) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-tenant-id": TENANT } });
  /* tsx compila con «keepNames»: las funciones que se mandan a la página llegan
     envueltas en `__name(...)`, que allá no existe. */
  await ctx.addInitScript("globalThis.__name = (f) => f;");
  await ctx.addInitScript((slug: string) => {
    try {
      localStorage.setItem("active-tenant-slug", slug);
      localStorage.setItem(`onboarding-completed-${slug}`, "1");
      localStorage.setItem("onboarding-completed-main", "1");
    } catch { /* sin storage */ }
    const w = window as unknown as { __primerCuadro?: number; __cuadros?: number[] };
    document.addEventListener("playing", () => {
      w.__cuadros = [...(w.__cuadros ?? []), Date.now()];
      w.__primerCuadro ??= Date.now();
    }, true);
  }, TENANT);

  /* `--forzar-hlsjs`: el navegador dice que NO sabe HLS por su cuenta, así el
     visor usa hls.js (lo que pasa en Firefox, o lo que pasaría si el visor
     prefiriera hls.js). Chrome 149 dice «maybe» pero no lo reproduce (05-10:
     DEMUXER_ERROR_COULD_NOT_PARSE con .ts y con fMP4). */
  if (bandera("forzar-hlsjs"))
    await ctx.addInitScript(() => {
      const original = HTMLMediaElement.prototype.canPlayType;
      HTMLMediaElement.prototype.canPlayType = function (tipo: string) {
        return /mpegurl/i.test(tipo) ? "" : original.call(this, tipo);
      };
    });
  /* `--csp-arreglada`: la CSP del panel con lo que hls.js necesita (el CDN de
     donde se baja y `blob:` para el video de MSE). Simula el arreglo propuesto
     sin tocar `lib/middleware-utils.ts`. */
  if (bandera("csp-arreglada"))
    await ctx.route((u) => u.pathname === "/admin", async (route) => {
      const resp = await route.fetch();
      const h = { ...resp.headers() };
      /* El cuerpo de `route.fetch()` ya viene descomprimido: con su
         `content-encoding` original el navegador lo lee como basura (página en blanco). */
      delete h["content-encoding"];
      delete h["content-length"];
      delete h["transfer-encoding"];
      const csp = h["content-security-policy"];
      if (csp)
        h["content-security-policy"] = csp
          .replace("script-src ", "script-src https://cdnjs.cloudflare.com ")
          .replace("media-src 'self'", "media-src 'self' blob:");
      log("documento /admin", resp.status(), (await resp.body()).length, "csp:", Boolean(csp));
      await route.fulfill({ response: resp, headers: h });
    });
  const consola: string[] = [];
  ctx.on("console", (m) => {
    if (m.type() === "error" && (bandera("toda-la-consola") || /Content Security Policy|hls/i.test(m.text())))
      consola.push(m.text().slice(0, 160));
  });
  ctx.on("weberror", (e) => consola.push(`pageerror: ${String(e.error().message).slice(0, 160)}`));
  informe.consolaCspOHls = consola;
  consolaGlobal = consola;

  /* Login como qa-capturas: cookie csrf de /api/health y POST del login. */
  const p0 = await ctx.newPage();
  await p0.request.get(`${BASE}/api/health`, { timeout: 90_000 });
  const csrf = (await ctx.cookies()).find((c) => c.name === "csrf-token")?.value ?? "";
  const r = await p0.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": TENANT, "x-csrf-token": csrf },
    data: { username: process.env.QA_USER ?? "qaadmin", password: process.env.QA_PASS ?? "Qa-admin-1234", tenantSlug: TENANT },
  });
  if (r.status() !== 200) throw new Error(`login ${r.status()}`);
  log("sesión iniciada");
  await p0.close();

  const pedidos: { t: number; nombre: string; edadMs?: number; rango: string | null; estado: number }[] = [];
  let vivoPedidoEn = 0;
  await ctx.route((u) => u.pathname === "/api/admin/camaras", async (route) => {
    const resp = await route.fetch();
    const j = (await resp.json()) as { camaras?: unknown[] };
    j.camaras = [
      {
        id: ID, nombre: "Portón (simulada)", lugar: "Portón", token: "x".repeat(32), activa: true,
        creadaEn: "2026-10-05T00:00:00.000Z", ultimaCapturaEn: null,
        conexion: {
          host: "127.0.0.1", puerto: 80, usuario: "visor", https: false, canal: 1,
          modelo: "Cámara simulada (MediaMTX)", firmware: null, serie: null, soportaPtz: false,
          probadaEn: new Date().toISOString(), ultimaFalla: null, ultimaFallaTexto: null,
        },
      },
      ...(j.camaras ?? []),
    ];
    await route.fulfill({ response: resp, json: j });
  });
  await ctx.route((u) => u.pathname.startsWith(`/api/admin/camaras/${ID}/`), async (route) => {
    const ruta = new URL(route.request().url()).pathname;
    const resto = ruta.slice(`/api/admin/camaras/${ID}/`.length);
    if (resto === "vivo") {
      vivoPedidoEn = Date.now();
      const a = await H.abrirVivo(CLAVE, rtsp);
      return route.fulfill({
        json: a.ok ? { disponible: true, lista: `/api/admin/camaras/${ID}/vivo/vivo.m3u8` } : { disponible: false, motivo: a.motivo },
      });
    }
    if (resto.startsWith("vivo/")) {
      const nombre = resto.slice(5);
      const s = registro().get(CLAVE);
      let edadMs: number | undefined;
      if (s && nombre.endsWith(".ts") && existsSync(path.join(s.carpeta, nombre)))
        edadMs = Date.now() - statSync(path.join(s.carpeta, nombre)).mtimeMs;
      const l = await H.leerOReabrir(CLAVE, nombre, () => rtsp);
      pedidos.push({ t: Date.now(), nombre, edadMs, rango: route.request().headers()["range"] ?? null, estado: l.ok ? 200 : 404 });
      if (!l.ok) return route.fulfill({ status: 404, json: { error: l.motivo } });
      return route.fulfill({ status: 200, body: l.datos, headers: { "content-type": l.tipo, "cache-control": "no-store" } });
    }
    return route.fulfill({ status: 404, json: { error: "simulada: sólo video" } });
  });

  const abrirPestana = async (): Promise<{ page: Page; primerCuadroMs: number | null }> => {
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(`${BASE}/admin?tab=camaras&vista=camaras`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    log("pestaña cargada", seg(Date.now() - t0));
    const video = page.locator(`video[aria-label="Video en vivo de Portón (simulada)"]`);
    try {
      await video.waitFor({ timeout: 45_000 });
    } catch {
      /* Si el visor arranca oculto (rediseño del botón «Ver en vivo»), se abre. */
      try {
        await page.locator(`[aria-label="Ver Portón (simulada) ahora"]`).first().click({ timeout: 10_000 });
        await video.waitFor({ timeout: 30_000 });
      } catch (e) {
        /* Sin <video>: el visor cayó a fotos. Se anota por qué (la nota del pie)
           en vez de cortar la prueba. */
        await page.evaluate(() => document.querySelector('[aria-label^="Cuadro en vivo"], img[alt^="Cuadro en vivo"]')?.scrollIntoView({ block: "center" }));
        await page.screenshot({ path: path.join(CAPTURAS, "sin-video.png") });
        const nota = await page.evaluate(() =>
          [...document.querySelectorAll("span[aria-live]")].map((x) => x.textContent?.trim()).filter(Boolean).join(" | "),
        );
        throw new Error(`el visor no mostró video: ${nota || String(e).split("\n")[0]}`);
      }
    }
    await page.waitForFunction(() => (window as unknown as { __primerCuadro?: number }).__primerCuadro, null, { timeout: 30_000 }).catch(() => null);
    const primer = await page.evaluate(() => (window as unknown as { __primerCuadro?: number }).__primerCuadro ?? null);
    return { page, primerCuadroMs: primer ? primer - t0 : null };
  };

  // 1 · Primera pestaña: el arranque en frío lo hizo la fase del servidor; se apaga y se vuelve a medir desde el navegador.
  H.detenerStream(CLAVE);
  log("abriendo la primera pestaña");
  const p1 = await abrirPestana();
  log("primera pestaña", p1.primerCuadroMs);
  informe.primeraPestana = {
    segundosHastaPrimerCuadro: p1.primerCuadroMs === null ? null : seg(p1.primerCuadroMs),
    segundosDesdeQueElVisorPideVideo: await p1.page.evaluate(
      (pedido) => {
        const t = (window as unknown as { __primerCuadro?: number }).__primerCuadro;
        return t ? Math.round((t - pedido) / 100) / 10 : null;
      },
      vivoPedidoEn,
    ),
    modo: await p1.page.evaluate(() => [...document.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent?.trim()).filter(Boolean).join(" | ")),
    nota: await p1.page.evaluate(() => document.querySelector("video")?.closest("div.overflow-hidden")?.querySelector("[aria-live]:last-child")?.textContent ?? null),
    hlsNativo: await p1.page.evaluate(() => document.createElement("video").canPlayType("application/vnd.apple.mpegurl")),
  };
  await dormir(8000);

  /* Retraso: la hora quemada en el cuadro vs la hora en que se sacó. El cuadro
     sale del <video> por un canvas (lo que el navegador está mostrando), no de
     la captura de pantalla: el headless a veces no pinta el video en la foto. */
  const capturas: Record<string, string> = {};
  for (let i = 0; i < 3; i++) {
    const cuadro = await p1.page.evaluate(() => {
      const v = document.querySelector("video");
      if (!v || !v.videoWidth) return null;
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const g = c.getContext("2d");
      if (!g) return null;
      g.drawImage(v, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height).data;
      let suma = 0;
      for (let k = 0; k < px.length; k += 4) suma += px[k]! + px[k + 1]! + px[k + 2]!;
      return { en: Date.now(), brillo: Math.round(suma / (px.length / 4) / 3), png: c.toDataURL("image/png") };
    });
    if (cuadro) {
      const en = new Date(cuadro.en);
      const hora = en.toLocaleTimeString("es-PE", { hour12: false, timeZone: "America/Lima" }) + `.${String(en.getMilliseconds()).padStart(3, "0")}`;
      const archivo = path.join(CAPTURAS, `cuadro-${i}.png`);
      writeFileSync(archivo, Buffer.from(cuadro.png.split(",")[1]!, "base64"));
      capturas[archivo] = `sacado ${hora} · brillo medio ${cuadro.brillo}/255`;
    }
    await dormir(2000);
  }
  for (const ancho of [1280, 400]) {
    await p1.page.setViewportSize({ width: ancho, height: 900 });
    await dormir(1500);
    await p1.page.evaluate(() => document.querySelector("video")?.scrollIntoView({ block: "center" }));
    await dormir(300);
    const archivo = path.join(CAPTURAS, `visor-simulada-${ancho}.png`);
    const en = new Date();
    await p1.page.screenshot({ path: archivo });
    capturas[archivo] = en.toLocaleTimeString("es-PE", { hour12: false, timeZone: "America/Lima" }) + `.${String(en.getMilliseconds()).padStart(3, "0")}`;
  }
  await p1.page.setViewportSize({ width: 1280, height: 900 });
  informe.capturas = capturas;
  informe.reproductor = await p1.page.evaluate(() => {
    const v = document.querySelector("video");
    if (!v) return null;
    const fin = v.seekable.length ? v.seekable.end(v.seekable.length - 1) : null;
    const buf = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : null;
    return {
      ancho: v.videoWidth, alto: v.videoHeight, pausado: v.paused,
      detrasDelBordeSeg: fin === null ? null : Math.round((fin - v.currentTime) * 10) / 10,
      bufferAdelanteSeg: buf === null ? null : Math.round((buf - v.currentTime) * 10) / 10,
    };
  });
  /* Qué pide el reproductor en 10 s: con HLS nativo de Chrome se midieron
     miles de pedidos por minuto; esto dice cuáles. */
  const marca = Date.now();
  await dormir(10_000);
  const ventana = pedidos.filter((p) => p.t >= marca);
  const porNombre: Record<string, number> = {};
  for (const p of ventana) {
    const k = `${p.nombre.endsWith(".ts") ? "segmento" : p.nombre} ${p.estado}${p.rango ? ` rango=${p.rango}` : ""}`;
    porNombre[k] = (porNombre[k] ?? 0) + 1;
  }
  informe.pedidosEn10sUnaPestana = { total: ventana.length, porNombre };
  if (bandera("solo-ver")) return;
  const edades = pedidos.filter((p) => p.edadMs !== undefined).map((p) => p.edadMs!);
  informe.edadDelSegmentoAlPedirloSeg = edades.length ? seg(edades.reduce((a, b) => a + b, 0) / edades.length) : null;

  log("capturas listas; abriendo más pestañas");
  // 2 · Varias pestañas a la vez.
  const otras: Page[] = [];
  const tiemposOtras: (number | null)[] = [];
  for (let i = 1; i < PESTANAS; i++) {
    const p = await abrirPestana();
    otras.push(p.page);
    tiemposOtras.push(p.primerCuadroMs === null ? null : seg(p.primerCuadroMs));
  }
  const desde = Date.now();
  const antes = pedidos.length;
  const pid = pidDelStream();
  const uso = pid ? await cpuYRam(pid, 30_000) : null;
  const porMinuto = Math.round(((pedidos.length - antes) / ((Date.now() - desde) / 1000)) * 60);
  informe.variasPestanas = {
    pestanas: PESTANAS,
    segundosHastaPrimerCuadroDeLasOtras: tiemposOtras,
    ffmpegDelVisorCorriendo: ffmpegsDelVisor(),
    pedidosPorMinutoTotal: porMinuto,
    pedidosPorMinutoPorPestana: Math.round(porMinuto / PESTANAS),
    ffmpegCopia: uso,
  };

  log("varias pestañas medidas; pestaña de fondo", JSON.stringify(informe));
  // 3 · Pestaña de fondo más de 30 s: ¿se apaga? ¿vuelve el video?
  for (const p of otras) await p.close();
  await p1.page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const oculta = Date.now();
  const apagadoOculta = await esperarApagado(oculta);
  await p1.page.evaluate(() => {
    (window as unknown as { __cuadros?: number[] }).__cuadros = [];
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const vuelta = Date.now();
  const volvio = await p1.page
    .waitForFunction(() => ((window as unknown as { __cuadros?: number[] }).__cuadros ?? []).length > 0, null, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  informe.pestanaDeFondo = {
    segundosHastaApagarElFfmpeg: apagadoOculta,
    alVolverHayVideo: volvio,
    segundosHastaVolverAVer: volvio ? seg(Date.now() - vuelta) : null,
    modoAlVolver: await p1.page.evaluate(() => [...document.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent?.trim()).filter(Boolean).join(" | ")),
  };

  log("fondo medido; cerrando");
  // 4 · Cerrar la vista: ¿se apaga el ffmpeg?
  await p1.page.close();
  const cerrada = Date.now();
  informe.alCerrar = { segundosHastaApagarElFfmpeg: await esperarApagado(cerrada), ffmpegDelVisorQuedan: ffmpegsDelVisor() };
}

// ─── Principal ──────────────────────────────────────────────────────────────

async function main() {
  H = await import("@/lib/camaras/hls");
  const informe: Record<string, unknown> = { canal: CANAL };
  const rtsp = process.env.CAMARA_RTSP ?? (await simularCamara());
  informe.camara = process.env.CAMARA_RTSP ? "real" : "simulada (MediaMTX + testsrc2)";

  log("abriendo el stream del lado del servidor");
  const t0 = Date.now();
  const a = await H.abrirVivo(CLAVE, rtsp);
  log("servidor", a);
  informe.servidor = {
    ok: a.ok,
    motivo: a.ok ? null : a.motivo,
    segundosHastaPrimerPedazo: seg(Date.now() - t0),
    primerPedazo: probarSegmento(),
  };
  if (!a.ok) return informe;
  const pid = pidDelStream();
  if (pid) (informe.servidor as Record<string, unknown>).ffmpegUnaPestana = await cpuYRam(pid, 10_000);
  if (!bandera("sin-navegador")) await navegador(rtsp, informe);
  else {
    const t = Date.now();
    informe.sinPedidos = { segundosHastaApagarElFfmpeg: await esperarApagado(t) };
  }
  return informe;
}

main()
  .then((i) => console.log(JSON.stringify(i, null, 2)))
  .catch((e) => {
    console.log(JSON.stringify({ ok: false, error: String(e?.message ?? e), consolaCspOHls: consolaGlobal }));
    process.exitCode = 1;
  })
  .finally(limpiar);
