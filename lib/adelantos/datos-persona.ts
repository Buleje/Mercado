/**
 * Qué datos le faltan a una persona y cómo se guarda uno solo sin borrar el resto.
 *
 * El PATCH de beneficiarios REEMPLAZA la ficha (lo que no viaja queda en null),
 * así que completar un teléfono no puede mandar `{ telefono }` a secas: borraría
 * el documento, el tope y las notas. `cuerpoPatch` arma la ficha entera con el
 * cambio puesto.
 */

import { normalizarNumero } from "@/lib/documento/tipos";
import { CELULAR_PE } from "@/lib/adelantos/persona-campos";

export type PersonaDatos = {
  nombre: string;
  documento?: string | null;
  telefono?: string | null;
  notas?: string | null;
  limiteCredito?: number | null;
  tipoDocumento?: string | null;
  razonSocial?: string | null;
  direccion?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  email?: string | null;
  estadoSunat?: string | null;
  condicionSunat?: string | null;
  verificadoEn?: string | null;
  banco?: string | null;
  cuentaBancaria?: string | null;
  cci?: string | null;
  activo?: boolean;
  /** ADR-525: qué es para el negocio. El PATCH sólo lo toca si la clave viaja. */
  tipoRelacion?: string | null;
};

const vacio = (v: string | null | undefined) => !(v ?? "").trim();

export const faltaTelefono = (p: Pick<PersonaDatos, "telefono">) => vacio(p.telefono);
export const faltaDocumento = (p: Pick<PersonaDatos, "documento">) => vacio(p.documento);
/** Falta DNI/RUC o teléfono. */
export const faltanDatos = (p: Pick<PersonaDatos, "telefono" | "documento">) => faltaTelefono(p) || faltaDocumento(p);
export const faltaTipo = (p: Pick<PersonaDatos, "tipoRelacion">) => vacio(p.tipoRelacion);
/** Lo que pide «Completar datos» en lote (30-10): DNI/RUC, celular o tipo. */
export const faltaParaCompletar = (p: Pick<PersonaDatos, "telefono" | "documento" | "tipoRelacion">) => faltanDatos(p) || faltaTipo(p);

/** «Falta el teléfono», «Faltan el DNI/RUC y el teléfono»… para el chip de la fila. */
export function queFalta(p: Pick<PersonaDatos, "telefono" | "documento">): string[] {
  return [...(faltaDocumento(p) ? ["DNI/RUC"] : []), ...(faltaTelefono(p) ? ["teléfono"] : [])];
}

export type CambioDatos = {
  /** `null` quita el tope. Sin la clave, el tope queda como está. */
  limiteCredito?: number | null;
  telefono?: string;
  documento?: string;
  /** `null` quita el tipo. Sin la clave, el que tenía queda (la ruta no lo toca). */
  tipoRelacion?: string | null;
  /** Lo que trajo el padrón, para guardarlo con el documento. Sólo se completa lo vacío. */
  padron?: {
    tipo?: string;
    razonSocial?: string | null;
    direccion?: string | null;
    departamento?: string | null;
    provincia?: string | null;
    distrito?: string | null;
    estado?: string | null;
    condicion?: string | null;
    /** `true` = dato de demostración: no se guarda como verificado. */
    demo?: boolean;
  };
};

/** El cuerpo completo del PATCH: la ficha actual + el cambio. */
export function cuerpoPatch(p: PersonaDatos, c: CambioDatos): Record<string, unknown> {
  const o = (v: string | null | undefined) => (vacio(v) ? null : (v as string).trim());
  const pad = c.padron;
  const siVacio = (actual: string | null | undefined, nuevo: string | null | undefined) => (vacio(actual) ? o(nuevo) : o(actual));
  const telefono = c.telefono !== undefined ? c.telefono.trim() : (p.telefono ?? "").trim();
  const documento = c.documento !== undefined ? normalizarNumero(c.documento) : (p.documento ?? "").trim();
  return {
    nombre: p.nombre.trim(),
    documento: documento || undefined,
    telefono: telefono || undefined,
    notas: o(p.notas) ?? undefined,
    limiteCredito: (() => {
      const l = c.limiteCredito !== undefined ? c.limiteCredito : p.limiteCredito;
      return l != null && l > 0 ? l : null;
    })(),
    email: o(p.email),
    banco: o(p.banco),
    cuentaBancaria: o(p.cuentaBancaria),
    cci: o(p.cci),
    direccion: siVacio(p.direccion, pad?.direccion),
    departamento: siVacio(p.departamento, pad?.departamento),
    provincia: siVacio(p.provincia, pad?.provincia),
    distrito: siVacio(p.distrito, pad?.distrito),
    ...(pad && !pad.demo
      ? {
          tipoDocumento: pad.tipo ?? o(p.tipoDocumento),
          razonSocial: pad.razonSocial ?? o(p.razonSocial),
          estadoSunat: pad.estado ?? o(p.estadoSunat),
          condicionSunat: pad.condicion ?? o(p.condicionSunat),
          verificadoEn: new Date().toISOString(),
        }
      : {
          tipoDocumento: o(p.tipoDocumento),
          razonSocial: o(p.razonSocial),
          estadoSunat: o(p.estadoSunat),
          condicionSunat: o(p.condicionSunat),
          verificadoEn: p.verificadoEn ?? null,
        }),
    activo: p.activo,
    /* Sólo si cambió: sin la clave, la ruta deja el tipo, el Yape, la
       referencia, el nacimiento y la foto como estaban (ADR-525). */
    ...(c.tipoRelacion !== undefined ? { tipoRelacion: c.tipoRelacion?.trim() || null } : {}),
  };
}

/** Una fila de «Completar datos» en lote, tal como se escribe (todo texto). */
export type FilaCompletar = { documento: string; telefono: string; tipoRelacion: string };

export const filaCompletarDe = (p: Pick<PersonaDatos, "documento" | "telefono" | "tipoRelacion">): FilaCompletar => ({
  documento: p.documento ?? "",
  telefono: p.telefono ?? "",
  tipoRelacion: p.tipoRelacion ?? "",
});

/**
 * «987 654 321» y «987-654-321» se guardan como «987654321» si es un celular;
 * un fijo con código o un +51 quedan como se escribieron (el modal hace igual).
 */
export function celularParaGuardar(v: string): string {
  const limpio = v.replace(/[\s-]/g, "");
  return CELULAR_PE.test(limpio) ? limpio : v.trim();
}

/**
 * Lo que cambió en la fila, listo para `cuerpoPatch`; `null` = nada que guardar.
 * Se compara contra lo escrito sin espacios de los costados: un celular viejo
 * con espacios que nadie tocó no cuenta como cambio.
 */
export function cambioDeLaFila(p: Pick<PersonaDatos, "documento" | "telefono" | "tipoRelacion">, fila: FilaCompletar): CambioDatos | null {
  const c: CambioDatos = {};
  if (normalizarNumero(fila.documento) !== normalizarNumero(p.documento ?? "")) c.documento = fila.documento;
  if (fila.telefono.trim() !== (p.telefono ?? "").trim()) c.telefono = celularParaGuardar(fila.telefono);
  const tipo = fila.tipoRelacion.trim() || null;
  if (tipo !== ((p.tipoRelacion ?? "").trim() || null)) c.tipoRelacion = tipo;
  return Object.keys(c).length > 0 ? c : null;
}
