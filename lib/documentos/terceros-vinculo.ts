/**
 * Pestaña «Terceros» del Archivo: carpetas VINCULADAS a una persona, proveedor,
 * cliente, colaborador, comunidad/titular forestal u otro (Brandon 23-10:
 * «los documentos de terceros que tengo asociados… navegar más fácil, filtrado
 * lo más usado»).
 *
 * El vínculo es una ETIQUETA de la carpeta con el mismo formato de máquina de
 * ADR-502 (`<prefijo>:<id>`): sin schema, una carpeta puede tener varios
 * terceros y un tercero varias carpetas. Persona y colaborador reusan los
 * prefijos que ya usan sus papeles (`tercero:` = la persona de Adelantos,
 * `colaborador:` = Equipo), así sus documentos y sus carpetas hablan del mismo.
 *
 * Puro y sin `server-only`: lo usan la pestaña, el menú de la carpeta y el
 * endpoint que pone nombre a cada vínculo.
 */

import { PREFIJO_ENTIDAD } from "./enlaces-entidad";

export const TIPOS_TERCERO = ["persona", "proveedor", "cliente", "colaborador", "comunidad", "otro"] as const;
export type TipoTercero = (typeof TIPOS_TERCERO)[number];

export const PREFIJO_VINCULO: Record<TipoTercero, string> = {
  persona: PREFIJO_ENTIDAD.tercero,
  proveedor: "proveedor:",
  cliente: "cliente:",
  colaborador: PREFIJO_ENTIDAD.colaborador,
  comunidad: "parte:",
  otro: "otro:",
};

export const TIPO_TERCERO_LABEL: Record<TipoTercero, { uno: string; varios: string }> = {
  persona: { uno: "Persona", varios: "Personas" },
  proveedor: { uno: "Proveedor", varios: "Proveedores" },
  cliente: { uno: "Cliente", varios: "Clientes" },
  colaborador: { uno: "Colaborador", varios: "Equipo" },
  comunidad: { uno: "Comunidad o titular", varios: "Comunidades y titulares" },
  otro: { uno: "Otro", varios: "Otros" },
};

/** Tope de una etiqueta de carpeta (lo valida `folders/bulk`). */
export const TOPE_ETIQUETA = 40;

/** La etiqueta que ata la carpeta al tercero. Minúsculas: `bulkFolders` las guarda así. */
export function claveVinculo(tipo: TipoTercero, id: string): string {
  return `${PREFIJO_VINCULO[tipo]}${id.trim()}`.toLowerCase();
}

/** Lee una etiqueta de carpeta; null si no es un vínculo. */
export function leerVinculo(tag: string): { tipo: TipoTercero; id: string } | null {
  const t = tag.trim().toLowerCase();
  for (const tipo of TIPOS_TERCERO) {
    const p = PREFIJO_VINCULO[tipo];
    if (t.startsWith(p) && t.length > p.length) return { tipo, id: t.slice(p.length) };
  }
  return null;
}

export const esTagDeVinculo = (tag: string): boolean => leerVinculo(tag) !== null;

/** Las claves de tercero de una carpeta (sin repetir). */
export function vinculosDeCarpeta(f: { tags?: readonly string[] | null }): string[] {
  const claves = new Set<string>();
  for (const tag of f.tags ?? []) {
    const v = leerVinculo(tag);
    if (v) claves.add(claveVinculo(v.tipo, v.id));
  }
  return [...claves];
}

