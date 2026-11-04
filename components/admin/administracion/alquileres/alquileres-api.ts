/**
 * alquileres-api — las llamadas de Alquileres (ADR-524 §3.1). Nunca lanzan.
 * Un pago repetido idéntico vuelve 200 con `duplicado: true` (no es error);
 * otro pago del mismo mes vuelve 409 `periodo_ya_pagado`, ya traducido.
 */
import type {
  AlquilerDto,
  AlquilerPagoDto,
  AlquilerPagoInput,
  Dia,
  EstadoAlquiler,
  Moneda,
  NuestroPapel,
} from "@/lib/admin/fichas-tramites-alquileres";
import { pedirAdm, query } from "../comun/pedir-administracion";

const BASE = "/api/admin/alquileres";

/** Lo que se escribe en la ventana: el DTO sin pagos, resumen ni nombres de ficha. */
export interface DatosAlquiler {
  nombre: string;
  direccion: string | null;
  partidaSunarp: string | null;
  manzana: string | null;
  lote: string | null;
  areaM2: number | null;
  ubigeo: string | null;
  duenoParteId: string | null;
  duenoTexto: string | null;
  inquilinoParteId: string | null;
  inquilinoTexto: string | null;
  nuestroPapel: NuestroPapel | null;
  rentaMensual: number;
  moneda: Moneda;
  incluyeImpuestos: boolean | null;
  diaPago: number | null;
  garantiaMonto: number | null;
  garantiaPagada: boolean | null;
  garantiaPagadaEl: Dia | null;
  garantiaDevueltaEl: Dia | null;
  inicioEl: Dia;
  finEl: Dia | null;
  renovacionAutomatica: boolean;
  avisoNoRenovarDias: number | null;
  reajuste: string | null;
  cuentaBanco: string | null;
  cuentaCci: string | null;
  cuentaTitular: string | null;
  estado: EstadoAlquiler;
  notas: string | null;
}

export interface RespuestaPago {
  pago: AlquilerPagoDto;
  alquiler: AlquilerDto;
  duplicado?: boolean;
  /** El monto no es la renta: «pagado en parte, falta S/ X» o el exceso (lo arma el servidor). */
  aviso?: string;
}

const de = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

export const leerAlquileres = (f: { estado?: EstadoAlquiler; duenoParteId?: string } = {}) =>
  pedirAdm<{ alquileres: AlquilerDto[] }>(`${BASE}${query({ ...f })}`);

export const leerAlquiler = (id: string) => pedirAdm<{ alquiler: AlquilerDto }>(de(id));

export const crearAlquiler = (datos: DatosAlquiler) => pedirAdm<{ alquiler: AlquilerDto }>(BASE, "POST", datos);

/** Parcial: lo que no viaja no se toca; `null` borra. */
export const editarAlquiler = (id: string, cambios: Partial<DatosAlquiler & { contratoDocumentId: string | null }>) => pedirAdm<{ alquiler: AlquilerDto }>(de(id), "PATCH", cambios);

export const borrarAlquiler = (id: string) => pedirAdm<{ ok: true }>(de(id), "DELETE");

export const registrarPago = (id: string, pago: AlquilerPagoInput) => pedirAdm<RespuestaPago>(`${de(id)}/pagos`, "POST", pago);

export const borrarPago = (id: string, pagoId: string) =>
  pedirAdm<{ pago: AlquilerPagoDto; alquiler: AlquilerDto }>(`${de(id)}/pagos/${encodeURIComponent(pagoId)}`, "DELETE");

/** Corrección parcial de un pago (p. ej. colgarle el comprobante a mano). */
export const corregirPago = (id: string, pagoId: string, cambios: Partial<AlquilerPagoInput>) =>
  pedirAdm<{ pago: AlquilerPagoDto; alquiler: AlquilerDto }>(`${de(id)}/pagos/${encodeURIComponent(pagoId)}`, "PATCH", cambios);

/** La carpeta del Archivo de un local: «Alquileres/Local Constitución». */
export const carpetaDelAlquiler = (a: Pick<AlquilerDto, "nombre">) => `Alquileres/${a.nombre.replace(/[/\\]/g, "-").slice(0, 60)}`;
