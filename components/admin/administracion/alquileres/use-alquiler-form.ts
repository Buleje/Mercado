"use client";

/**
 * useAlquilerForm — el borrador de la ventana de un alquiler: el local, las
 * partes, la plata y el plazo. Crear manda todo; editar manda SÓLO lo que
 * cambió (PATCH parcial: ausente = no se toca, `null` = se borra).
 */
import { useState } from "react";
import type { AlquilerDto, EstadoAlquiler, Moneda, NuestroPapel } from "@/lib/admin/fichas-tramites-alquileres";
import type { ValorFicha } from "../comun/ElegirFicha";
import { crearAlquiler, editarAlquiler, type DatosAlquiler } from "./alquileres-api";

export interface BorradorAlquiler {
  nombre: string;
  direccion: string;
  partidaSunarp: string;
  manzana: string;
  lote: string;
  areaM2: string;
  ubigeo: string;
  dueno: ValorFicha;
  inquilino: ValorFicha;
  nuestroPapel: NuestroPapel | "";
  rentaMensual: string;
  moneda: Moneda;
  incluyeImpuestos: boolean;
  diaPago: string;
  garantiaMonto: string;
  garantiaPagada: boolean;
  garantiaPagadaEl: string;
  inicioEl: string;
  finEl: string;
  renovacionAutomatica: boolean;
  avisoNoRenovarDias: string;
  reajuste: string;
  cuentaBanco: string;
  cuentaCci: string;
  cuentaTitular: string;
  estado: EstadoAlquiler;
  notas: string;
}

export type CambiarAlquiler = <K extends keyof BorradorAlquiler>(k: K, v: BorradorAlquiler[K]) => void;

const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function aBorrador(a: AlquilerDto | null, hoy: string): BorradorAlquiler {
  return {
    nombre: a?.nombre ?? "",
    direccion: a?.direccion ?? "",
    partidaSunarp: a?.partidaSunarp ?? "",
    manzana: a?.manzana ?? "",
    lote: a?.lote ?? "",
    areaM2: n(a?.areaM2),
    ubigeo: a?.ubigeo ?? "",
    dueno: { parteId: a?.duenoParteId ?? null, texto: a?.duenoTexto ?? "" },
    inquilino: { parteId: a?.inquilinoParteId ?? null, texto: a?.inquilinoTexto ?? "" },
    nuestroPapel: a?.nuestroPapel ?? "",
    rentaMensual: n(a?.rentaMensual),
    moneda: a?.moneda ?? "PEN",
    incluyeImpuestos: a?.incluyeImpuestos ?? false,
    diaPago: n(a?.diaPago),
    garantiaMonto: n(a?.garantiaMonto),
    garantiaPagada: a?.garantiaPagada ?? false,
    garantiaPagadaEl: a?.garantiaPagadaEl ?? "",
    inicioEl: a?.inicioEl ?? hoy,
    finEl: a?.finEl ?? "",
    renovacionAutomatica: a?.renovacionAutomatica ?? false,
    avisoNoRenovarDias: n(a?.avisoNoRenovarDias),
    reajuste: a?.reajuste ?? "",
    cuentaBanco: a?.cuentaBanco ?? "",
    cuentaCci: a?.cuentaCci ?? "",
    cuentaTitular: a?.cuentaTitular ?? "",
    estado: a?.estado ?? "vigente",
    notas: a?.notas ?? "",
  };
}

const t = (s: string): string | null => (s.trim() ? s.trim() : null);
/** Número escrito con coma o punto; vacío = null; basura = NaN (lo atrapa `validar`). */
const num = (s: string): number | null => (s.trim() ? Number(s.trim().replace(",", ".")) : null);

