/**
 * El cliente de una guía de salida, buscado en el Directorio (ADR-322 → 430).
 *
 * La guía trae al destinatario como TEXTO (nombre y documento, casilleros de
 * la GTF). La cuenta corriente y el trato de precio necesitan a QUIÉN: la ficha
 * del Directorio. Se busca por documento —un RUC no se escribe de dos formas—
 * y, si no aparece, por el nombre normalizado («Maderera del Sur» y
 * «MADERERA DEL SUR» son la misma).
 *
 * Una sola función para las dos pantallas que lo necesitan: la venta de la
 * guía ya registrada (`CtpVentaDeLaGuia`) y la venta propuesta al armar la
 * lista (`useTratoDeVenta`). Si cada una buscara a su manera, una podría
 * encontrar al cliente y la otra no.
 *
 * PURO y client-safe.
 */
import { claveEspecie } from "./loth-constants";

export interface DestinatarioDeGuia {
  nombre?: string | null;
  docNumero?: string | null;
}

interface ParteBuscable {
  id: string;
  nombre: string;
  docNumero?: string | null;
}

export function parteDelDestinatario<P extends ParteBuscable>(
  partes: readonly P[],
  d: DestinatarioDeGuia | null | undefined,
): P | null {
  const nombre = (d?.nombre ?? "").trim();
  if (!nombre) return null;
  const doc = (d?.docNumero ?? "").trim();
  const porDoc = doc ? partes.find((p) => (p.docNumero ?? "").trim() === doc) : undefined;
  if (porDoc) return porDoc;
  const clave = claveEspecie(nombre);
  return partes.find((p) => claveEspecie(p.nombre) === clave) ?? null;
}
