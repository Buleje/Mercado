/**
 * fotos-guia-diff — la decisión pura detrás de `WoodEntriesDB.fotosGuia`
 * (auditoría de seguridad 2026-09-25, «Fotos de la guía»).
 *
 * `fotosGuia` reemplaza la lista ENTERA de fotos de una guía. Guardar `fotos: []`
 * sobre 10 fotos existentes las borra todas, y hasta ahora el rastro de
 * auditoría sólo decía «Guardó 0 fotos» — no qué desapareció ni quién lo hizo.
 * Acá vive, PURO y testeable sin tocar Prisma:
 *  1. qué se agregó y qué se quitó (comparando contra lo que ya había);
 *  2. si el pedido se permite — un `almacenero` puede agregar evidencia, pero
 *     no borrarla (sólo `admin`/`owner` sacan una foto ya guardada — borrosa,
 *     repetida, o la que ya no corresponde);
 *  3. la línea de auditoría, con nombres de archivo, no sólo un conteo.
 */

/** Comparación previas→nuevas: qué entró y qué salió. */
export interface DiffFotosGuia {
  agregadas: string[];
  quitadas: string[];
}

/** `diff(previas, nuevas)` — el orden de las listas no importa, el contenido sí. */
export function diffFotosGuia(previas: readonly string[], nuevas: readonly string[]): DiffFotosGuia {
  return {
    agregadas: nuevas.filter((u) => !previas.includes(u)),
    quitadas: previas.filter((u) => !nuevas.includes(u)),
  };
}

/**
 * `null` = permitido. Un texto = motivo del rechazo (lo que ve el operador).
 *
 * Sólo el que QUITA una foto necesita ser admin/owner; agregar (o mandar la
 * misma lista) nunca se bloquea, sea cual sea el rol.
 */
export function motivoSiNoPuedeGuardar(quitadas: readonly string[], role: string | undefined): string | null {
  if (quitadas.length === 0) return null;
  if (role === "almacenero") {
    return "El almacenero puede agregar fotos, pero no quitarlas — pedile a un admin o al dueño que saque una foto ya guardada.";
  }
  return null;
}

/** El nombre de archivo (último tramo de la URL) — lo que se audita, no la URL entera. */
export function nombreDeFoto(url: string): string {
  return url.split("/").pop() || url;
}

/** «Fotos de la guía X (N asientos): 2 → 3 · agregó a.webp · quitó b.webp». */
export function detalleDeFotosGuia(
  gtf: string,
  asientos: number,
  previas: readonly string[],
  nuevas: readonly string[],
  diff: DiffFotosGuia,
): string {
  const partes = [`Fotos de la guía ${gtf} (${asientos} asiento${asientos === 1 ? "" : "s"}): ${previas.length} → ${nuevas.length}`];
  if (diff.agregadas.length > 0) partes.push(`agregó ${diff.agregadas.map(nombreDeFoto).join(", ")}`);
  if (diff.quitadas.length > 0) partes.push(`quitó ${diff.quitadas.map(nombreDeFoto).join(", ")}`);
  return partes.join(" · ");
}
