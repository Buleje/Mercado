/**
 * Marcadores ArUco en la testa de las trozas (ADR-480, 2026-10-08): las reglas
 * puras que comparten la pantalla, el worker y el servidor.
 *
 * - Diccionario `DICT_4X4_250` de OpenCV (cualquier generador ArUco lo
 *   imprime igual). Ids 0-199 = trozas · 200-244 = chalecos/cascos (todavía
 *   sin uso) · 245-249 = la hoja de PRUEBA de distancia (nunca una troza).
 * - Un id cuenta como «visto» con ≥3 cuadros en ≥2 s (`confirmarMarcadores`):
 *   un cuadro suelto puede ser ruido del video.
 * - La asignación marcador → troza va por `trozaId` (el código de la troza
 *   puede cambiar, ADR-477) y se libera sola cuando la troza sale del patio.
 * - Lo visto se guarda por día de Lima: las últimas 48 pasadas + por id la
 *   primera y la última vez, en qué cámaras y en cuántas pasadas.
 *
 * PURO y sin `server-only`: lo usan el worker, la pantalla y las rutas.
 */
import { z } from "zod";
import { ARUCO_4X4_250 } from "./aruco-4x4-250";

export const DICCIONARIO_MARCADORES = "DICT_4X4_250" as const;
export const RANGO_TROZAS = { desde: 0, hasta: 199 } as const;
export const RANGO_CHALECOS = { desde: 200, hasta: 244 } as const;
/** La hoja de prueba de distancia (3/5/8 m): ids que nunca se asignan a una troza. */
export const RANGO_PRUEBA = { desde: 245, hasta: 249 } as const;
export const CONFIRMAR_CUADROS = 3;
export const CONFIRMAR_MS = 2_000;
export const CADA_CUANTO_MARCADORES_MS = 2_000;
export const MAX_PASADAS_DIA = 48;
/** Las claves de días con más de esto se borran (cron de retención). */
export const DIAS_TROZAS_VISTAS = 14;
/** Celdas por lado del marcador impreso: 4 de datos + el borde negro. */
export const CELDAS_LADO = 6;

export interface LecturaMarcador {
  id: number;
  /** ms (`Date.now()`) del cuadro. */
  at: number;
  /** Lado del cuadrado negro en px del cuadro leído. */
  ladoPx: number;
  /** Las 4 esquinas en fracciones 0-1 del cuadro. */
  esquinas: [number, number][];
}

export interface MarcadorConfirmado {
  id: number;
  primera: number;
  ultima: number;
  cuadros: number;
  /** La mediana del lado en px: dice si se leyó con holgura o de casualidad. */
  ladoPx: number;
}

export interface AsignacionMarcador {
  trozaId: string;
  asignadoEn: string;
  por: string;
}
export type AsignacionesMarcadores = Record<string, AsignacionMarcador>;

export interface PasadaMarcadores {
  en: string;
  camaraId: string;
  origen: "vivo" | "pasada";
  calidad: "hd" | "sd";
  ids: number[];
}

export interface VistoDelDia {
  primera: string;
  ultima: string;
  camaras: string[];
  pasadas: number;
}

export interface TrozasVistasDelDia {
  /** YYYY-MM-DD de Lima. */
  dia: string;
  /** Las últimas `MAX_PASADAS_DIA`, la más vieja primero. */
  pasadas: PasadaMarcadores[];
  ids: Record<string, VistoDelDia>;
}

export type EstadoTrozaALaVista = "libre" | "en_mixto" | "en_lote" | "salio" | "sin_asignar";

export interface TrozaDeMarcador {
  id: string;
  codigo: string;
  especie: string | null;
  volumenM3: number | null;
  loteCode: string | null;
}

export interface TrozaALaVista {
  marcador: number;
  estado: EstadoTrozaALaVista;
  troza: TrozaDeMarcador | null;
  /** Por qué no se puede apartar (la regla del lote, LM3); `null` = se puede. */
  motivo: string | null;
  primera: string;
  ultima: string;
  camaras: string[];
}

