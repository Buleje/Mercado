/**
 * Los datos con que se guarda una cubicación de madera (modal «Guardar
 * cubicación», Brandon 24-10): nombre, fecha, a quién se vende, de qué CCNN
 * salió, con qué permiso, guía, camión y notas.
 *
 * `cliente` sigue siendo el nombre del comprador (lo leen la liquidación, la
 * cuenta y el historial); su ficha del Directorio va en `ficha.clienteParteId`.
 */
import {
  hoyISO, normalizarFicha, type CubicacionRegistro, type FichaCubicacion,
} from "@/lib/forestal/cubicacion-registro";
import type { SalidaCubicacion } from "@/lib/forestal/cubicacion-salidas";

export interface DatosDeLaCubicacion {
  nombre: string;
  /** Fecha del trabajo (YYYY-MM-DD). */
  fecha: string;
  /** A quién se le vende (nombre; su ficha va en `ficha.clienteParteId`). */
  cliente: string;
  notas: string;
  /** N° de la GTF con que salió o llegó la madera. */
  gtf: string;
  ficha: FichaCubicacion;
  /**
   * Los viajes que ya se anotaron (28-10): sólo para mostrarlos al actualizar.
   * El POST NUNCA los manda (`cuerpoDeDatos` no los lleva; el servidor los
   * conserva): se anotan con el PATCH `{ salida }` después de guardar.
   */
  salidas?: SalidaCubicacion[];
}

export const datosVacios = (): DatosDeLaCubicacion => ({
  nombre: "", fecha: hoyISO(), cliente: "", notas: "", gtf: "", ficha: {},
});

/** Los de una guardada, para seguir editándola. */
export const datosDeGuardada = (c: CubicacionRegistro): DatosDeLaCubicacion => ({
  nombre: c.nombre,
  fecha: c.fecha,
  cliente: c.cliente ?? "",
  notas: c.notas ?? "",
  gtf: c.gtfNumber ?? "",
  ficha: c.ficha ?? {},
  salidas: c.salidas,
});

/**
 * Lo que viaja al servidor. Todo va completo (vacío = `null`, que borra):
 * el modal muestra la ficha entera, así que lo que no está es porque se borró.
 */
export const cuerpoDeDatos = (d: DatosDeLaCubicacion) => ({
  fecha: d.fecha,
  cliente: d.cliente.trim() || null,
  notas: d.notas.trim() || null,
  gtfNumber: d.gtf.trim() || null,
  ficha: normalizarFicha(d.ficha) ?? null,
});
