import "server-only";
import { logger } from "@/lib/logger";
import { formatDateNumeric, formatTime } from "@/lib/format";
import { ForestLothImagenesDB } from "@/lib/db/forest-loth-imagenes.db";
import type { LatLng } from "./loth-geo";
import { centroBbox, contieneBbox, recuadroDeTrabajo, type Bbox } from "./loth-geografia";
import type { ContextoPlan } from "./loth-geografia-servidor";
import { agruparPorFecha, diasLima, elegirColorReal, elegirEscena, VERSION_IMAGENES, type CapasVivas, type EscenaS2, type ImagenesDelArea } from "./loth-imagenes";
import { pedirEscenasStac, pedirFechaEsri, pedirNubesDelArea, sondearDias } from "./loth-imagenes-fuentes";

/**
 * loth-imagenes-servidor — arma lo que devuelve `/loth/imagenes`: caché
 * primero, a internet sólo lo vencido, y un servicio caído nunca da error
 * (se usa lo guardado o se devuelve vacío, y se dice en `avisos`).
 *
 *   · Escenas de Sentinel-2 y fecha de Esri: vigentes {@link VIGENCIA_MS}.
 *     Al refrescar, las nubes ya medidas de una escena no se vuelven a medir.
 *   · Lo de hoy (GIBS): se vuelve a mirar si cambió el día en Lima, o si hoy
 *     todavía no había imagen y pasó {@link REMIRAR_VIVAS_MS} (la pasada de la
 *     tarde llega a eso de las 16:30 de Lima).
 */

export const VIGENCIA_MS = 6 * 60 * 60_000;
export const REMIRAR_VIVAS_MS = 30 * 60_000;
/** Nubes sobre el área: se miden las más nuevas (el selector muestra 90 días; las viejas quedan con el % del cuadro). */
export const MAX_ESCENAS_MEDIDAS = 24;
const CONCURRENCIA_NUBES = 6;
/** La ruta entera bajo ~10 s: lo que no se midió a tiempo queda con el % del cuadro. */
export const PRESUPUESTO_NUBES_TOTAL_MS = 7_500;

export type ResultadoImagenes = { ok: true; imagenes: ImagenesDelArea & { desdeCache: boolean; avisos: string[] } } | { ok: false; motivo: string };

const mismosItems = (a: EscenaS2, b: EscenaS2) => a.items.length === b.items.length && a.items.every((x) => b.items.some((y) => y.id === x.id));

/**
 * Mide las nubes sobre el área escena por escena, de a {@link CONCURRENCIA_NUBES},
 * hasta agotar el presupuesto. Una escena con dos cuadros suma los píxeles de
 * los dos. Devuelve una copia; lo no medido queda en null.
 */
async function medirNubes(escenas: EscenaS2[], bbox: Bbox, previas: readonly EscenaS2[], hastaMs: number): Promise<EscenaS2[]> {
  const out = escenas.map((e) => {
    const p = previas.find((x) => x.fecha === e.fecha && mismosItems(x, e) && x.nubesAreaPct != null);
    return p ? { ...e, nubesAreaPct: p.nubesAreaPct, coberturaPct: p.coberturaPct } : { ...e };
  });
  const pendientes = out.slice(0, MAX_ESCENAS_MEDIDAS).filter((e) => e.nubesAreaPct == null);
  let i = 0;
  const trabajador = async () => {
    while (i < pendientes.length && Date.now() < hastaMs) {
      const e = pendientes[i++];
      const medidas = await Promise.all(e.items.map((it) => pedirNubesDelArea(it.id, bbox)));
      const validas = medidas.filter((m): m is NonNullable<typeof m> => m != null);
      if (validas.length === 0) continue;
      const px = validas.reduce((s, m) => s + m.pixeles, 0);
      const nube = validas.reduce((s, m) => s + (m.nubesPct / 100) * m.pixeles, 0);
      e.nubesAreaPct = px > 0 ? (nube / px) * 100 : 100;
      // Dos cuadros vecinos se solapan ~10 km: la suma puede pasar de 100.
      e.coberturaPct = Math.min(100, validas.reduce((s, m) => s + m.coberturaPct, 0));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCIA_NUBES }, trabajador));
  return out;
}

