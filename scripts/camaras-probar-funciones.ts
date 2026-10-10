/**
 * Prueba con las cámaras REALES qué controles de Hikvision responden por la
 * nube (ADR-472). Lee las claves guardadas del negocio con la misma librería
 * que usa el panel y NUNCA imprime claves, tokens ni URLs firmadas.
 *
 *   PASO=leer       capacidades, estado (detección/cifrado), códec y lo que
 *                   expone ISAPI por la nube. Sólo lecturas.
 *   PASO=ptz        mueve «Entrada» 1 s a la derecha y 1 s de vuelta.
 *   PASO=deteccion  lee el armado, lo invierte y lo VUELVE al original.
 *   PASO=captura    pide una foto (EZVIZ y Hik-Connect for Teams).
 *   PASO=sirena     DISPARA la sirena de UNA cámara y mide cuánto suena
 *                   (ADR-472 § «Alarma: antes de habilitarla»). Sólo con la
 *                   bandera `--sirena`, `CAMARAS=<un id>` y Brandon en el
 *                   sitio. Lee `AudioAlarm` (alarmTimes), dispara, espera
 *                   Enter «dejó de sonar» con tope `SIRENA_MAX_SEG` (20 s,
 *                   máx. 60) y SIEMPRE apaga: al final, con Ctrl+C o error,
 *                   con 3 intentos.
 *
 * Fuera de `PASO=sirena --sirena`, la sirena NO se dispara nunca desde acá.
 *
 * Uso:
 *   PASO=leer npx tsx --env-file=.env.local scripts/camaras-probar-funciones.ts > out.log 2>&1
 *   PASO=sirena CAMARAS=cam_muvwzu97yug9my npx tsx --env-file=.env.local \
 *     scripts/camaras-probar-funciones.ts --sirena 2>&1 | tee sirena.log
 * Variables: TENANT (Blas por defecto), CAMARAS (ids separados por coma).
 */

import Module from "node:module";
import path from "node:path";

/* Los módulos de `lib/**` empiezan con `import "server-only"`, que fuera de
   Next no existe: se resuelve al vacío de Next ANTES de cargarlos. */
