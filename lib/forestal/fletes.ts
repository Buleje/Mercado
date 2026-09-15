/**
 * fletes — el viaje que trae la madera (ADR-318).
 *
 * ## Por qué existe
 *
 * En un aserradero de selva el transporte es el segundo costo después de la
 * madera. Hasta acá no se anotaba en ningún lado: quedaba en un cuaderno o en la
 * cabeza del dueño. Sin eso, dos preguntas del día a día no tienen respuesta:
 *
 *   · *"¿cuánto me sale el m³ puesto en planta?"*
 *   · *"¿a qué transportista le debo y cuánto?"*
 *
 * ## La regla de oro que hereda del módulo
 *
 * **Sin monto → `null`, nunca `0`.** Un flete sin precio todavía no es un flete
 * gratis: es un flete que no se sabe. Un 0 haría bajar el promedio de S//m³ y
 * mentiría en la dirección más peligrosa (parecer más barato de lo que se es).
 * Los promedios se calculan SOLO sobre lo que tiene monto, y se informa cuántos
 * viajes quedaron afuera.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { z } from "zod";
import { leerGtfDatos } from "./ctp-gtf-datos";

// ── Vocabulario ─────────────────────────────────────────────────────────────

export const TIPOS_FLETE = ["ingreso", "despacho"] as const;
export type TipoFlete = (typeof TIPOS_FLETE)[number];

export const TIPO_FLETE_LABEL: Record<TipoFlete, string> = {
  ingreso: "Trajo materia prima",
  despacho: "Se llevó producto",
};

/** Quién se hace cargo del viaje. Define si sale de la caja o se descuenta. */
export const PAGADORES = ["ctp", "proveedor", "destinatario"] as const;
export type Pagador = (typeof PAGADORES)[number];

export const PAGADOR_LABEL: Record<Pagador, string> = {
  ctp: "Lo paga el CTP",
  proveedor: "A cargo del proveedor",
  destinatario: "A cargo del destinatario",
};

export const PAGADOR_HINT: Record<Pagador, string> = {
  ctp: "Sale de la caja: es costo del CTP",
  proveedor: "Se le descuenta al liquidarle su madera",
  destinatario: "Lo asume quien recibe el producto",
};

export const ESTADOS_PAGO = ["pendiente", "pagado"] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];

/**
 * Quién puso el vehículo. Mismo vocabulario que el casillero "tipo de
 * transporte" de la GTF de salida (`ctp-gtf-datos.ts`, `vehiculo.tipoTransporte`)
 * — un solo par de palabras para la misma pregunta en toda la app.
 * `privado` = vehículo propio del titular: no genera deuda con un tercero.
 * `publico` = transportista de tercero: es el que se le paga un flete.
 */
export const TIPOS_TRANSPORTE = ["privado", "publico"] as const;
export type TipoTransporte = (typeof TIPOS_TRANSPORTE)[number];

export const TIPO_TRANSPORTE_LABEL: Record<TipoTransporte, string> = {
  privado: "Propio",
  publico: "Flete (tercero)",
};

// ── Forma que viaja al cliente ──────────────────────────────────────────────

export interface Flete {
  id: string;
  /** ISO. Fecha del viaje. */
  fecha: string;
  tipo: TipoFlete;
  gtfNumber: string | null;
  vehiculoId: string | null;
  placa: string | null;
  transportistaId: string | null;
  transportistaNombre: string | null;
  conductorId: string | null;
  /** Snapshot del nombre: del directorio o, si se anotó desde la guía, de la GTF. */
  conductorNombre: string | null;
  tipoTransporte: TipoTransporte;
  proveedorId: string | null;
  proveedorNombre: string | null;
  volumenM3: number | null;
  monto: number | null;
  moneda: string;
  pagaQuien: Pagador;
  estadoPago: EstadoPago;
  fechaPago: string | null;
  notas: string | null;
}

// ── Esquemas ────────────────────────────────────────────────────────────────

const texto = (max: number) => z.string().trim().max(max);