export async function obtenerImagenes(
  tenantId: string,
  ctx: Pick<ContextoPlan, "contorno" | "contornoEs" | "arboles">,
  opts: { refrescar?: boolean; ahoraIso?: string; user?: string } = {},
): Promise<ResultadoImagenes> {
  if (!tenantId) throw new Error("tenantId is required");
  const rec = recuadroDeTrabajo({ contorno: ctx.contorno, contornoEs: ctx.contornoEs, arboles: ctx.arboles.map((a) => [a.lat, a.lng] as LatLng) });
  if (!rec.ok) return { ok: false, motivo: rec.motivo };

  let cache: ImagenesDelArea | null = null;
  try {
    cache = await ForestLothImagenesDB.get(tenantId);
  } catch (err) {
    logger.error("[loth.imagenes] no se pudo leer la caché", { error: String(err), tenantId });
  }
  const ahora = opts.ahoraIso ?? new Date().toISOString();
  const ahoraMs = Date.parse(ahora);
  const dias = diasLima(ahoraMs);
  const cubre = cache != null && contieneBbox(cache.bbox, rec.bbox);
  const previo = cubre ? cache : null;
  const refrescar = opts.refrescar === true;

  const escenasVigentes = !!previo && !refrescar && ahoraMs - Date.parse(previo.consultadoAt) < VIGENCIA_MS;
  const vivasVigentes =
    !!previo &&
    !refrescar &&
    previo.vivas.focos.fechas.includes(dias.hoy) &&
    (previo.vivas.colorReal?.fecha === dias.hoy || ahoraMs - Date.parse(previo.vivas.miradoAt) < REMIRAR_VIVAS_MS);
  if (previo && escenasVigentes && vivasVigentes) {
    return { ok: true, imagenes: { ...previo, desdeCache: true, avisos: [] } };
  }

  const avisos: string[] = [];
  const bbox = previo && !refrescar ? previo.bbox : rec.bbox;
  const [cLat, cLng] = centroBbox(rec.bbox);

  const [items, esriNueva, sondas] = await Promise.all([
    escenasVigentes ? null : pedirEscenasStac(bbox, ahora),
    escenasVigentes ? null : pedirFechaEsri(cLat, cLng),
    vivasVigentes ? null : sondearDias(dias, cLat, cLng),
  ]);

  // ── Sentinel-2 ─────────────────────────────────────────────────────────────
  let escenas = previo?.escenas ?? [];
  let consultadoAt = previo?.consultadoAt ?? ahora;
  let fresco = false;
  if (!escenasVigentes) {
    if (items) {
      escenas = await medirNubes(agruparPorFecha(items), bbox, previo?.escenas ?? [], Date.now() + PRESUPUESTO_NUBES_TOTAL_MS);
      consultadoAt = ahora;
      fresco = true;
      if (escenas.length === 0) avisos.push("Sentinel-2 no tiene pasadas sobre tu área en los últimos 90 días.");
    } else if (previo) {
      avisos.push(`El catálogo de Sentinel-2 no respondió: se muestran las escenas consultadas el ${formatDateNumeric(previo.consultadoAt)} a las ${formatTime(new Date(previo.consultadoAt))}.`);
    } else {
      avisos.push("El catálogo de Sentinel-2 no respondió: vuelve a intentar en unos minutos.");
    }
  }

  // ── Esri ───────────────────────────────────────────────────────────────────
  const esri = escenasVigentes ? (previo?.esri ?? null) : (esriNueva ?? previo?.esri ?? null);
  if (esriNueva) fresco = true;

  // ── Lo de hoy (GIBS) ───────────────────────────────────────────────────────
  let vivas: CapasVivas = previo?.vivas ?? { colorReal: null, focos: { fechas: [dias.ayer, dias.hoy] }, miradoAt: ahora };
  if (sondas) {
    if (sondas.algunaRespondio) {
      vivas = { colorReal: elegirColorReal(dias, sondas.hay), focos: { fechas: [dias.ayer, dias.hoy] }, miradoAt: ahora };
      fresco = true;
    } else {
      // Sin respuesta de NASA: los focos igual se piden por fecha (son del día, no dependen de la sonda).
      vivas = { colorReal: previo?.vivas.colorReal ?? null, focos: { fechas: [dias.ayer, dias.hoy] }, miradoAt: previo?.vivas.miradoAt ?? ahora };
      avisos.push("NASA no respondió: la imagen de hoy puede no estar al día.");
    }
  }

  const imagenes: ImagenesDelArea = { version: VERSION_IMAGENES, bbox, consultadoAt, escenas, sugerida: elegirEscena(escenas)?.fecha ?? null, esri, vivas };
  if (fresco) {
    try {
      await ForestLothImagenesDB.set(tenantId, imagenes, opts.user ?? "sistema");
    } catch (err) {
      logger.error("[loth.imagenes] no se pudo guardar la caché", { error: String(err), tenantId });
    }
  }
  return { ok: true, imagenes: { ...imagenes, desdeCache: false, avisos } };
}
