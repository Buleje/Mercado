/**
 * contrato-filtro — el parámetro `?contratoId=` de «Solo este permiso».
 *
 * Una sola regla para las rutas que acotan el libro al contrato activo
 * (ADR-421): qué forma tiene un id válido y cómo se lee de la URL. El cliente
 * sólo pasa el parámetro; el filtro lo hace el servidor, con `tenantId`
 * adelante, así que un id de otro negocio no trae nada.
 *
 * Un valor MALFORMADO es un 400 y no «sin filtro»: quien prendió el interruptor
 * cree estar viendo un solo permiso, y devolverle todo en silencio es mostrarle
 * plata y madera ajenas como si fueran de ese papel.
 */

import { z } from "zod";

/** Ids de Prisma (`cuid()`): letras, números, guión y guión bajo. */
export const contratoIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "contratoId inválido");

export type ContratoIdDeUrl =
  | { ok: true; contratoId: string | undefined }
  | { ok: false; error: "invalid_contratoId" };

/** Ausente o vacío = sin filtro. Presente y malformado = error. */
export function leerContratoId(params: URLSearchParams): ContratoIdDeUrl {
  const crudo = params.get("contratoId");
  if (crudo == null || crudo.trim() === "") return { ok: true, contratoId: undefined };
  const r = contratoIdSchema.safeParse(crudo);
  return r.success ? { ok: true, contratoId: r.data } : { ok: false, error: "invalid_contratoId" };
}

/** Del lado del cliente: agrega el parámetro sólo si hay contrato. Muta y devuelve `params`. */
export function conContratoId(params: URLSearchParams, contratoId: string | null | undefined): URLSearchParams {
  if (contratoId) params.set("contratoId", contratoId);
  return params;
}