export interface RespuestaALaVista {
  dia: string;
  pasada: PasadaMarcadores | null;
  trozas: TrozaALaVista[];
  resumen: { vistas: number; libres: number; m3Libres: number };
}

/** Lo que el servidor sabe de la troza de un marcador (lo arma la clase DB). */
export interface EstadoDeTroza {
  troza: TrozaDeMarcador;
  estado: Exclude<EstadoTrozaALaVista, "sin_asignar">;
  motivo: string | null;
}

/* ────────────────────────────── Esquemas (Zod 4) ───────────────────────── */

const marcadorId = z.number().int().min(0).max(249);
const idSchema = z.string().trim().min(1).max(60);

export const pasadaSchema = z.object({
  en: z.iso.datetime(),
  origen: z.enum(["vivo", "pasada"]),
  calidad: z.enum(["hd", "sd"]),
  marcadores: z
    .array(
      z.object({
        id: marcadorId,
        cuadros: z.number().int().min(1).max(100),
        ladoPx: z.number().min(0).max(4000),
      }),
    )
    .max(250),
});
export type PasadaEntrada = z.infer<typeof pasadaSchema>;

export const accionMarcadoresSchema = z.discriminatedUnion("accion", [
  /** Da los ids libres más bajos (hojas A4 impresas); la troza que ya tenía uno lo conserva. */
  z.object({ accion: z.literal("asignar"), trozaIds: z.array(idSchema).min(1).max(200) }),
  /** Un marcador plastificado reusable, puesto a mano en una troza. */
  z.object({
    accion: z.literal("vincular"),
    marcador: z.number().int().min(RANGO_TROZAS.desde).max(RANGO_TROZAS.hasta),
    trozaId: idSchema,
  }),
  z.object({ accion: z.literal("liberar"), marcadores: z.array(marcadorId).min(1).max(250) }),
]);
export type AccionMarcadores = z.infer<typeof accionMarcadoresSchema>;

export const queryALaVistaSchema = z.object({
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Sin pasada = todo lo visto en el día. */
  pasada: z.iso.datetime().optional(),
  /** Filtro por ids de marcador (lo que llega de «Consumir»). */
  m: z
    .string()
    .regex(/^\d{1,3}(,\d{1,3}){0,199}$/)
    .optional(),
});

/** «3,7,12» → [3, 7, 12] (sólo ids válidos, sin repetir). */
export function idsDeParam(m: string | null | undefined): number[] {
  if (!m) return [];
  const out = new Set<number>();
  for (const p of m.split(",")) {
    const n = Number(p);
    if (Number.isInteger(n) && n >= 0 && n <= 249) out.add(n);
  }
  return [...out];
}

export const esIdDeTroza = (id: number) => id >= RANGO_TROZAS.desde && id <= RANGO_TROZAS.hasta;
export const esIdDePrueba = (id: number) => id >= RANGO_PRUEBA.desde && id <= RANGO_PRUEBA.hasta;

/* ─────────────────────────── Lectura y confirmación ───────────────────── */

function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Los ids vistos en ≥`cuadros` cuadros separados por ≥`ms` (el primero y el
 * último), mirando sólo las lecturas de los últimos `ventanaMs` antes de
 * `ahora`. Un cuadro suelto no cuenta: puede ser ruido del video.
 */
export function confirmarMarcadores(
  h: readonly LecturaMarcador[],
  ahora: number,
  opts: { cuadros?: number; ms?: number; ventanaMs?: number } = {},
): MarcadorConfirmado[] {
  const minCuadros = opts.cuadros ?? CONFIRMAR_CUADROS;
  const minMs = opts.ms ?? CONFIRMAR_MS;
  const desde = ahora - (opts.ventanaMs ?? 60_000);
  const porId = new Map<number, LecturaMarcador[]>();
  for (const l of h) {
    if (l.at < desde || l.at > ahora) continue;
    const lista = porId.get(l.id);
    if (lista) lista.push(l);
    else porId.set(l.id, [l]);
  }
  const out: MarcadorConfirmado[] = [];
  for (const [id, ls] of porId) {
    /* Un cuadro = una lectura por id: el mismo marcador dos veces en un cuadro no suma. */
    const cuadros = new Set(ls.map((l) => l.at)).size;
    const primera = Math.min(...ls.map((l) => l.at));
    const ultima = Math.max(...ls.map((l) => l.at));
    if (cuadros < minCuadros || ultima - primera < minMs) continue;
    out.push({ id, primera, ultima, cuadros, ladoPx: Math.round(mediana(ls.map((l) => l.ladoPx))) });
  }
  return out.sort((a, b) => a.id - b.id);
}

