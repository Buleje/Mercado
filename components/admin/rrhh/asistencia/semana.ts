/**
 * semana.ts — cómo se nombra una semana de la hoja de asistencia (ADR-416).
 *
 * Semana de lunes a domingo, como el resto de RRHH (ADR-414). Meses escritos a
 * mano (`NOMBRES_MES`), no `Intl`.
 */

import { tardanzaDe } from "@/lib/rrhh/asistencia";
import { NOMBRES_MES, dateDeFechaKey, sumarDias } from "@/lib/rrhh/fechas";
import type { AsistenciaDTO, ColaboradorMinDTO, FechaKey, PuestoDTO } from "@/lib/rrhh/tipos";

const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

/** «Lun», «Mar»… — lunes primero. */
export function nombreCortoDelDia(fecha: FechaKey): string {
  return DIAS_CORTOS[(dateDeFechaKey(fecha).getUTCDay() + 6) % 7];
}

/** «Lun 14». */
export function encabezadoDia(fecha: FechaKey): string {
  return `${nombreCortoDelDia(fecha)} ${fecha.slice(8, 10)}`;
}

/** «14 al 20 de setiembre de 2026»; si la semana cruza de mes o de año, lo dice. */
export function etiquetaSemana(lunes: FechaKey): string {
  const domingo = sumarDias(lunes, 6);
  const mes = (key: FechaKey) => NOMBRES_MES[Number(key.slice(5, 7)) - 1];
  const dia = (key: FechaKey) => Number(key.slice(8, 10));
  const anio = (key: FechaKey) => key.slice(0, 4);
  if (anio(lunes) !== anio(domingo)) {
    return `${dia(lunes)} de ${mes(lunes)} de ${anio(lunes)} al ${dia(domingo)} de ${mes(domingo)} de ${anio(domingo)}`;
  }
  if (lunes.slice(5, 7) !== domingo.slice(5, 7)) {
    return `${dia(lunes)} de ${mes(lunes)} al ${dia(domingo)} de ${mes(domingo)} de ${anio(domingo)}`;
  }
  return `${dia(lunes)} al ${dia(domingo)} de ${mes(domingo)} de ${anio(domingo)}`;
}

/** 5.5 → «5.5»; 5 → «5». */
export function formatearDias(n: number): string {
  return n.toLocaleString("es-PE", { maximumFractionDigits: 1 });
}

// ── Tardanzas que todavía nadie marcó (ADR-417) ──────────────────────────────
//
// Vive acá porque la hoja semanal fue la primera en pedirlo, pero lo usan
// también la del mes y el calendario del celular: una sola cuenta para las
// tres, así no pueden decir cosas distintas del mismo día.

export interface HorarioDelPuesto {
  horaEntrada: string;
  toleranciaMin: number;
}

/**
 * El horario de cada persona, resuelto por su puesto: la hoja sólo trae
 * `{ id, nombre }` del puesto, así que sin el catálogo (`useRrhhPuestos`) no hay
 * contra qué comparar la hora marcada. Quien no tiene puesto —o tiene uno sin
 * hora de entrada— no entra al mapa: nadie le fijó horario, nadie puede juzgarle
 * la llegada.
 */
export function horariosPorColaborador(puestos: readonly PuestoDTO[], colaboradores: readonly ColaboradorMinDTO[]): Map<string, HorarioDelPuesto> {
  const porPuesto = new Map<string, HorarioDelPuesto>();
  for (const p of puestos) {
    if (p.horaEntrada) porPuesto.set(p.id, { horaEntrada: p.horaEntrada, toleranciaMin: p.toleranciaMin });
  }
  const porPersona = new Map<string, HorarioDelPuesto>();
  for (const c of colaboradores) {
    const horario = c.puesto ? porPuesto.get(c.puesto.id) : undefined;
    if (horario) porPersona.set(c.id, horario);
  }
  return porPersona;
}

export interface TardanzaSinMarcar {
  colaboradorId: string;
  fecha: FechaKey;
}

/**
 * Los días que figuran PRESENTE con la hora de entrada pasada de la tolerancia
 * del puesto: la tardanza está en el DATO y no en el estado, y es justo lo que
 * la revisión semanal tiene que ver antes de firmar el PDF (ADR-416).
 *
 * Sólo PRESENTE, igual que la hoja del día: quien ya está en TARDANZA no tiene
 * nada pendiente, y un estado puesto a mano (medio día, permiso) se respeta.
 * `cuenta` deja afuera lo que no se puede corregir —fuera de la ventana del rol
 * o fuera de la semana que se mira—: un aviso sobre algo sin acción posible
 * enseña a ignorar la franja entera.
 */
export function tardanzasSinMarcar(
  marcas: readonly AsistenciaDTO[],
  horarios: ReadonlyMap<string, HorarioDelPuesto>,
  cuenta: (fecha: FechaKey) => boolean,
): TardanzaSinMarcar[] {
  const lista: TardanzaSinMarcar[] = [];
  for (const m of marcas) {
    if (m.estado !== "PRESENTE" || !cuenta(m.fecha)) continue;
    const horario = horarios.get(m.colaboradorId);
    if (!horario) continue;
    if (tardanzaDe(m.entrada, horario.horaEntrada, horario.toleranciaMin)?.tarde) lista.push({ colaboradorId: m.colaboradorId, fecha: m.fecha });
  }
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.colaboradorId.localeCompare(b.colaboradorId));
}

/**
 * «Victor Quispe (Mar 15), Ana Ríos (Jue 17) y 2 más» — el aviso dice QUIÉN y
 * QUÉ DÍA, no sólo cuántos: bajo 640 px la semana se ve por persona y un número
 * suelto no lleva a ninguna celda.
 */
export function resumenTardanzas(lista: readonly TardanzaSinMarcar[], nombreDe: (colaboradorId: string) => string, tope = 3): string {
  const muestra = lista.slice(0, tope).map((t) => `${nombreDe(t.colaboradorId)} (${encabezadoDia(t.fecha)})`).join(", ");
  const resto = lista.length - tope;
  return resto > 0 ? `${muestra} y ${resto} más` : muestra;
}

/**
 * La marca completa para pasar un PRESENTE a TARDANZA. Manda TODO —hora de
 * entrada, salida y nota— porque el buffer de `use-rrhh-asistencia` REEMPLAZA
 * lo pendiente de la celda: con sólo el estado se guardaría la tardanza sin la
 * hora que justamente la delató, y la pantalla no lo mostraría hasta recargar.
 */
export function marcaConTardanza(marca: AsistenciaDTO | undefined, colaboradorId: string, fecha: FechaKey) {
  return {
    colaboradorId,
    fecha,
    estado: "TARDANZA" as const,
    entrada: marca?.entrada ?? null,
    salida: marca?.salida ?? null,
    nota: marca?.nota ?? null,
  };
}
