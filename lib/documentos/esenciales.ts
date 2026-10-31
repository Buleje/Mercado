/**
 * Pestaña «Esenciales» de Documentos (Brandon 23-10): las carpetas que marcas
 * en el Archivo («Llevar a Esenciales») se ven juntas, grandes y con sus
 * detalles; al elegir una, su contenido se abre en un panel al costado. Ahí
 * van los papeles más valiosos y más usados del negocio.
 *
 * La marca es una ETIQUETA de máquina de la carpeta (`marca:esencial`), igual
 * que el vínculo con un tercero (ADR-502): sin schema, la pone y la quita
 * `folders/bulk` (addTags/removeTags), que ya valida rol, CSRF y tope.
 *
 * Puro y sin `server-only`: lo usan la pestaña, el menú de la carpeta y los tests.
 */

import { conSubcarpetas, type CarpetaMin, type DocMin, type UsoCarpeta } from "./terceros-vinculo";

export const TAG_ESENCIAL = "marca:esencial";

/** Las etiquetas `marca:` son de máquina: no se muestran como etiqueta de la carpeta. */
export const esTagDeMarca = (tag: string): boolean => tag.trim().toLowerCase().startsWith("marca:");

export const esEsencial = (f: { tags?: readonly string[] | null }): boolean =>
  (f.tags ?? []).some((t) => t.trim().toLowerCase() === TAG_ESENCIAL);

/** Aperturas de un papel en los últimos 90 días (lo que devuelve `/api/admin/documents/uso`). */
export type UsoDoc = UsoCarpeta;

export interface DocEsencial extends DocMin {
  size?: number;
}

export interface CarpetaEsencial<C extends CarpetaMin = CarpetaMin> {
  carpeta: C;
  /** Dónde vive: de la raíz a su carpeta madre («Contratos › 2026»). Vacío = en la raíz. */
  ruta: string[];
  /** La carpeta y todas sus subcarpetas visibles. */
  carpetaIds: Set<string>;
  /** Subcarpetas directas. */
  subcarpetas: number;
  /** Papeles adentro, contando las subcarpetas. */
  docs: number;
  bytes: number;
  vistas: number;
  /** Lo último que pasó: la última apertura o el último papel que entró. */
  ultima: string | null;
  vencidos: number;
  porVencer: number;
}

const DIA = 86_400_000;
const masReciente = (a: string | null, b: string | null): string | null => (a && b ? (a > b ? a : b) : (a ?? b));
const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** El camino de la carpeta desde la raíz hasta su madre. */
export function rutaDe(id: string, porId: ReadonlyMap<string, CarpetaMin>): string[] {
  const ruta: string[] = [];
  const visto = new Set<string>([id]);
  for (let p = porId.get(id)?.parentId ?? null; p && !visto.has(p); p = porId.get(p)?.parentId ?? null) {
    visto.add(p);
    ruta.unshift(porId.get(p)?.name ?? "…");
  }
  return ruta;
}

/**
 * Las carpetas marcadas que el rol VE, con sus números. Los papeles cuentan
 * sólo si están en `docs` (ya filtrados por rol y candado) y las aperturas,
 * sólo las de esos papeles.
 */