/** Px por celda del marcador leído: ≥4 se lee bien, 3 justo, menos está al límite. */
export function pxPorCelda(ladoPx: number): number {
  return Math.round((ladoPx / CELDAS_LADO) * 10) / 10;
}

export type VeredictoLectura = "holgado" | "justo" | "corto";
export function veredictoLectura(ladoPx: number): VeredictoLectura {
  const c = ladoPx / CELDAS_LADO;
  return c >= 4 ? "holgado" : c >= 3 ? "justo" : "corto";
}

/* ─────────────────────────────── Dibujo ───────────────────────────────── */

/** Las 6×6 celdas del marcador `id`, por filas; `true` = negra. */
export function celdasMarcador(id: number): boolean[][] {
  const bits = ARUCO_4X4_250[id];
  if (bits === undefined) throw new RangeError(`marcador fuera del diccionario: ${id}`);
  return Array.from({ length: CELDAS_LADO }, (_, f) =>
    Array.from({ length: CELDAS_LADO }, (_, c) => {
      if (f === 0 || c === 0 || f === CELDAS_LADO - 1 || c === CELDAS_LADO - 1) return true;
      const bit = 15 - ((f - 1) * 4 + (c - 1));
      return ((bits >> bit) & 1) === 0;
    }),
  );
}

/**
 * El marcador en SVG (sólo el cuadrado negro, 6×6 celdas). Negro puro y sin
 * suavizado (`crispEdges`): la térmica y la láser imprimen bordes nítidos.
 */
