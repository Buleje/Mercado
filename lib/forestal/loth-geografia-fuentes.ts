import "server-only";
import { logger } from "@/lib/logger";
import type { LatLng } from "./loth-geo";
import { MAX_MUESTRAS } from "./loth-elevacion";
import {
  armarGrilla,
  consultaOverpass,
  dimensionGrilla,
  parsearOverpass,
  puntosDeGrilla,
  type Bbox,
  type GrillaElevacion,
  type LineaGeo,
} from "./loth-geografia";

/**
 * loth-geografia-fuentes — las dos salidas a internet del planificador:
 * OpenStreetMap (Overpass) para ríos y caminos, y Open-Meteo para la altitud.
 *
 * Van por el servidor: el `connect-src` de la CSP no incluye esos dominios y
 * abrirlos para todo el sitio por una herramienta de un tab no se paga (lo
 * mismo que Wayback y el perfil de terreno).
 *
 * Ninguna función lanza: si el servicio no responde devuelven `null` y quien
 * llama decide (usar la caché, avisar). Nunca un dato inventado.
 */

/**
 * Espejos de Overpass, en orden. Medido el 29-09 desde Pucallpa-WSL con la
 * zona de Blas: overpass-api.de 200 en 8 s; maps.mail.ru 200 en 18 s;
 * private.coffee (el mismo servidor que kumi.systems) sin respuesta en 30 s.
 * Sin `User-Agent` overpass-api.de responde 406.
 */
export const ESPEJOS_OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

export const USER_AGENT = "Buleje/1.0 (+https://www.buleje.pe)";

/** Tope de lo que se acepta de Overpass: más que esto no es una zona rural. */
const MAX_RESPUESTA_BYTES = 20 * 1024 * 1024;

const OPEN_METEO = "https://api.open-meteo.com/v1/elevation";

/**
 * Presupuesto de tiempo de la geografía (Vercel corta las rutas a los 30 s,
 * `vercel.json`): OpenStreetMap y la altitud se piden A LA VEZ, así que lo
 * que tarda la geografía entera es el mayor de los dos, no la suma.
 */
export const PRESUPUESTO_OVERPASS_MS = 12_000;
export const PRESUPUESTO_ALTITUD_MS = 8_000;
/** Si el espejo principal no contestó en esto, se suma el siguiente (y así). */
export const RELEVO_ESPEJO_MS = 2_500;

async function unEspejo(url: string, consulta: string, bbox: Bbox, signal: AbortSignal): Promise<{ rios: LineaGeo[]; caminos: LineaGeo[] } | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({ data: consulta }).toString(),
      signal,
      cache: "no-store",
    });
    if (!res.ok) {
      logger.warn("[loth.geografia] overpass respondió mal", { url, status: res.status });
      return null;
    }
    const texto = await res.text();
    if (texto.length > MAX_RESPUESTA_BYTES) {
      logger.warn("[loth.geografia] overpass: respuesta demasiado grande", { url, bytes: texto.length });
      return null;
    }
    const r = parsearOverpass(texto, bbox);
    if (!r) logger.warn("[loth.geografia] overpass: respuesta que no es un resultado", { url, inicio: texto.slice(0, 120) });
    return r;
  } catch (err) {
    if (!signal.aborted) logger.warn("[loth.geografia] overpass no respondió", { url, error: String(err) });
    return null;
  }
}

/**
 * Ríos y caminos del recuadro, dentro de un PRESUPUESTO total. Arranca el
 * espejo principal; si a los `relevoMs` no contestó (o falló antes), se suma
 * el siguiente, y así: gana el primero que responde bien y los demás se
 * cortan. Al vencer el presupuesto se corta todo y vuelve `null` — nunca
 * espera más que eso, aunque los tres espejos estén colgados.
 */