export const fleteInputSchema = z.object({
  /** `YYYY-MM-DD` — fecha del viaje. */
  fecha: texto(10).min(10, "La fecha del viaje es obligatoria"),
  tipo: z.enum(TIPOS_FLETE).default("ingreso"),
  gtfNumber: texto(40).optional(),
  vehiculoId: texto(40).optional().nullable(),
  placa: texto(15).optional(),
  transportistaId: texto(40).optional().nullable(),
  transportistaNombre: texto(200).optional(),
  conductorId: texto(40).optional().nullable(),
  conductorNombre: texto(200).optional(),
  tipoTransporte: z.enum(TIPOS_TRANSPORTE).default("privado"),
  proveedorId: texto(40).optional().nullable(),
  proveedorNombre: texto(200).optional(),
  volumenM3: z.number().nonnegative().max(9999).optional().nullable(),
  monto: z.number().nonnegative().max(9_999_999).optional().nullable(),
  moneda: texto(4).optional(),
  pagaQuien: z.enum(PAGADORES).default("ctp"),
  estadoPago: z.enum(ESTADOS_PAGO).default("pendiente"),
  fechaPago: texto(10).optional().nullable(),
  notas: texto(500).optional(),
});
export type FleteInput = z.infer<typeof fleteInputSchema>;

// ── Cálculos ────────────────────────────────────────────────────────────────

/**
 * S/ por m³ del viaje. `null` cuando falta el monto o el volumen — es el número
 * que se compara entre transportistas, así que inventarlo sería peor que no
 * mostrarlo.
 */
export function costoPorM3(f: Pick<Flete, "monto" | "volumenM3">): number | null {
  if (f.monto == null || f.volumenM3 == null || f.volumenM3 <= 0) return null;
  return Math.round((f.monto / f.volumenM3) * 100) / 100;
}

export interface ResumenFletes {
  viajes: number;
  /** Cuántos de esos viajes los paga el CTP (los que pesan en su caja). */
  viajesCtp: number;
  /** Viajes sin monto cargado: quedan fuera de todos los promedios. */
  sinMonto: number;
  /** S/ de los viajes que paga el CTP (los que salen de la caja). */
  gastoCtp: number;
  /** S/ que se le descuenta al proveedor. */
  aCargoProveedor: number;
  /** S/ que asume el destinatario. */
  aCargoDestinatario: number;
  /** S/ todavía impagos, sin importar quién los paga. */
  pendiente: number;
  /** m³ movidos por los viajes con volumen cargado. */
  volumen: number;
  /** S//m³ promedio ponderado — sólo sobre viajes con monto Y volumen. */
  costoPorM3: number | null;
}

/**
 * El resumen del período. Ponderado y no promedio de promedios: un viaje de
 * 30 m³ pesa lo que pesa, no lo mismo que uno de 3.
 */
export function resumirFletes(lista: Flete[]): ResumenFletes {
  let gastoCtp = 0;
  let aCargoProveedor = 0;
  let aCargoDestinatario = 0;
  let pendiente = 0;
  let volumen = 0;
  let sinMonto = 0;
  let viajesCtp = 0;
  let montoConVolumen = 0;
  let volumenConMonto = 0;

  for (const f of lista) {
    if (f.volumenM3 != null) volumen += f.volumenM3;
    // Se cuenta aunque no tenga monto: el viaje lo paga el CTP igual, lo que
    // falta es el precio.
    if (f.pagaQuien === "ctp") viajesCtp += 1;
    if (f.monto == null) {
      sinMonto += 1;
      continue;
    }
    if (f.pagaQuien === "ctp") gastoCtp += f.monto;
    else if (f.pagaQuien === "proveedor") aCargoProveedor += f.monto;
    else aCargoDestinatario += f.monto;
    if (f.estadoPago === "pendiente") pendiente += f.monto;
    if (f.volumenM3 != null && f.volumenM3 > 0) {
      montoConVolumen += f.monto;
      volumenConMonto += f.volumenM3;
    }
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    viajes: lista.length,
    viajesCtp,
    sinMonto,
    gastoCtp: r2(gastoCtp),
    aCargoProveedor: r2(aCargoProveedor),
    aCargoDestinatario: r2(aCargoDestinatario),
    pendiente: r2(pendiente),
    volumen: Math.round(volumen * 10000) / 10000,
    costoPorM3: volumenConMonto > 0 ? r2(montoConVolumen / volumenConMonto) : null,
  };
}

export interface CuentaFletes {
  clave: string;
  nombre: string;
  viajes: number;
  /** S/ con monto cargado. */
  total: number;
  /** S/ de los viajes que siguen impagos. */
  pendiente: number;
  sinMonto: number;
}

/**
 * Cuánto se le debe a cada transportista. Es la vista que se mira antes de
 * pagar: viajes, total y qué parte sigue impaga.
 *
 * Se agrupa por id cuando existe y por nombre cuando no: un transportista que se
 * tipeó a mano antes de estar en la libreta sigue teniendo su fila.
 */
