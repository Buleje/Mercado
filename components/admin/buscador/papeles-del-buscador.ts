/**
 * Papeles del Archivo dentro del buscador del panel (⌘K): de la lista que
 * devuelve `GET /api/admin/documents?q=` a las filas del grupo «Papeles».
 * Puro (sin fetch ni React) para poder probarlo.
 *
 * Cada fila lleva el nombre, la carpeta en corto («Personal › DNI») y, si el
 * papel vence, cuándo; el vencido se marca en rojo. Al final, un ítem que abre
 * el Archivo con la misma búsqueda puesta.
 */

import { FolderOpen } from "@buleje/design-system/icons";
import { diasHasta, textoCuando } from "@/lib/documentos/aviso-vencimiento";
import { folderPath } from "@/lib/documentos/folder-tree";
import { hrefDe, hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { formatDate } from "@/lib/format";
import { formatoCodigoDocumento, leerCodigoDocumento } from "@/lib/documentos/codigo-documento";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import type { SearchResult } from "./indice-modulos";

/** Cuántos papeles se muestran en el grupo. */
export const MAX_PAPELES = 5;
/** Cuántos se piden al servidor: sobra para reordenar por nombre y quedarse con 5. */
export const LIMITE_PEDIDO = 12;
/** Dentro de estos días el vencimiento se dice en palabras («vence en 3 días»); más lejos, con la fecha. */
const DIAS_EN_PALABRAS = 60;

/** Sin mayúsculas ni tildes, para comparar «Cédula» con «cedula». */
function plano(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Cuántas palabras de lo escrito aparecen en el nombre (el servidor ordena por fecha, no por relevancia). */
function coincidencias(nombre: string, palabras: string[]): number {
  const n = plano(nombre);
  return palabras.reduce((acc, p) => acc + (n.includes(p) ? 1 : 0), 0);
}

/** «Personal › DNI»: los dos últimos niveles de la carpeta; «Archivo» si el papel está suelto. */
export function rutaCorta(folderId: string | null, porId: Map<string, DbDocumentFolder>): string {
  if (!folderId) return "Archivo";
  const nombres = folderPath(porId, folderId).map((f) => f.name);
  return nombres.length === 0 ? "Archivo" : nombres.slice(-2).join(" › ");
}

/** El vencimiento en una frase corta, o null si el papel no vence. */
export function vencimientoDe(expiresAt: string | null): { texto: string; vencido: boolean } | null {
  const dias = diasHasta(expiresAt);
  if (dias === null) return null;
  const vencido = dias < 0;
  if (Math.abs(dias) <= DIAS_EN_PALABRAS) {
    const t = textoCuando(dias);
    return { texto: t.charAt(0).toUpperCase() + t.slice(1), vencido };
  }
  return { texto: `${vencido ? "Venció" : "Vence"} ${formatDate(expiresAt)}`, vencido };
}

/** Las filas del grupo «Papeles» para lo que se escribió. Vacío si no hay ninguno. */
export function papelesComoResultados(
  texto: string,
  documentos: readonly DbDocument[],
  carpetas: readonly DbDocumentFolder[],
): SearchResult[] {
  const q = texto.trim();
  const vivos = documentos.filter((d) => !d.deletedAt);
  if (q.length < 2 || vivos.length === 0) return [];

  const porId = new Map(carpetas.map((c) => [c.id, c]));
  const palabras = plano(q).split(/\s+/).filter(Boolean);
  // ADR-516 — «DOC-000123» o «123»: el papel con ese código va primero.
  const codigo = leerCodigoDocumento(q);
  /* sort() es estable: a igual cantidad de coincidencias queda el orden del servidor. */
  const elegidos = vivos
    .map((d) => ({ d, n: codigo != null && d.codigo === codigo ? Number.MAX_SAFE_INTEGER : coincidencias(d.name, palabras) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, MAX_PAPELES)
    .map(({ d }) => d);

  const filas: SearchResult[] = elegidos.map((d) => {
    const vence = vencimientoDe(d.expiresAt);
    return {
      id: `papel-${d.id}`,
      type: "papel",
      title: d.name,
      subtitle: [formatoCodigoDocumento(d.codigo), rutaCorta(d.folderId, porId)].filter(Boolean).join(" · "),
      href: hrefDe("papel", d.id) ?? undefined,
      ...(vence ? { vence } : {}),
    };
  });

  filas.push({
    id: "papel-buscar-en-el-archivo",
    type: "papel",
    title: `Buscar “${q}” en el Archivo`,
    subtitle: "Ver todos los resultados",
    href: hrefDeDestino({ tab: "documentos", params: { vista: "drive", q } }),
    icono: FolderOpen,
    sinContar: true,
  });
  return filas;
}