/** «Otro» no tiene ficha: el nombre ES el id (recortado para que la etiqueta entre en 40). */
export function idDeOtro(nombre: string): string {
  return nombre.replace(/[:,]/g, " ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, TOPE_ETIQUETA - PREFIJO_VINCULO.otro.length).trim();
}

/** El nombre legible de un «otro» (la etiqueta quedó en minúsculas). */
export function nombreDeOtro(id: string): string {
  return id.replace(/(^|\s)(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toUpperCase());
}

export interface CarpetaMin {
  id: string;
  name: string;
  parentId: string | null;
  tags?: string[];
  documentCount?: number;
}
export interface DocMin {
  id: string;
  folderId: string | null;
  name: string;
  uploadedAt: string;
  updatedAt?: string;
  expiresAt?: string | null;
}
export interface UsoCarpeta {
  vistas: number;
  ultima: string | null;
}
export interface NombreTercero {
  nombre: string;
  detalle?: string | null;
  /** Cómo lo llama el negocio («Santa Rosa»): `admin_prefs["vinculoAlias:<clave>"]`, por tercero. */
  alias?: string | null;
}

export interface TerceroVinculado {
  clave: string;
  tipo: TipoTercero;
  id: string;
  nombre: string;
  detalle: string | null;
  /** Las carpetas vinculadas (las que el rol ve). */
  carpetas: CarpetaMin[];
  /** Esas carpetas y todas sus subcarpetas visibles. */
  carpetaIds: Set<string>;
  docs: number;
  vistas: number;
  /** Lo último que pasó: la última vez que se abrió algo o el último papel que entró. */
  ultima: string | null;
  vencidos: number;
  porVencer: number;
}

const DIA = 86_400_000;

/** La carpeta y todo lo que cuelga de ella, entre las carpetas que se ven. */
export function conSubcarpetas(raices: readonly string[], carpetas: readonly CarpetaMin[]): Set<string> {
  const hijos = new Map<string, string[]>();
  for (const c of carpetas) {
    if (!c.parentId) continue;
    const lista = hijos.get(c.parentId) ?? [];
    lista.push(c.id);
    hijos.set(c.parentId, lista);
  }
  const visto = new Set<string>();
  const pila = [...raices];
  while (pila.length > 0) {
    const id = pila.pop() as string;
    if (visto.has(id)) continue;
    visto.add(id);
    for (const h of hijos.get(id) ?? []) pila.push(h);
  }
  return visto;
}

const masReciente = (a: string | null, b: string | null): string | null => (a && b ? (a > b ? a : b) : (a ?? b));

/** Nombre a mostrar cuando el endpoint no lo resolvió (la ficha se borró o no carga). */
export function nombrePorDefecto(tipo: TipoTercero, id: string): string {
  return tipo === "otro" ? nombreDeOtro(id) : `${TIPO_TERCERO_LABEL[tipo].uno} sin ficha`;
}

/**
 * Arma la lista de terceros vinculados desde lo que el rol VE: una etiqueta en
 * una carpeta que no está en `carpetas` no aparece, y los papeles se cuentan
 * sólo si están en `docs` (que ya viene filtrado por rol y candado).
 * Ordenada por uso: más aperturas, lo más reciente, más papeles, nombre.
 */
export function armarTerceros(args: {
  carpetas: readonly CarpetaMin[];
  docs: readonly DocMin[];
  nombres?: Record<string, NombreTercero>;
  uso?: Record<string, UsoCarpeta>;
  hoy?: Date;
}): TerceroVinculado[] {
  const { carpetas, docs, nombres = {}, uso = {} } = args;
  const hoy = (args.hoy ?? new Date()).getTime();
  const raicesPorClave = new Map<string, CarpetaMin[]>();
  for (const c of carpetas) {
    for (const clave of vinculosDeCarpeta(c)) {
      const lista = raicesPorClave.get(clave) ?? [];
      lista.push(c);
      raicesPorClave.set(clave, lista);
    }
  }
  const docsPorCarpeta = new Map<string, DocMin[]>();
  for (const d of docs) {
    if (!d.folderId) continue;
    const lista = docsPorCarpeta.get(d.folderId) ?? [];
    lista.push(d);
    docsPorCarpeta.set(d.folderId, lista);
  }
  const lista: TerceroVinculado[] = [];
  for (const [clave, raices] of raicesPorClave) {
    const v = leerVinculo(clave);
    if (!v) continue;
    const carpetaIds = conSubcarpetas(raices.map((c) => c.id), carpetas);
    let n = 0, vistas = 0, vencidos = 0, porVencer = 0;
    let ultima: string | null = null;
    for (const id of carpetaIds) {
      const u = uso[id];
      if (u) { vistas += u.vistas; ultima = masReciente(ultima, u.ultima); }
      for (const d of docsPorCarpeta.get(id) ?? []) {
        n++;
        ultima = masReciente(ultima, d.uploadedAt);
        const vence = d.expiresAt ? Date.parse(d.expiresAt) : NaN;
        if (Number.isFinite(vence)) {
          if (vence < hoy) vencidos++;
          else if (vence - hoy <= 30 * DIA) porVencer++;
        }
      }
    }
    const nombre = nombres[clave];
    lista.push({
      clave, tipo: v.tipo, id: v.id,
      nombre: nombre?.alias?.trim() || nombre?.nombre?.trim() || nombrePorDefecto(v.tipo, v.id),
      detalle: nombre?.detalle ?? null,
      carpetas: raices, carpetaIds, docs: n, vistas, ultima, vencidos, porVencer,
    });
  }
  return lista.sort(porUso);
}

/** Más usado primero: aperturas, lo más reciente, cantidad de papeles, nombre. */
export function porUso(a: TerceroVinculado, b: TerceroVinculado): number {
  return (
    b.vistas - a.vistas ||
    (b.ultima ?? "").localeCompare(a.ultima ?? "") ||
    b.docs - a.docs ||
    a.nombre.localeCompare(b.nombre, "es")
  );
}

/** Los más usados: los que se abrieron en los últimos 90 días (hasta `n`). */
export function masUsados(lista: readonly TerceroVinculado[], n = 5): TerceroVinculado[] {
  return lista.filter((t) => t.vistas > 0).slice(0, n);
}

/** Por tipo, en el orden de `TIPOS_TERCERO`; sólo los tipos que tienen alguno. */
export function agruparPorTipo(lista: readonly TerceroVinculado[]): { tipo: TipoTercero; terceros: TerceroVinculado[] }[] {
  return TIPOS_TERCERO.map((tipo) => ({ tipo, terceros: lista.filter((t) => t.tipo === tipo) })).filter((g) => g.terceros.length > 0);
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Filtra por nombre o detalle (sin tildes) y, si se pide, por tipo. */
export function filtrarTerceros(lista: readonly TerceroVinculado[], q: string, tipo?: TipoTercero | null): TerceroVinculado[] {
  const aguja = sinTildes(q.trim());
  return lista.filter((t) => (!tipo || t.tipo === tipo) && (!aguja || sinTildes(`${t.nombre} ${t.detalle ?? ""}`).includes(aguja)));
}

/** Los papeles del tercero: los de sus carpetas y subcarpetas. */
export function docsDelTercero<T extends DocMin>(t: Pick<TerceroVinculado, "carpetaIds">, docs: readonly T[]): T[] {
  return docs.filter((d) => !!d.folderId && t.carpetaIds.has(d.folderId));
}

export type OrdenDocsTercero = "fecha" | "nombre" | "vencimiento";

/** Fecha: lo último primero. Vencimiento: lo que vence antes primero; sin fecha al final. */
export function ordenarDocsTercero<T extends DocMin>(docs: readonly T[], orden: OrdenDocsTercero): T[] {
  const copia = [...docs];
  if (orden === "nombre") return copia.sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
  if (orden === "vencimiento") {
    return copia.sort((a, b) => {
      const va = a.expiresAt ? Date.parse(a.expiresAt) : Infinity;
      const vb = b.expiresAt ? Date.parse(b.expiresAt) : Infinity;
      return va - vb || b.uploadedAt.localeCompare(a.uploadedAt);
    });
  }
  return copia.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}