function aDatos(b: BorradorAlquiler, original: AlquilerDto | null): DatosAlquiler {
  return {
    nombre: b.nombre.trim(),
    direccion: t(b.direccion),
    partidaSunarp: t(b.partidaSunarp),
    manzana: t(b.manzana),
    lote: t(b.lote),
    areaM2: num(b.areaM2),
    ubigeo: t(b.ubigeo),
    duenoParteId: b.dueno.parteId,
    duenoTexto: b.dueno.parteId ? null : t(b.dueno.texto),
    inquilinoParteId: b.inquilino.parteId,
    inquilinoTexto: b.inquilino.parteId ? null : t(b.inquilino.texto),
    nuestroPapel: b.nuestroPapel || null,
    rentaMensual: num(b.rentaMensual) ?? 0,
    moneda: b.moneda,
    incluyeImpuestos: b.incluyeImpuestos,
    diaPago: num(b.diaPago),
    garantiaMonto: num(b.garantiaMonto),
    garantiaPagada: b.garantiaMonto.trim() ? b.garantiaPagada : null,
    garantiaPagadaEl: b.garantiaPagada ? b.garantiaPagadaEl || null : null,
    garantiaDevueltaEl: original?.garantiaDevueltaEl ?? null,
    inicioEl: b.inicioEl,
    finEl: b.finEl || null,
    renovacionAutomatica: b.renovacionAutomatica,
    avisoNoRenovarDias: num(b.avisoNoRenovarDias),
    reajuste: t(b.reajuste),
    cuentaBanco: t(b.cuentaBanco),
    cuentaCci: t(b.cuentaCci),
    cuentaTitular: t(b.cuentaTitular),
    estado: b.estado,
    notas: t(b.notas),
  };
}

function validar(d: DatosAlquiler): string | null {
  if (!d.nombre) return "Ponle un nombre al local (así sale en la lista y en la agenda).";
  if (!d.inicioEl) return "Pon la fecha en que empieza el contrato.";
  if (!Number.isFinite(d.rentaMensual) || d.rentaMensual <= 0) return "La renta tiene que ser un monto mayor que cero.";
  if (d.diaPago !== null && (!Number.isInteger(d.diaPago) || d.diaPago < 1 || d.diaPago > 31)) return "El día de pago va del 1 al 31.";
  if (d.finEl && d.finEl < d.inicioEl) return "El fin del contrato no puede ser antes del inicio.";
  for (const [valor, nombre] of [[d.areaM2, "El área"], [d.garantiaMonto, "La garantía"], [d.avisoNoRenovarDias, "Los días de aviso"]] as const) {
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) return `${nombre} tiene que ser un número.`;
  }
  return null;
}

export function useAlquilerForm(
  alquiler: AlquilerDto | null,
  hoy: string,
  onGuardado: (a: AlquilerDto, eraNuevo: boolean) => void,
  onCerrar: () => void,
) {
  const [b, setB] = useState<BorradorAlquiler>(() => aBorrador(alquiler, hoy));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiar: CambiarAlquiler = (k, v) => {
    setError(null);
    setB((x) => ({ ...x, [k]: v }));
  };

  const guardar = async () => {
    const datos = aDatos(b, alquiler);
    const malo = validar(datos);
    if (malo) return setError(malo);
    setGuardando(true);
    if (!alquiler) {
      const r = await crearAlquiler(datos);
      setGuardando(false);
      if (!r.ok) return setError(r.error);
      return onGuardado(r.data.alquiler, true);
    }
    const antes = aDatos(aBorrador(alquiler, hoy), alquiler);
    const cambios: Partial<DatosAlquiler> = {};
    for (const k of Object.keys(datos) as (keyof DatosAlquiler)[]) {
      if (antes[k] !== datos[k]) (cambios as Record<string, unknown>)[k] = datos[k];
    }
    if (Object.keys(cambios).length === 0) {
      setGuardando(false);
      return onCerrar();
    }
    const r = await editarAlquiler(alquiler.id, cambios);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    onGuardado(r.data.alquiler, false);
    onCerrar();
  };

  return { b, cambiar, guardar, error, guardando };
}
