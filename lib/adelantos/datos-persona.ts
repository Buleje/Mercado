/**
 * Qué datos le faltan a una persona y cómo se guarda uno solo sin borrar el resto.
 *
 * El PATCH de beneficiarios REEMPLAZA la ficha (lo que no viaja queda en null),
 * así que completar un teléfono no puede mandar `{ telefono }` a secas: borraría
 * el documento, el tope y las notas. `cuerpoPatch` arma la ficha entera con el
 * cambio puesto.
 */

import { normalizarNumero } from "@/lib/documento/tipos";

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
};

const vacio = (v: string | null | undefined) => !(v ?? "").trim();

export const faltaTelefono = (p: Pick<PersonaDatos, "telefono">) => vacio(p.telefono);
export const faltaDocumento = (p: Pick<PersonaDatos, "documento">) => vacio(p.documento);
/** Falta DNI/RUC o teléfono. */
export const faltanDatos = (p: Pick<PersonaDatos, "telefono" | "documento">) => faltaTelefono(p) || faltaDocumento(p);

/** «Falta el teléfono», «Faltan el DNI/RUC y el teléfono»… para el chip de la fila. */
export function queFalta(p: Pick<PersonaDatos, "telefono" | "documento">): string[] {
  return [...(faltaDocumento(p) ? ["DNI/RUC"] : []), ...(faltaTelefono(p) ? ["teléfono"] : [])];
}

export type CambioDatos = {
  /** `null` quita el tope. Sin la clave, el tope queda como está. */
  limiteCredito?: number | null;
  telefono?: string;
  documento?: string;
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
  };
}
