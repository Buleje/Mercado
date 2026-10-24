/**
 * lib/documentos/inspeccion-indice.ts — qué entra en la hoja «Para inspección»
 * de Esenciales (Brandon 24-10: SERFOR/OSINFOR/SUNAT llegan y piden los
 * papeles). Puro: lo arma el navegador con lo que el Archivo ya trajo.
 *
 * Regla: la hoja lista EXACTAMENTE lo que el QR deja ver. El enlace de carpeta
 * sirve los papeles directos de cada carpeta (sin subcarpetas) y, si algo tiene
 * permisos o candado, sólo lo que quien crea el enlace puede ver hoy
 * (`DocumentsDB.docsDelEnlaceDeCarpeta` → `enlaceSigueSirviendo`). Acá se aplica
 * la misma regla, así un papel con candado no sale con su nombre en un papel
 * impreso que se lleva un tercero.
 */

import { enlaceSigueSirviendo, rolesDeLaCadena, type CarpetaConRoles } from "@/lib/documents/doc-access";
import { etiquetaTipo } from "@/lib/documents/tipos-archivo";

export type EstadoVence = "vencido" | "por-vencer" | "vigente" | "sin-fecha";

/** Igual que las tarjetas de Esenciales: por vencer = 30 días o menos. */
export const DIAS_POR_VENCER = 30;
const DIA = 86_400_000;

export interface PapelDeLaHoja {
  id: string;
  nombre: string;
  tipo: string;
  subido: string;
  vence: string | null;
  estado: EstadoVence;
}

export interface CarpetaDeLaHoja {
  id: string;
  nombre: string;
  /** De la raíz a su carpeta madre. Vacío = en la raíz. */
  ruta: string[];
  papeles: PapelDeLaHoja[];
  /** Papeles de sus subcarpetas: no van en el enlace ni en la hoja. */
  enSubcarpetas: number;
  /** Papeles directos que el enlace no mostraría (permisos/candado de quien lo crea). */
  ocultos: number;
  /**
   * De los que SÍ van, cuántos tienen candado (suyo o de una carpeta de la cadena):
   * el dueño y el admin los ven, así que el QR también los abre (seguridad 24-10:
   * el modal decía «nunca los que tienen candado»). Se avisa antes de crear el enlace.
   */
  conCandado: number;
}

export interface CuentaDeLaHoja {
  papeles: number;
  vencidos: number;
  porVencer: number;
  vigentes: number;
  sinFecha: number;
}

interface CarpetaMin extends CarpetaConRoles {
  id: string;
  name: string;
}

interface DocMin {
  id: string;
  name: string;
  mimeType: string;
  folderId: string | null;
  uploadedAt: string;
  expiresAt: string | null;
  allowedRoles?: string[] | null;
  deletedAt?: string | null;
}

export function estadoDeVencimiento(expiresAt: string | null | undefined, ahora: number): EstadoVence {
  const t = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(t)) return "sin-fecha";
  if (t < ahora) return "vencido";
  return t - ahora <= DIAS_POR_VENCER * DIA ? "por-vencer" : "vigente";
}

const PESO: Record<EstadoVence, number> = { vencido: 0, "por-vencer": 1, vigente: 2, "sin-fecha": 3 };

function rutaDe(id: string, porId: ReadonlyMap<string, CarpetaMin>): string[] {
  const ruta: string[] = [];
  const vistas = new Set<string>([id]);
  let p = porId.get(id)?.parentId ?? null;
  while (p && !vistas.has(p) && ruta.length < 20) {
    vistas.add(p);
    const c = porId.get(p);
    if (!c) break;
    ruta.unshift(c.name);
    p = c.parentId;
  }
  return ruta;
}

/**
 * Las carpetas elegidas (en ese orden) con sus papeles directos visibles por el
 * enlace. Dentro de cada carpeta: lo vencido y lo que vence pronto primero,
 * después por nombre.
 */