export async function pedirOverpass(
  bbox: Bbox,
  opts: { presupuestoMs?: number; relevoMs?: number; espejos?: readonly string[] } = {},
): Promise<{ rios: LineaGeo[]; caminos: LineaGeo[]; espejo: string } | null> {
  const presupuesto = opts.presupuestoMs ?? PRESUPUESTO_OVERPASS_MS;
  const relevo = opts.relevoMs ?? RELEVO_ESPEJO_MS;
  const espejos = opts.espejos ?? ESPEJOS_OVERPASS;
  if (espejos.length === 0) return null;
  const consulta = consultaOverpass(bbox, Math.max(1, Math.floor(presupuesto / 1_000)));
  const ac = new AbortController();
  let corte: ReturnType<typeof setTimeout> | undefined;
  let reloj: ReturnType<typeof setInterval> | undefined;
  try {
    return await new Promise<{ rios: LineaGeo[]; caminos: LineaGeo[]; espejo: string } | null>((resolve) => {
      let listo = false;
      let siguiente = 0;
      let enVuelo = 0;
      const terminar = (v: { rios: LineaGeo[]; caminos: LineaGeo[]; espejo: string } | null) => {
        if (listo) return;
        listo = true;
        resolve(v);
      };
      const lanzar = () => {
        if (listo || siguiente >= espejos.length) return;
        const url = espejos[siguiente++];
        enVuelo++;
        void unEspejo(url, consulta, bbox, ac.signal).then((r) => {
          enVuelo--;
          if (r) return terminar({ ...r, espejo: url });
          if (siguiente < espejos.length) lanzar();
          else if (enVuelo === 0) terminar(null);
        });
      };
      corte = setTimeout(() => {
        logger.warn("[loth.geografia] overpass: se acabó el presupuesto", { ms: presupuesto });
        terminar(null);
      }, presupuesto);
      reloj = setInterval(lanzar, relevo);
      lanzar();
    });
  } finally {
    clearTimeout(corte);
    clearInterval(reloj);
    ac.abort();
  }
}

/**
 * Altitud de una lista de puntos, en tandas de {@link MAX_MUESTRAS} (el tope
 * de Open-Meteo), todas a la vez y dentro de `presupuestoMs`. Mantiene la
 * POSICIÓN: un punto sin dato es `null`, no se saca de la lista (sacarlo corre
 * todas las altitudes siguientes). Una tanda que falla o no llega a tiempo
 * deja sus puntos en `null`; si fallan todas, `null`.
 */
export async function consultarElevaciones(
  puntos: readonly LatLng[],
  opts: { revalidateS?: number; presupuestoMs?: number } = {},
): Promise<(number | null)[] | null> {
  if (puntos.length === 0) return [];
  const out: (number | null)[] = new Array(puntos.length).fill(null);
  let alguna = false;
  const tandas: [number, LatLng[]][] = [];
  for (let i = 0; i < puntos.length; i += MAX_MUESTRAS) tandas.push([i, puntos.slice(i, i + MAX_MUESTRAS)]);
  const signal = AbortSignal.timeout(opts.presupuestoMs ?? PRESUPUESTO_ALTITUD_MS);
  await Promise.all(
    tandas.map(async ([desde, pts]) => {
      const lat = pts.map((p) => p[0].toFixed(6)).join(",");
      const lng = pts.map((p) => p[1].toFixed(6)).join(",");
      try {
        const res = await fetch(`${OPEN_METEO}?latitude=${lat}&longitude=${lng}`, {
          signal,
          ...(opts.revalidateS ? { next: { revalidate: opts.revalidateS } } : { cache: "no-store" as const }),
        });
        if (!res.ok) {
          logger.warn("[loth.elevacion] servicio no disponible", { status: res.status });
          return;
        }
        const data = (await res.json()) as { elevation?: unknown[] };
        if (!Array.isArray(data.elevation)) return;
        data.elevation.slice(0, pts.length).forEach((v, i) => {
          if (typeof v === "number" && Number.isFinite(v)) {
            out[desde + i] = v;
            alguna = true;
          }
        });
      } catch (err) {
        logger.warn("[loth.elevacion] fetch falló", { error: String(err), cortado: signal.aborted });
      }
    }),
  );
  return alguna ? out : null;
}

/**
 * Grilla de altitud del recuadro (~100 m por celda, hasta 25 × 25), dentro
 * del presupuesto. `faltan` = puntos sin dato (una tanda que no llegó): la
 * grilla se usa igual si alcanza y se avisa.
 */
export async function pedirGrilla(bbox: Bbox, opts: { presupuestoMs?: number } = {}): Promise<{ grilla: GrillaElevacion | null; faltan: number; total: number }> {
  const { nx, ny } = dimensionGrilla(bbox);
  const valores = await consultarElevaciones(puntosDeGrilla(bbox, nx, ny), { revalidateS: 604_800, presupuestoMs: opts.presupuestoMs });
  const total = nx * ny;
  if (!valores) return { grilla: null, faltan: total, total };
  return { grilla: armarGrilla(bbox, nx, ny, valores), faltan: valores.filter((v) => v == null).length, total };
}
