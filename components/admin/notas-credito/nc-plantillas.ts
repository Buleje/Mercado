/**
 * Plantillas de motivo con nombre, alcance y versión (auditoría de comprobantes F14, 17-10).
 * Guardan el motivo, su texto y las notas internas; NUNCA un monto. Viven en este navegador
 * (`localStorage`), como antes. Sin `"use client"`: puro, con test.
 */
import { MOTIVO_SUNAT_RE, REGLAS_VERSION, reglaMotivo } from "@/lib/notas-credito/motivos";
import type { NCTemplate } from "@/components/admin/notas-credito/nc-compartido";

export const CLAVE_PLANTILLAS = "nc-templates";

/** Lee las plantillas guardadas; si el JSON está roto, ninguna. */
export function leerPlantillas(crudo: string | null): NCTemplate[] {
  try {
    const v: unknown = JSON.parse(crudo ?? "[]");
    return Array.isArray(v)
      ? v.filter((t): t is NCTemplate => !!t && typeof t === "object" && typeof (t as NCTemplate).name === "string" && typeof (t as NCTemplate).codigoMotivo === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Agrega la plantilla o, si ya hay una con ese nombre (sin mirar mayúsculas), la reemplaza y sube
 * su versión. El alcance sale del motivo: los que van por todo piden el documento.
 */
export function guardarPlantilla(
  lista: readonly NCTemplate[],
  datos: { name: string; codigoMotivo: string; descripcionMotivo: string; notasText: string },
  ahoraIso: string,
  nuevoId: string,
): NCTemplate[] {
  const nombre = datos.name.trim();
  const fila: Omit<NCTemplate, "id" | "version"> = {
    name: nombre,
    codigoMotivo: datos.codigoMotivo,
    descripcionMotivo: datos.descripcionMotivo.trim(),
    ...(datos.notasText.trim() ? { notasText: datos.notasText.trim() } : {}),
    alcance: reglaMotivo(datos.codigoMotivo).requiereDocumento ? "con-documento" : "cualquiera",
    actualizada: ahoraIso,
    reglas: REGLAS_VERSION,
  };
  const i = lista.findIndex((t) => t.name.trim().toLowerCase() === nombre.toLowerCase());
  if (i < 0) return [...lista, { ...fila, id: nuevoId, version: 1 }];
  const previa = lista[i];
  return lista.map((t, j) => (j === i ? { ...fila, id: previa.id, version: (previa.version ?? 1) + 1 } : t));
}

/**
 * Qué revisar antes de usarla. `bloquea`: no se puede usar ahora (motivo fuera del catálogo, o
 * pide el documento y no hay). `aviso`: se puede, pero se guardó con reglas viejas.
 */
export function revisarPlantilla(t: NCTemplate, conDocumento: boolean): { bloquea: string | null; aviso: string | null } {
  if (!MOTIVO_SUNAT_RE.test(t.codigoMotivo)) {
    return { bloquea: `El motivo ${t.codigoMotivo} no está en el catálogo de SUNAT.`, aviso: null };
  }
  if ((t.alcance === "con-documento" || reglaMotivo(t.codigoMotivo).requiereDocumento) && !conDocumento) {
    return { bloquea: "Pide el documento de origen: elígelo en el paso 1.", aviso: null };
  }
  if (t.reglas !== REGLAS_VERSION) {
    return { bloquea: null, aviso: "Se guardó antes de las reglas por motivo: revisa el texto antes de crear." };
  }
  return { bloquea: null, aviso: null };
}
