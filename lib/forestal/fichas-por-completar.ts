/**
 * Qué le falta a cada ficha del Directorio forestal, priorizado por su papel.
 *
 * Medido en Blas (30-10): 12 fichas activas → 4 sin documento, 9 sin ubigeo,
 * 12 sin cuenta, y los 3 transportistas sin registro MTC (la GRE de SUNAT lo
 * pide). Cada papel pide lo suyo: el transportista, MTC y placa; el
 * proveedor, RUC, ubigeo y cuenta; el destinatario, dirección y ubigeo.
 *
 * Es una lista de pendientes, no un candado: no bloquea ninguna guía.
 */

import type { Parte, RolParte, Vehiculo } from "./directorio";
import type { PasoFicha } from "./directorio-pasos";

export type ClaveFaltaParte = "documento" | "registroMtc" | "placa" | "licencia" | "ubigeo" | "cuenta" | "direccion";

export interface FaltaParte {
  clave: ClaveFaltaParte;
  label: string;
  resumen: string;
  /** El paso de la ficha donde se carga. */
  paso: PasoFicha;
}

const FALTA: Record<ClaveFaltaParte, FaltaParte> = {
  documento: { clave: "documento", label: "RUC o DNI", resumen: "sin RUC o DNI", paso: "quien" },
  registroMtc: { clave: "registroMtc", label: "Registro MTC", resumen: "sin registro MTC", paso: "papel" },
  placa: { clave: "placa", label: "Placa del camión", resumen: "sin camión cargado", paso: "papel" },
  licencia: { clave: "licencia", label: "Licencia", resumen: "sin licencia", paso: "papel" },
  ubigeo: { clave: "ubigeo", label: "Ubigeo", resumen: "sin ubigeo", paso: "donde" },
  cuenta: { clave: "cuenta", label: "Cuenta para pagarle", resumen: "sin cuenta", paso: "pago" },
  direccion: { clave: "direccion", label: "Dirección", resumen: "sin dirección", paso: "donde" },
};

const lleno = (v: string | null | undefined): boolean => typeof v === "string" && v.trim().length > 0;

/** El orden de los papeles es el de importancia: lo que frena una guía primero. */
const PRIORIDAD: readonly RolParte[] = ["transportista", "conductor", "proveedor", "destinatario"];

export function faltasDeParte(p: Parte, vehiculos: readonly Vehiculo[] = []): FaltaParte[] {
  const claves: ClaveFaltaParte[] = [];
  const tiene = (r: RolParte) => p.roles.includes(r);
  if (tiene("transportista")) {
    if (!lleno(p.registroMtc)) claves.push("registroMtc");
    if (!vehiculos.some((v) => v.activo && v.transportistaId === p.id)) claves.push("placa");
  }
  if (tiene("conductor") && !lleno(p.licencia)) claves.push("licencia");
  if (!lleno(p.docNumero)) claves.push("documento");
  if (tiene("proveedor") || tiene("destinatario")) {
    if (tiene("destinatario") && !lleno(p.direccion)) claves.push("direccion");
    if (!lleno(p.ubigeo)) claves.push("ubigeo");
  }
  if (tiene("proveedor") && !lleno(p.banco) && !lleno(p.cuentaCci) && !lleno(p.cuentaNumero)) claves.push("cuenta");
  return claves.map((c) => FALTA[c]);
}

export interface ParteConFaltas {
  id: string;
  nombre: string;
  /** El papel que más pesa en la ficha, para decir «transportista» al lado del nombre. */
  papel: RolParte | null;
  faltan: FaltaParte[];
}

/** Fichas activas con algo pendiente; primero los papeles que frenan una guía, luego las que más les falta. */
export function partesPorCompletar(partes: readonly Parte[], vehiculos: readonly Vehiculo[] = []): ParteConFaltas[] {
  const rango = (p: Parte) => {
    const i = PRIORIDAD.findIndex((r) => p.roles.includes(r));
    return i === -1 ? PRIORIDAD.length : i;
  };
  return partes
    .filter((p) => p.activo)
    .map((p) => ({ p, faltan: faltasDeParte(p, vehiculos) }))
    .filter((x) => x.faltan.length > 0)
    .sort((a, b) => rango(a.p) - rango(b.p) || b.faltan.length - a.faltan.length || a.p.nombre.localeCompare(b.p.nombre, "es"))
    .map(({ p, faltan }) => ({ id: p.id, nombre: p.nombre, papel: PRIORIDAD.find((r) => p.roles.includes(r)) ?? p.roles[0] ?? null, faltan }));
}

export function resumenDeFaltasParte(lista: readonly ParteConFaltas[]): { clave: ClaveFaltaParte; n: number; texto: string }[] {
  return (Object.keys(FALTA) as ClaveFaltaParte[])
    .map((clave) => {
      const n = lista.filter((x) => x.faltan.some((f) => f.clave === clave)).length;
      return { clave, n, texto: `${n} ${FALTA[clave].resumen}` };
    })
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
}
