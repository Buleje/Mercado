/**
 * papeles-alquiler — colgar el contrato de un local o el comprobante de un
 * pago (ADR-524 §3.1). La subida con `vinculoTipo` ya lo deja en su lugar; si
 * el servidor no lo vinculó (o se reemplaza un contrato que ya había), se
 * cuelga con un PATCH. Siempre devuelve el alquiler fresco, con su `resumen`.
 */
import type { AlquilerDto } from "@/lib/admin/fichas-tramites-alquileres";
import { subirDocumento } from "../comun/subir-documento";
import { carpetaDelAlquiler, corregirPago, editarAlquiler, leerAlquiler } from "./alquileres-api";

export type ResultadoPapel = { ok: true; alquiler: AlquilerDto } | { ok: false; error: string };

async function fresco(id: string): Promise<ResultadoPapel> {
  const r = await leerAlquiler(id);
  return r.ok ? { ok: true, alquiler: r.data.alquiler } : { ok: false, error: r.error };
}

export async function colgarContrato(a: AlquilerDto, archivo: File): Promise<ResultadoPapel> {
  const s = await subirDocumento(archivo, { carpetaRuta: carpetaDelAlquiler(a), vinculoTipo: "alquiler", vinculoId: a.id });
  if (!s.ok) return s;
  // El servidor sólo pone el contrato si el local no tenía uno: al cambiarlo, a mano.
  if (s.vinculado && !a.contratoDocumentId) return fresco(a.id);
  const r = await editarAlquiler(a.id, { contratoDocumentId: s.id });
  if (!r.ok) return { ok: false, error: `El archivo se subió al Archivo, pero no quedó como contrato: ${r.error}` };
  return { ok: true, alquiler: r.data.alquiler };
}

export async function colgarComprobante(a: AlquilerDto, pagoId: string, archivo: File): Promise<ResultadoPapel> {
  const s = await subirDocumento(archivo, { carpetaRuta: carpetaDelAlquiler(a), vinculoTipo: "pago_alquiler", vinculoId: pagoId });
  if (!s.ok) return s;
  if (s.vinculado) return fresco(a.id);
  const r = await corregirPago(a.id, pagoId, { comprobanteDocumentId: s.id });
  if (!r.ok) return { ok: false, error: `El archivo se subió al Archivo, pero no quedó en el pago: ${r.error}` };
  return { ok: true, alquiler: r.data.alquiler };
}