export function svgMarcador(id: number): string {
  const celdas = celdasMarcador(id);
  let rects = "";
  celdas.forEach((fila, f) =>
    fila.forEach((negra, c) => {
      if (negra) rects += `<rect x="${c}" y="${f}" width="1.02" height="1.02"/>`;
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CELDAS_LADO} ${CELDAS_LADO}" shape-rendering="crispEdges" fill="black"><rect width="${CELDAS_LADO}" height="${CELDAS_LADO}" fill="white"/>${rects}</svg>`;
}

/* ─────────────────────────── Asignación y día ─────────────────────────── */

/**
 * Los `n` ids de troza libres más bajos. Libre = nunca asignado o asignado a
 * una troza `vencida` (salió del patio). Nunca da ids de chaleco ni de prueba.
 */
export function idsLibresMasBajos(
  asignaciones: AsignacionesMarcadores,
  vencidas: ReadonlySet<string>,
  n: number,
): number[] {
  const out: number[] = [];
  for (let id = RANGO_TROZAS.desde; id <= RANGO_TROZAS.hasta && out.length < n; id++) {
    const a = asignaciones[String(id)];
    if (!a || vencidas.has(a.trozaId)) out.push(id);
  }
  return out;
}

/** El marcador que hoy tiene la troza (`null` si ninguno). */
export function marcadorDeTroza(asignaciones: AsignacionesMarcadores, trozaId: string): number | null {
  for (const [k, a] of Object.entries(asignaciones)) if (a.trozaId === trozaId) return Number(k);
  return null;
}

/** Suma una pasada al día: recorta a las últimas 48 y actualiza cada id visto. */
export function fusionarPasada(
  actual: TrozasVistasDelDia | null,
  dia: string,
  pasada: PasadaMarcadores,
): TrozasVistasDelDia {
  const base: TrozasVistasDelDia =
    actual && actual.dia === dia ? actual : { dia, pasadas: [], ids: {} };
  const pasadas = [...base.pasadas, pasada]
    .sort((a, b) => a.en.localeCompare(b.en))
    .slice(-MAX_PASADAS_DIA);
  const ids: Record<string, VistoDelDia> = { ...base.ids };
  for (const id of new Set(pasada.ids)) {
    const k = String(id);
    const v = ids[k];
    ids[k] = v
      ? {
          primera: v.primera < pasada.en ? v.primera : pasada.en,
          ultima: v.ultima > pasada.en ? v.ultima : pasada.en,
          camaras: v.camaras.includes(pasada.camaraId) ? v.camaras : [...v.camaras, pasada.camaraId],
          pasadas: v.pasadas + 1,
        }
      : { primera: pasada.en, ultima: pasada.en, camaras: [pasada.camaraId], pasadas: 1 };
  }
  return { dia, pasadas, ids };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * La lista «Trozas a la vista»: lo visto en el día (o en UNA pasada), con la
 * troza de cada marcador y si se puede apartar. `m` filtra por ids (lo que
 * llega de «Consumir»). Los ids de prueba y de chaleco no son trozas: fuera.
 */
export function armarALaVista(
  diaDatos: TrozasVistasDelDia | null,
  dia: string,
  asignaciones: AsignacionesMarcadores,
  estados: ReadonlyMap<string, EstadoDeTroza>,
  filtro: { pasada?: string; m?: readonly number[] } = {},
): RespuestaALaVista {
  const pasada = filtro.pasada
    ? (diaDatos?.pasadas.find((p) => p.en === filtro.pasada) ?? null)
    : null;
  const enPasada = pasada ? new Set(pasada.ids) : null;
  const soloM = filtro.m && filtro.m.length ? new Set(filtro.m) : null;
  const trozas: TrozaALaVista[] = [];
  for (const [k, visto] of Object.entries(diaDatos?.ids ?? {})) {
    const marcador = Number(k);
    if (!esIdDeTroza(marcador)) continue;
    if (enPasada && !enPasada.has(marcador)) continue;
    if (soloM && !soloM.has(marcador)) continue;
    /* Un id reusado: si se asignó DESPUÉS de la última vez que la cámara lo vio
       (en la pasada elegida o en el día), lo visto era otra troza. */
    const asignada = asignaciones[k];
    const vistoEn = Date.parse(pasada ? pasada.en : visto.ultima);
    const reusado = !!asignada && Date.parse(asignada.asignadoEn) > vistoEn;
    const a = reusado ? undefined : asignada;
    const e = a ? estados.get(a.trozaId) : undefined;
    trozas.push({
      marcador,
      estado: e ? e.estado : a ? "salio" : "sin_asignar",
      troza: e?.troza ?? null,
      motivo: e
        ? e.motivo
        : a
          ? "la troza ya no está en el patio"
          : reusado
            ? "la cámara lo vio con la troza anterior: se reasignó después"
            : "este marcador no está asignado a ninguna troza",
      primera: visto.primera,
      ultima: visto.ultima,
      camaras: visto.camaras,
    });
  }
  trozas.sort((x, y) => x.marcador - y.marcador);
  const libres = trozas.filter((t) => t.estado === "libre" && t.motivo === null);
  return {
    dia,
    pasada,
    trozas,
    resumen: {
      vistas: trozas.length,
      libres: libres.length,
      m3Libres: r3(libres.reduce((s, t) => s + (t.troza?.volumenM3 ?? 0), 0)),
    },
  };
}

/** El enlace de «Consumir»: Consumos › Patio con el paso «Desde la cámara». */
export function enlaceConsumirDesdeCamara(dia: string, marcadores: readonly number[], pasada?: string | null): string {
  const p = new URLSearchParams({ tab: "ctp-libro-operaciones", vista: "consumos", desdeCamara: dia });
  if (pasada) p.set("pasada", pasada);
  if (marcadores.length) p.set("m", [...new Set(marcadores)].sort((a, b) => a - b).join(","));
  return `/admin?${p.toString()}`;
}