export function armarEsenciales<C extends CarpetaMin>(args: {
  carpetas: readonly C[];
  docs: readonly DocEsencial[];
  uso?: Record<string, UsoDoc>;
  hoy?: Date;
}): CarpetaEsencial<C>[] {
  const { carpetas, docs, uso = {} } = args;
  const hoy = (args.hoy ?? new Date()).getTime();
  const porId = new Map<string, CarpetaMin>(carpetas.map((c) => [c.id, c]));
  const docsPorCarpeta = new Map<string, DocEsencial[]>();
  for (const d of docs) {
    if (!d.folderId) continue;
    const lista = docsPorCarpeta.get(d.folderId) ?? [];
    lista.push(d);
    docsPorCarpeta.set(d.folderId, lista);
  }
  return carpetas.filter(esEsencial).map((carpeta) => {
    const carpetaIds = conSubcarpetas([carpeta.id], carpetas);
    let n = 0, bytes = 0, vistas = 0, vencidos = 0, porVencer = 0;
    let ultima: string | null = null;
    for (const id of carpetaIds) {
      for (const d of docsPorCarpeta.get(id) ?? []) {
        n++;
        bytes += d.size ?? 0;
        ultima = masReciente(ultima, d.uploadedAt);
        const u = uso[d.id];
        if (u) { vistas += u.vistas; ultima = masReciente(ultima, u.ultima); }
        const vence = d.expiresAt ? Date.parse(d.expiresAt) : NaN;
        if (Number.isFinite(vence)) {
          if (vence < hoy) vencidos++;
          else if (vence - hoy <= 30 * DIA) porVencer++;
        }
      }
    }
    const subcarpetas = carpetas.filter((c) => c.parentId === carpeta.id).length;
    return { carpeta, ruta: rutaDe(carpeta.id, porId), carpetaIds, subcarpetas, docs: n, bytes, vistas, ultima, vencidos, porVencer };
  });
}

export type OrdenEsenciales = "manual" | "uso" | "reciente" | "nombre";

/**
 * Más usada: aperturas, lo más reciente, más papeles, nombre. «Mi orden»
 * (`manual`) sigue la lista guardada; lo que no está en ella (una carpeta
 * marcada después) va al final, por uso.
 */
export function ordenarEsenciales<C extends CarpetaMin>(
  lista: readonly CarpetaEsencial<C>[],
  orden: OrdenEsenciales,
  ordenManual: readonly string[] = [],
): CarpetaEsencial<C>[] {
  const nombre = (a: CarpetaEsencial<C>, b: CarpetaEsencial<C>) => a.carpeta.name.localeCompare(b.carpeta.name, "es", { numeric: true });
  const reciente = (a: CarpetaEsencial<C>, b: CarpetaEsencial<C>) => (b.ultima ?? "").localeCompare(a.ultima ?? "");
  const uso = (a: CarpetaEsencial<C>, b: CarpetaEsencial<C>) => b.vistas - a.vistas || reciente(a, b) || b.docs - a.docs || nombre(a, b);
  const copia = [...lista];
  if (orden === "nombre") return copia.sort(nombre);
  if (orden === "reciente") return copia.sort((a, b) => reciente(a, b) || nombre(a, b));
  if (orden === "manual") {
    const lugar = new Map(ordenManual.map((id, i) => [id, i] as const));
    const pos = (e: CarpetaEsencial<C>) => lugar.get(e.carpeta.id) ?? Number.POSITIVE_INFINITY;
    return copia.sort((a, b) => pos(a) - pos(b) || uso(a, b));
  }
  return copia.sort(uso);
}

/** Mueve `id` para que quede justo antes de `antesDe` (o al final si es null). Devuelve la lista nueva de ids. */
export function moverEnOrden(ids: readonly string[], id: string, antesDe: string | null): string[] {
  const sin = ids.filter((x) => x !== id);
  const i = antesDe ? sin.indexOf(antesDe) : -1;
  if (i < 0) return [...sin, id];
  return [...sin.slice(0, i), id, ...sin.slice(i)];
}

/** Por nombre o por dónde vive (sin tildes). */
export function filtrarEsenciales<C extends CarpetaMin>(lista: readonly CarpetaEsencial<C>[], q: string): CarpetaEsencial<C>[] {
  const aguja = sinTildes(q.trim());
  if (!aguja) return [...lista];
  return lista.filter((e) => sinTildes(`${e.carpeta.name} ${e.ruta.join(" ")}`).includes(aguja));
}