export function indiceParaInspeccion<C extends CarpetaMin, D extends DocMin>(args: {
  elegidas: readonly C[];
  carpetas: readonly C[];
  docs: readonly D[];
  rol: string | null;
  ahora: number;
}): CarpetaDeLaHoja[] {
  const { elegidas, carpetas, docs, rol, ahora } = args;
  const porId = new Map<string, C>(carpetas.map((c) => [c.id, c]));
  const hijas = new Map<string, string[]>();
  for (const c of carpetas) if (c.parentId) hijas.set(c.parentId, [...(hijas.get(c.parentId) ?? []), c.id]);
  const vivos = docs.filter((d) => !d.deletedAt && d.folderId);
  const porCarpeta = new Map<string, D[]>();
  for (const d of vivos) porCarpeta.set(d.folderId as string, [...(porCarpeta.get(d.folderId as string) ?? []), d]);

  return elegidas.map((c) => {
    const cadena = rolesDeLaCadena(c.id, porId);
    const directos = porCarpeta.get(c.id) ?? [];
    const sirve = directos.filter((d) => enlaceSigueSirviendo(rol, d.allowedRoles ?? [], cadena));
    // Si la carpeta misma está cerrada para quien crea el enlace, el enlace no la sirve.
    const carpetaSirve = cadena.length === 0 || enlaceSigueSirviendo(rol, [], cadena);
    const lista = carpetaSirve ? sirve : [];

    let enSub = 0;
    const pila = [...(hijas.get(c.id) ?? [])];
    const vistas = new Set<string>();
    while (pila.length) {
      const id = pila.pop() as string;
      if (vistas.has(id)) continue;
      vistas.add(id);
      enSub += porCarpeta.get(id)?.length ?? 0;
      pila.push(...(hijas.get(id) ?? []));
    }

    const papeles = lista
      .map((d): PapelDeLaHoja => ({
        id: d.id,
        nombre: d.name,
        // «Hoja de cálculo», «Imagen», «PDF»: la extensión ya va en el nombre
        // (y «PDF · PDF» o «Hoja de cálculo · XLSX» partían la columna en dos).
        tipo: etiquetaTipo(d.name, d.mimeType).split(" · ")[0],
        subido: d.uploadedAt,
        vence: d.expiresAt,
        estado: estadoDeVencimiento(d.expiresAt, ahora),
      }))
      .sort((a, b) => PESO[a.estado] - PESO[b.estado] || a.nombre.localeCompare(b.nombre, "es", { numeric: true }));

    const conCandado = lista.filter((d) => cadena.length > 0 || (d.allowedRoles?.length ?? 0) > 0).length;
    return {
      id: c.id,
      nombre: c.name,
      ruta: rutaDe(c.id, porId),
      papeles,
      enSubcarpetas: enSub,
      ocultos: directos.length - lista.length,
      conCandado,
    };
  });
}

export function contarHoja(carpetas: readonly CarpetaDeLaHoja[]): CuentaDeLaHoja {
  const n: CuentaDeLaHoja = { papeles: 0, vencidos: 0, porVencer: 0, vigentes: 0, sinFecha: 0 };
  for (const c of carpetas) {
    for (const p of c.papeles) {
      n.papeles++;
      if (p.estado === "vencido") n.vencidos++;
      else if (p.estado === "por-vencer") n.porVencer++;
      else if (p.estado === "vigente") n.vigentes++;
      else n.sinFecha++;
    }
  }
  return n;
}

/** «14 papeles · 1 vencido · 2 por vencer» (lo que va en la nota y en la hoja). */
export function resumenDeLaHoja(n: CuentaDeLaHoja): string {
  const partes = [`${n.papeles} papel${n.papeles === 1 ? "" : "es"}`];
  if (n.vencidos) partes.push(`${n.vencidos} vencido${n.vencidos === 1 ? "" : "s"}`);
  if (n.porVencer) partes.push(`${n.porVencer} por vencer`);
  if (n.vigentes) partes.push(`${n.vigentes} vigente${n.vigentes === 1 ? "" : "s"}`);
  if (n.sinFecha) partes.push(`${n.sinFecha} sin fecha de vencimiento`);
  return partes.join(" · ");
}