export function porTransportista(lista: Flete[]): CuentaFletes[] {
  return agrupar(
    lista,
    (f) => f.transportistaId ?? f.transportistaNombre ?? "",
    (f) => f.transportistaNombre ?? "Sin transportista",
  );
}

/** Cuánto se le descuenta a cada proveedor (los fletes a su cargo). */
export function porProveedor(lista: Flete[]): CuentaFletes[] {
  return agrupar(
    lista.filter((f) => f.pagaQuien === "proveedor"),
    (f) => f.proveedorId ?? f.proveedorNombre ?? "",
    (f) => f.proveedorNombre ?? "Sin proveedor",
  );
}

function agrupar(lista: Flete[], clave: (f: Flete) => string, nombre: (f: Flete) => string): CuentaFletes[] {
  const mapa = new Map<string, CuentaFletes>();
  for (const f of lista) {
    const k = clave(f) || "—";
    const actual = mapa.get(k) ?? { clave: k, nombre: nombre(f), viajes: 0, total: 0, pendiente: 0, sinMonto: 0 };
    actual.viajes += 1;
    if (f.monto == null) actual.sinMonto += 1;
    else {
      actual.total += f.monto;
      if (f.estadoPago === "pendiente") actual.pendiente += f.monto;
    }
    mapa.set(k, actual);
  }
  return [...mapa.values()]
    .map((c) => ({ ...c, total: Math.round(c.total * 100) / 100, pendiente: Math.round(c.pendiente * 100) / 100 }))
    .sort((a, b) => b.pendiente - a.pendiente || b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
}

// ── Desde la guía: la fila del ingreso ya trae el viaje ────────────────────

/** Lo mínimo de un `WoodEntry` que hace falta para proponer el viaje. */
export interface IngresoParaFlete {
  gtfNumber: string | null;
  entryDate: string | Date;
  providerName: string | null;
  volumeM3: string | number | null;
  /** JSON crudo — se lee con `leerGtfDatos`, nunca se confía a ciegas. */
  gtfDatos: unknown;
}

/** Un viaje propuesto desde la guía: todavía no es un `Flete`, falta el monto. */
export interface CandidatoFlete {
  gtfNumber: string;
  fecha: string;
  proveedorNombre: string | null;
  volumenM3: number | null;
  placa: string | null;
  transportistaNombre: string | null;
  conductorNombre: string | null;
  tipoTransporte: TipoTransporte;
}

/**
 * El viaje que ya está escrito en la guía, listo para proponer.
 *
 * Brandon (2026-08-20): "cada guía que ingresa ya tiene volumen y
 * transportista, conductor — quiero que se clasifique [por fletero], sin
 * volver a tipearlo." La guía de ingreso guarda ese bloque en `gtfDatos`
 * (mismo esquema que la GTF de salida, ADR-336): acá se traduce a un borrador
 * de flete. `null` si la guía no tiene ni transportista ni placa cargados —
 * proponer un viaje vacío no ahorra nada.
 */
export function candidatoDesdeIngreso(e: IngresoParaFlete): CandidatoFlete | null {
  if (!e.gtfNumber) return null;
  const d = leerGtfDatos(e.gtfDatos);
  const transportista = d.transportista.nombre.trim() || null;
  const placa = d.vehiculo.placa.trim() || null;
  if (!transportista && !placa) return null;
  const fecha = typeof e.entryDate === "string" ? e.entryDate : e.entryDate.toISOString();
  return {
    gtfNumber: e.gtfNumber,
    fecha: fecha.slice(0, 10),
    proveedorNombre: (e.providerName ?? "").trim() || null,
    volumenM3: e.volumeM3 == null ? null : Number(e.volumeM3),
    placa,
    transportistaNombre: transportista,
    conductorNombre: d.vehiculo.conductor.trim() || null,
    tipoTransporte: d.vehiculo.tipoTransporte,
  };
}

/**
 * Qué le falta al viaje para servir de algo. No bloquea guardar: un flete se
 * anota cuando el camión llega y el precio se cierra después.
 */
export function faltantesFlete(f: Flete): string[] {
  const faltan: string[] = [];
  if (!f.placa && !f.vehiculoId) faltan.push("placa");
  if (f.monto == null) faltan.push("monto");
  if (f.volumenM3 == null) faltan.push("volumen (sin él no hay S//m³)");
  if (!f.gtfNumber) faltan.push("guía (sin ella no se ata al libro)");
  return faltan;
}
