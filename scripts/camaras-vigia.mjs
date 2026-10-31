#!/usr/bin/env node
/**
 * Vigía de movimientos de las cámaras — `node --env-file=.env.local scripts/camaras-vigia.mjs` (2026-10-23).
 *
 * Con la PC prendida y el navegador CERRADO, nadie vaciaba la cola de alarmas
 * de Hik-Connect (lo hacía sólo la cabecera del panel abierto) y no había
 * aviso. Esto llama cada 30 s al cron del dev server
 * (`/api/cron/camaras-movimientos`): vacía la cola, guarda los movimientos
 * (la cabecera los sigue mostrando) y manda lo nuevo al celular y a la campana.
 * Va por el dev server y no por su cuenta para usar el mismo proceso y la
 * misma caché que el panel.
 *
 * Uso: `node --env-file=.env.local scripts/camaras-vigia.mjs` (necesita el dev server en :3000 y CRON_SECRET
 * en .env.local). Ctrl+C para parar. Una línea por vuelta con novedades; las
 * vueltas sin nada no escriben.
 */

const BASE = process.env.CAMARAS_VIGIA_BASE ?? "http://127.0.0.1:3000";
const CADA_MS = Math.max(20_000, Number(process.env.CAMARAS_VIGIA_CADA_MS ?? 30_000));
/** Una ruta fría compila 10-60 s en el dev server. */
const PLAZO_MS = 120_000;
const ESPERA_MAX_MS = 5 * 60_000;

const hora = () =>
  new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
const log = (m) => console.log(`[vigía ${hora()}] ${m}`);

if (!process.env.CRON_SECRET) {
  log("falta CRON_SECRET: corre con `node --env-file=.env.local scripts/camaras-vigia.mjs` (lee .env.local)");
  process.exit(1);
}

/* El secreto del cron sólo viaja a esta PC o por https: con otra base en http
   saldría en claro por la red (revisión de seguridad 23-10). */
function baseSegura(base) {
  try {
    const u = new URL(base);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}
if (!baseSegura(BASE)) {
  log(`CAMARAS_VIGIA_BASE=${BASE} no es localhost ni https: no se manda el secreto del cron. Usa https o http://127.0.0.1:3000.`);
  process.exit(1);
}

let fallas = 0;
let parar = false;
let reloj = null;
process.on("SIGINT", () => {
  parar = true;
  if (reloj) clearTimeout(reloj);
  log("parado");
  process.exit(0);
});

function resumen(d) {
  const partes = (d.detalle ?? [])
    .filter((n) => n.resultado !== "nada_nuevo" && n.resultado !== "sin_camaras")
    .map((n) => {
      const extra = n.resultado === "avisado" ? ` · ${n.enviados}/${n.destinos} celulares${n.campana ? " · campana" : ""}` : "";
      return `${n.tenantId.slice(0, 8)}… ${n.resultado}${n.nuevos ? ` (${n.nuevos} nuevos)` : ""}${extra}${n.aviso ? ` · ${n.aviso}` : ""}`;
    });
  return partes.join(" | ");
}

async function vuelta() {
  if (parar) return;
  let espera = CADA_MS;
  try {
    const r = await fetch(`${BASE}/api/cron/camaras-movimientos`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(PLAZO_MS),
    });
    if (r.status === 401) {
      log("401: el CRON_SECRET de .env.local no es el del dev server (¿lo cambiaste sin reiniciarlo?)");
    } else if (!r.ok) {
      throw new Error(`HTTP ${r.status}`);
    } else {
      fallas = 0;
      const texto = resumen(await r.json());
      if (texto) log(texto);
    }
  } catch (err) {
    fallas += 1;
    espera = Math.min(ESPERA_MAX_MS, CADA_MS * 2 ** Math.min(fallas, 4));
    log(`el dev server no contestó (${err?.name === "TimeoutError" ? "tardó más de 2 min" : String(err?.message ?? err)}); reintento en ${Math.round(espera / 1000)} s`);
  }
  reloj = setTimeout(vuelta, espera);
}

log(`mirando ${BASE} cada ${Math.round(CADA_MS / 1000)} s`);
vuelta();