const M = Module as unknown as { _resolveFilename: (p: string, ...r: unknown[]) => string };
const original = M._resolveFilename;
M._resolveFilename = function (pedido: string, ...resto: unknown[]) {
  if (pedido === "server-only")
    return path.join(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js");
  return original.call(this, pedido, ...resto);
};

const TENANT = process.env.TENANT ?? "cmpxiv6p4000bohvzwl6bnfpv";
const ENTRADA = "cam_muvwzu97yug9my";
const PATIO = "cam_muvwhnbtmdln3u";
const CAMARAS = (process.env.CAMARAS ?? `${PATIO},${ENTRADA}`).split(",");
const PASO = process.env.PASO ?? "leer";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

/** Tacha todo lo que abre la cuenta: tokens `at.…`, firmas y consultas de URLs. */
function tachar(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s
    .replace(/at\.[A-Za-z0-9._-]{8,}/g, "at.•••")
    .replace(/(https?:\/\/[^\s"?]+)\?[^\s"]*/g, "$1?•••")
    .replace(/("(?:accessToken|appToken|token|password|validateCode)"\s*:\s*")[^"]*"/gi, '$1•••"')
    .replace(/\b(\d{1,3}\.){3}\d{1,3}\b/g, "IP•••")
    .replace(/(<(?:serialNumber|macAddress|deviceID)>)[^<]*/g, "$1•••");
}
const serieCorta = (s: string) => `…${s.slice(-4)}`;

interface Permiso {
  appToken: string;
  dominioVideo: string;
  token: string;
  dominioApi: string;
}

async function ezviz(
  p: Permiso,
  ruta: string,
  cuerpo: Record<string, string>,
): Promise<{ status: number; json: unknown; ms: number }> {
  const t = Date.now();
  const r = await fetch(`${p.dominioVideo}${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ accessToken: p.appToken, ...cuerpo }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const texto = await r.text();
  let json: unknown = texto.slice(0, 400);
  try {
    json = JSON.parse(texto);
  } catch {
    /* no es JSON: queda el texto recortado */
  }
  return { status: r.status, json, ms: Date.now() - t };
}

async function ezvizHeaders(
  p: Permiso,
  metodo: "GET" | "POST",
  ruta: string,
  headers: Record<string, string>,
): Promise<{ status: number; texto: string; ms: number }> {
  const t = Date.now();
  const r = await fetch(`${p.dominioVideo}${ruta}`, {
    method: metodo,
    headers: { accessToken: p.appToken, ...headers },
    signal: AbortSignal.timeout(15_000),
  });
  return { status: r.status, texto: (await r.text()).slice(0, 600), ms: Date.now() - t };
}

/** ISAPI por la nube de EZVIZ (`/api/hikvision/ISAPI/...`): SÓLO GET. */
async function isapiGet(p: Permiso, serie: string, ruta: string) {
  const ahora = new Date();
  const fecha = ahora.toISOString().slice(0, 19).replace("T", " ");
  const t = Date.now();
  const r = await fetch(`${p.dominioVideo}/api/hikvision${ruta}`, {
    method: "GET",
    headers: {
      "EZO-AccessToken": p.appToken,
      "EZO-DeviceSerial": serie,
      "EZO-Date": fecha,
      "Content-Type": ruta.includes("format=json") ? "application/json" : "application/xml",
    },
    signal: AbortSignal.timeout(20_000),
  });
  return { status: r.status, texto: (await r.text()).slice(0, 900), ms: Date.now() - t };
}

/**
 * PASO=sirena: mide si el disparo manual respeta una duración propia de la
 * cámara (`AudioAlarm.alarmTimes`) o suena hasta que alguien la apague.
 * Doble llave: `PASO=sirena` Y `--sirena`, y una sola cámara explícita.
 */
async function probarSirena(
  p: Permiso,
  cred: import("@/lib/camaras/hik-connect-api.server").CredencialesHik,
  camaras: { id: string; serie: string }[],
): Promise<void> {
  if (!process.argv.includes("--sirena"))
    throw new Error(
      "PASO=sirena dispara la sirena DE VERDAD: agrega --sirena (con Brandon en el sitio).",
    );
  if (!process.env.CAMARAS || camaras.length !== 1)
    throw new Error("PASO=sirena va con UNA cámara explícita: CAMARAS=<id>.");
  const c = camaras[0];
  const tope = Math.min(Math.max(Number(process.env.SIRENA_MAX_SEG) || 20, 5), 60);
  const L = await import("@/lib/camaras/ezviz-control.server");

  const cfg = await isapiGet(
    p,
    c.serie,
    "/ISAPI/Event/triggers/notifications/AudioAlarm?format=json",
  );
  log(
    "AudioAlarm antes (alarmTimes = vueltas del audio):",
    tachar(cfg.texto.replace(/\s+/g, " ").slice(0, 500)),
  );

  let apagada = false;
  const apagar = async (por: string) => {
    for (let i = 1; i <= 3 && !apagada; i++) {
      const r = await L.alarma(TENANT, cred, c.serie, false);
      log(`apagar (${por}) intento ${i}:`, tachar(r));
      if (r.ok) apagada = true;
      else await dormir(2000);
    }
    if (!apagada) log("NO SE APAGÓ: apágala desde la app Hik-Connect (defensa activa → detener).");
  };
  process.once("SIGINT", () => void apagar("Ctrl+C").finally(() => process.exit(130)));

  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  log(
    `DISPARO en ${c.id} (${serieCorta(c.serie)}). Enter cuando DEJE DE SONAR sola; a los ${tope} s la apago yo.`,
  );
  const t = Date.now();
  try {
    const on = await L.alarma(TENANT, cred, c.serie, true);
    log("sonar:", tachar(on), `${Date.now() - t} ms`);
    const fin = await Promise.race([
      new Promise<"enter">((res) => rl.once("line", () => res("enter"))),
      dormir(tope * 1000).then(() => "tope" as const),
    ]);
    const seg = ((Date.now() - t) / 1000).toFixed(1);
    log(
      fin === "enter"
        ? `SE CALLÓ SOLA a los ${seg} s (medido a mano): la cámara tiene duración propia.`
        : `Seguía sonando a los ${seg} s: NO se calla sola antes de ${tope} s.`,
    );
  } finally {
    rl.close();
    await apagar("final");
    const i = await ezviz(p, "/api/lapp/device/info", { deviceSerial: c.serie });
    log("estado después:", tachar(i.json));
  }
}

async function main() {
  const { CamarasHikConnectDB } = await import("@/lib/db/camaras-hik-connect.db");
  const H = await import("@/lib/camaras/hik-connect-api.server");

  const cred = await CamarasHikConnectDB.credenciales(TENANT);
  if (!cred.ok) throw new Error(`sin cuenta: ${cred.motivo}`);
  log("región guardada:", cred.valor.region);
  const per = await H.permisoDeControl(TENANT, cred.valor);
  if (!per.ok) throw new Error(`sin permiso: ${JSON.stringify(per.error)}`);
  const p = per.valor;
  log("dominio API:", p.dominioApi, "· dominio video/EZVIZ:", p.dominioVideo);

  const camaras: { id: string; serie: string }[] = [];
  for (const id of CAMARAS) {
    const e = await CamarasHikConnectDB.enlaceParaVideo(TENANT, id);
    if (!e) {
      log(id, "sin enlace");
      continue;
    }
    camaras.push({ id, serie: e.deviceSerial });
  }

  if (PASO === "leer") {
    for (const c of camaras) {
      log(`════ ${c.id} (serie ${serieCorta(c.serie)})`);
      const cap = await ezviz(p, "/api/lapp/device/capacity", {
        deviceSerial: c.serie,
        channelNo: "1",
      });
      log("capacity", cap.status, `${cap.ms}ms`, tachar(cap.json));
      const info = await ezviz(p, "/api/lapp/device/info", { deviceSerial: c.serie });
      const d = (info.json as { code?: string; data?: Record<string, unknown> }) ?? {};
      const datos = d.data ?? {};
      log(
        "info",
        info.status,
        d.code,
        tachar({
          model: datos.model,
          status: datos.status,
          defence: datos.defence,
          isEncrypt: datos.isEncrypt,
          alarmSoundMode: datos.alarmSoundMode,
          category: datos.category,
          parentCategory: datos.parentCategory,
          netType: datos.netType,
          signal: datos.signal,
          msg: (info.json as { msg?: string })?.msg,
        }),
      );
      for (const st of ["1", "2"]) {
        const enc = await ezvizHeaders(
          p,
          "GET",
          `/api/v3/das/device/video/encode?streamType=${st}`,
          {
            deviceSerial: c.serie,
            channelNo: "1",
          },
        );
        log(`encode streamType=${st}`, enc.status, `${enc.ms}ms`, tachar(enc.texto));
      }
      for (const [nombre, ruta] of [
        ["switch 301 luz por movimiento", "/api/v3/device/switchStatus/get?type=301"],
        ["switch 305", "/api/v3/device/switchStatus/get?type=305"],
      ] as const) {
        const r = await ezvizHeaders(p, "GET", ruta, { deviceSerial: c.serie, channelNo: "1" });
        log(nombre, r.status, tachar(r.texto));
      }
      for (const ruta of [
        "/ISAPI/System/deviceInfo",
        "/ISAPI/Streaming/channels/101",
        "/ISAPI/Streaming/channels/102",
        "/ISAPI/System/TwoWayAudio/channels",
        "/ISAPI/Event/triggers/notifications/AudioAlarm/capabilities?format=json",
        "/ISAPI/Event/triggers/notifications/AudioAlarm?format=json",
        "/ISAPI/Event/channels/capabilities",
        "/ISAPI/System/IO/outputs",
        "/ISAPI/Image/channels/1/supplementLight",
        "/ISAPI/System/Video/inputs/channels/1/motionDetection",
      ]) {
        const r = await isapiGet(p, c.serie, ruta);
        log("ISAPI", ruta, r.status, `${r.ms}ms`, tachar(r.texto.replace(/\s+/g, " ")));
      }
    }
  }

  if (PASO === "leer2") {
    const recorte = (xml: string, etiqueta: string) => {
      const m = new RegExp(`<${etiqueta}>[\\s\\S]*?</${etiqueta}>`).exec(xml);
      return m ? m[0].replace(/\s+/g, " ") : `(sin <${etiqueta}>)`;
    };
    for (const c of camaras) {
      log(`════ ${c.id} (serie ${serieCorta(c.serie)})`);
      for (const canal of ["101", "102"]) {
        const ahora = new Date().toISOString().slice(0, 19).replace("T", " ");
        const r = await fetch(`${p.dominioVideo}/api/hikvision/ISAPI/Streaming/channels/${canal}`, {
          headers: {
            "EZO-AccessToken": p.appToken,
            "EZO-DeviceSerial": c.serie,
            "EZO-Date": ahora,
            "Content-Type": "application/xml",
          },
          signal: AbortSignal.timeout(20_000),
        });
        log(`códec ${canal}`, r.status, tachar(recorte(await r.text(), "Video")));
      }
      const cap = await isapiGet(
        p,
        c.serie,
        "/ISAPI/Event/triggers/notifications/AudioAlarm/capabilities?format=json",
      );
      log("AudioAlarm caps (cola)", tachar(cap.texto.replace(/\s+/g, " ").slice(-500)));
      const vmd = await isapiGet(p, c.serie, "/ISAPI/Event/triggers/VMD-1");
      log("VMD-1 vínculos", vmd.status, tachar(vmd.texto.replace(/\s+/g, " ")));
      const talk = await ezviz(p, "/api/lapp/live/talk/url", {
        deviceSerial: c.serie,
        channelNo: "1",
      });
      const tj = talk.json as { code?: string; msg?: string; data?: Record<string, unknown> };
      const hosts = Object.fromEntries(
        Object.entries(tj.data ?? {}).map(([k, v]) => {
          try {
            const u = new URL(String(v).replace(/^tts:\/\//, "https://"));
            return [k, `${u.protocol}//${u.host}`];
          } catch {
            return [k, typeof v];
          }
        }),
      );
      log("talk/url", talk.status, tj.code, tj.msg, JSON.stringify(hosts));
    }
  }

  if (PASO === "captura2") {
    /* ¿La foto llega cifrada? (la cámara tiene el video cifrado: `isEncrypt 1`). */
    const c = camaras.find((x) => x.id === PATIO) ?? camaras[0];
    const e = await CamarasHikConnectDB.enlaceParaVideo(TENANT, c.id);
    const { decodificarFotoHik } = await import("@/lib/camaras/ezviz-foto");
    const mirar = async (nombre: string, url: string) => {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const buf = new Uint8Array(await r.arrayBuffer());
      const cabeza = Buffer.from(buf.slice(0, 16)).toString("latin1");
      const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
      log(
        nombre,
        r.status,
        r.headers.get("content-type"),
        `${buf.length} B`,
        "jpeg:",
        jpeg,
        "cabeza:",
        JSON.stringify(cabeza.replace(/[^\x20-\x7e]/g, ".")),
      );
      const d = decodificarFotoHik(buf, e?.codigo ?? null);
      log(
        `  → decodificada:`,
        d.ok
          ? `${d.valor.length} B jpeg=${d.valor[0] === 0xff && d.valor[1] === 0xd8} fin=${d.valor.subarray(-2).toString("hex")}`
          : d.error,
      );
      if (d.ok && process.env.GUARDAR_EN) {
        const { writeFileSync } = await import("node:fs");
        const sharp = (await import("sharp")).default;
        const meta = await sharp(d.valor).metadata();
        log(`  → ${meta.format} ${meta.width}×${meta.height}`);
        writeFileSync(
          path.join(process.env.GUARDAR_EN, `${nombre.replace(/\W+/g, "-")}.jpg`),
          d.valor,
        );
      }
    };
    const ez = await ezviz(p, "/api/lapp/device/capture", {
      deviceSerial: c.serie,
      channelNo: "1",
    });
    const picUrl = (ez.json as { data?: { picUrl?: string } }).data?.picUrl;
    if (picUrl) await mirar("EZVIZ picUrl", picUrl);
    const hcc = await H.llamarConToken(
      TENANT,
      cred.valor,
      "/api/hccgw/resource/v1/device/capturePic",
      {
        deviceSerial: c.serie,
        channelNo: 1,
      },
    );
    const capUrl = hcc.ok ? (hcc.valor as { captureUrl?: string }).captureUrl : undefined;
    if (capUrl) await mirar("HCC captureUrl", capUrl);
  }

  if (PASO === "leer3") {
    /* ¿El vivo trae sonido? ¿Batería? ¿Micrófono de la cámara prendido? Sólo lecturas. */
    for (const c of camaras) {
      log(`════ ${c.id}`);
      const ahora = new Date().toISOString().slice(0, 19).replace("T", " ");
      const r = await fetch(`${p.dominioVideo}/api/hikvision/ISAPI/Streaming/channels/101`, {
        headers: {
          "EZO-AccessToken": p.appToken,
          "EZO-DeviceSerial": c.serie,
          "EZO-Date": ahora,
          "Content-Type": "application/xml",
        },
        signal: AbortSignal.timeout(20_000),
      });
      const xml = await r.text();
      const audio =
        /<Audio>[\s\S]*?<\/Audio>/.exec(xml)?.[0].replace(/\s+/g, " ") ?? "(sin <Audio>)";
      log("audio del canal 101:", audio);
      const st = await ezviz(p, "/api/lapp/device/status/get", {
        deviceSerial: c.serie,
        channel: "1",
      });
      log("status/get", st.status, tachar(st.json));
      const mic = await ezviz(p, "/api/lapp/camera/video/sound/status", { deviceSerial: c.serie });
      log("micrófono (sound/status)", mic.status, tachar(mic.json));
    }
  }

  if (PASO === "microfono") {
    /* Lee el micrófono de la cámara, lo invierte y lo VUELVE al original. */
    const c = camaras.find((x) => x.id === ENTRADA) ?? camaras[0];
    const leer = async () => {
      const r = await ezviz(p, "/api/lapp/camera/video/sound/status", { deviceSerial: c.serie });
      return (r.json as { data?: { enable?: number } }).data?.enable;
    };
    const antes = await leer();
    log("micrófono antes:", antes);
    if (antes === 0 || antes === 1) {
      const otro = antes === 1 ? "0" : "1";
      const a = await ezviz(p, "/api/lapp/camera/video/sound/set", {
        deviceSerial: c.serie,
        enable: otro,
      });
      log(`sound/set ${otro}`, a.status, `${a.ms}ms`, tachar(a.json));
      await dormir(1500);
      log("micrófono después:", await leer());
      const b = await ezviz(p, "/api/lapp/camera/video/sound/set", {
        deviceSerial: c.serie,
        enable: String(antes),
      });
      log(`sound/set VUELTA ${antes}`, b.status, tachar(b.json));
      await dormir(1500);
      log("micrófono final:", await leer());
    }
  }

  if (PASO === "lib") {
    /* Lo mismo que hace la ruta `/control`, con las funciones de la ruta
       (`ezviz-control.server.ts`) y sin tocar la base de Blas. */
    const L = await import("@/lib/camaras/ezviz-control.server");
    for (const c of camaras) {
      const r = await L.controlesDe(TENANT, cred.valor, c.serie);
      log(`controlesDe ${c.id}`, JSON.stringify(r));
    }
    const c = camaras.find((x) => x.id === ENTRADA) ?? camaras[0];
    for (const d of ["right", "left"] as const) {
      const a = await L.mover(TENANT, cred.valor, c.serie, d);
      await dormir(1000);
      const b = await L.mover(TENANT, cred.valor, c.serie, "stop", 1, d);
      log(`mover ${d}`, JSON.stringify(a), "→ stop", JSON.stringify(b));
      await dormir(1500);
    }
    const off = await L.cambiarDeteccion(TENANT, cred.valor, c.serie, false);
    log("detección → apagada:", JSON.stringify(off));
    const on = await L.cambiarDeteccion(TENANT, cred.valor, c.serie, true);
    log("detección → VUELTA prendida:", JSON.stringify(on));
    const f = await L.sacarFoto(
      TENANT,
      cred.valor,
      c.serie,
      (await CamarasHikConnectDB.enlaceParaVideo(TENANT, c.id))?.codigo ?? null,
    );
    if (f.ok) {
      const sharp = (await import("sharp")).default;
      const m = await sharp(f.valor).metadata();
      log("sacarFoto:", `${f.valor.length} B`, m.format, `${m.width}×${m.height}`);
    } else log("sacarFoto:", JSON.stringify(f.error));
    log(
      "alarma(false) [sólo APAGAR]:",
      JSON.stringify(await L.alarma(TENANT, cred.valor, c.serie, false)),
    );
  }

  if (PASO === "estado") {
    /* Sólo lee: armado y una foto (con su código de respuesta). */
    for (const c of camaras) {
      const i = await ezviz(p, "/api/lapp/device/info", { deviceSerial: c.serie });
      const d = (i.json as { data?: { defence?: number; status?: number } }).data;
      log(`${c.id} defence=${d?.defence} status=${d?.status}`);
      const f = await ezviz(p, "/api/lapp/device/capture", {
        deviceSerial: c.serie,
        channelNo: "1",
      });
      log(`  capture ${f.ms}ms`, tachar(f.json));
    }
  }

  if (PASO === "apagar-alarma") {
    /* status 1 = «消除报警» (APAGAR); el 2 (disparar) sólo lo manda PASO=sirena. */
    for (const c of camaras) {
      const r = await fetch(`${p.dominioVideo}/api/v3/device/defence`, {
        method: "POST",
        headers: {
          accessToken: p.appToken,
          deviceSerial: c.serie,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ status: "1" }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      log(`apagar alarma ${c.id}`, r.status, tachar((await r.text()).slice(0, 300)));
    }
  }

  if (PASO === "sirena") await probarSirena(p, cred.valor, camaras);

  if (PASO === "ptz") {
    const c = camaras.find((x) => x.id === ENTRADA) ?? camaras[0];
    log(`PTZ en ${c.id} (…${c.serie.slice(-4)})`);
    for (const [dir, nombre] of [
      ["3", "derecha"],
      ["2", "izquierda"],
    ] as const) {
      const base = { deviceSerial: c.serie, channelNo: "1" };
      const a = await ezviz(p, "/api/lapp/device/ptz/start", {
        ...base,
        direction: dir,
        speed: "1",
      });
      log(`start ${nombre}`, a.status, `${a.ms}ms`, tachar(a.json));
      await dormir(1000);
      const b = await ezviz(p, "/api/lapp/device/ptz/stop", { ...base, direction: dir });
      log(`stop ${nombre}`, b.status, `${b.ms}ms`, tachar(b.json));
      await dormir(1500);
    }
  }

  if (PASO === "deteccion") {
    const c = camaras.find((x) => x.id === ENTRADA) ?? camaras[0];
    const leerArmado = async () => {
      const r = await ezviz(p, "/api/lapp/device/info", { deviceSerial: c.serie });
      const j = r.json as { code?: string; data?: { defence?: number } };
      return { code: j.code, defence: j.data?.defence };
    };
    const antes = await leerArmado();
    log(`armado antes en ${c.id}:`, antes);
    if (antes.code === "200" && typeof antes.defence === "number") {
      const otro = antes.defence === 1 ? "0" : "1";
      const set = await ezviz(p, "/api/lapp/device/defence/set", {
        deviceSerial: c.serie,
        isDefence: otro,
      });
      log(`defence/set ${otro}`, set.status, `${set.ms}ms`, tachar(set.json));
      await dormir(1500);
      log("armado después del cambio:", await leerArmado());
      const vuelta = await ezviz(p, "/api/lapp/device/defence/set", {
        deviceSerial: c.serie,
        isDefence: String(antes.defence),
      });
      log(`defence/set VUELTA ${antes.defence}`, vuelta.status, tachar(vuelta.json));
      await dormir(1500);
      log("armado final:", await leerArmado());
    }
  }

  if (PASO === "captura") {
    const c = camaras.find((x) => x.id === PATIO) ?? camaras[0];
    const ez = await ezviz(p, "/api/lapp/device/capture", {
      deviceSerial: c.serie,
      channelNo: "1",
    });
    log("EZVIZ capture", ez.status, `${ez.ms}ms`, tachar(ez.json));
    const t = Date.now();
    const hcc = await H.llamarConToken(
      TENANT,
      cred.valor,
      "/api/hccgw/resource/v1/device/capturePic",
      {
        deviceSerial: c.serie,
        channelNo: 1,
      },
    );
    log("HCC capturePic", `${Date.now() - t}ms`, tachar(hcc));
  }
}

main()
  .catch((err) => log("ERROR", tachar(err instanceof Error ? err.message : String(err))))
  .finally(() => process.exit(0));