/** Lo que hay directamente adentro: subcarpetas (por nombre) y papeles. */
export function contenidoDe<C extends CarpetaMin, D extends DocMin>(
  carpetaId: string,
  carpetas: readonly C[],
  docs: readonly D[],
): { subcarpetas: C[]; docs: D[] } {
  return {
    subcarpetas: carpetas
      .filter((c) => c.parentId === carpetaId)
      .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })),
    docs: docs.filter((d) => d.folderId === carpetaId),
  };
}

/** Los papeles más abiertos de un grupo (sólo los que se abrieron), hasta `n`. */
export function masAbiertos<D extends DocMin>(docs: readonly D[], uso: Record<string, UsoDoc>, n = 3): D[] {
  return docs
    .filter((d) => (uso[d.id]?.vistas ?? 0) > 0)
    .sort((a, b) => (uso[b.id]?.vistas ?? 0) - (uso[a.id]?.vistas ?? 0) || (uso[b.id]?.ultima ?? "").localeCompare(uso[a.id]?.ultima ?? ""))
    .slice(0, n);
}

export interface SugerenciaEsencial<C extends CarpetaMin = CarpetaMin> {
  carpeta: C;
  /** Aperturas de sus papeles (los que están directamente en ella) en 90 días. */
  vistas: number;
  ruta: string[];
}

/**
 * Carpetas que convendría llevar a Esenciales: las que más se abren y todavía
 * no están (ni cuelgan de una que ya está). En Blas, 23-10: 1 sola esencial y
 * «Registro de plantación» con 8 aperturas, «Guías forestales» con 5.
 */
export function sugerirEsenciales<C extends CarpetaMin>(args: {
  carpetas: readonly C[];
  docs: readonly DocMin[];
  uso: Record<string, UsoDoc>;
  descartadas?: readonly string[];
  minimo?: number;
  n?: number;
}): SugerenciaEsencial<C>[] {
  const { carpetas, docs, uso, descartadas = [], minimo = 3, n = 3 } = args;
  const porId = new Map<string, CarpetaMin>(carpetas.map((c) => [c.id, c]));
  const cubiertas = conSubcarpetas(carpetas.filter(esEsencial).map((c) => c.id), carpetas);
  const fuera = new Set(descartadas);
  const vistas = new Map<string, number>();
  for (const d of docs) {
    const u = uso[d.id];
    if (!u || !d.folderId) continue;
    vistas.set(d.folderId, (vistas.get(d.folderId) ?? 0) + u.vistas);
  }
  return carpetas
    .filter((c) => !cubiertas.has(c.id) && !fuera.has(c.id) && (vistas.get(c.id) ?? 0) >= minimo)
    .map((carpeta) => ({ carpeta, vistas: vistas.get(carpeta.id) ?? 0, ruta: rutaDe(carpeta.id, porId) }))
    .sort((a, b) => b.vistas - a.vistas || a.carpeta.name.localeCompare(b.carpeta.name, "es"))
    .slice(0, n);
}

/**
 * Fechas de vencimiento que la lectura encontró («Fecha de caducidad») y que
 * todavía no están puestas en el papel. El aviso por WhatsApp y la campana
 * miran `expiresAt`, no la sugerencia: sin confirmar, el aviso no llega.
 */
export function vencimientosEncontrados<D extends DocMin & { ocrMetadata?: Record<string, unknown> | null; deletedAt?: string | null }>(
  docs: readonly D[],
  descartados: ReadonlySet<string> = new Set(),
): { doc: D; fecha: string }[] {
  const salida: { doc: D; fecha: string }[] = [];
  for (const d of docs) {
    if (d.deletedAt || d.expiresAt || descartados.has(d.id)) continue;
    const sug = d.ocrMetadata?.sugerencias as { expiresAt?: unknown } | null | undefined;
    const fecha = typeof sug?.expiresAt === "string" ? sug.expiresAt : null;
    if (fecha && Number.isFinite(Date.parse(fecha))) salida.push({ doc: d, fecha });
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
