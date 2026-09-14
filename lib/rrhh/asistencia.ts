/**
 * asistencia.ts — las reglas de una marca de asistencia (ADR-414 §4).
 *
 * `revisarMarca` es la ÚNICA puerta: la ruta y el masivo la llaman con el
 * mismo contexto, así que una marca que pasa acá pasa igual desde cualquier
 * pantalla. Rechaza ANTES de tocar la base — el índice único parcial de
 * Postgres es la segunda línea de defensa, para la carrera entre dos
 * pestañas, no la primera.
 *
 * PURO: sin Prisma, React ni fetch.
 */

import { etiquetaCorta, etiquetaDia, minutosDeHora } from "./fechas";
import type { EstadoAsistencia, EstadoColaborador, FechaKey, MotivoRechazo } from "./tipos";

// ── Horas ────────────────────────────────────────────────────────────────────

export interface HorasInput {
  entradaMin: number | null;
  salidaMin: number | null;
  refrigerioMin: number;
  /** La que se tipeó a mano, cuando no hay entrada/salida. */
  horasTipeadas: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * `(salida − entrada − refrigerio) / 60` si vienen las dos horas de pared; si
 * no, la que se tipeó; si no hay ninguna, `null`.
 */
export function calcularHoras(m: HorasInput): number | null {
  if (m.entradaMin != null && m.salidaMin != null) {
    return r2((m.salidaMin - m.entradaMin - m.refrigerioMin) / 60);
  }
  if (m.horasTipeadas != null) return r2(m.horasTipeadas);
  return null;
}

// ── Revisar una marca ────────────────────────────────────────────────────────

const ESTADOS_CON_HORAS: readonly EstadoAsistencia[] = ["PRESENTE", "TARDANZA", "MEDIO_DIA"];

/** Lo que manda la pantalla para UNA celda. `estado: null` = quitar la marca del día. */
export interface MarcaInput {
  colaboradorId: string;
  fecha: FechaKey;
  estado: EstadoAsistencia | null;
  entrada?: string | null; // "HH:MM"
  salida?: string | null;
  refrigerioMin?: number;
  horas?: number | null;
  nota?: string | null;
}

export interface ContextoColaborador {
  fechaIngreso: FechaKey | null;
  fechaCese: FechaKey | null;
  /** Baja lógica del `Colaborador` — nunca se le escribe una marca nueva. */
  eliminado: boolean;
}

export interface RevisarMarcaCtx {
  colaborador: ContextoColaborador;
  /** `limaDateKey()` del servidor — nunca el reloj del cliente. */
  hoy: FechaKey;
  /** La de `ventanaDeMarcado`. */
  ventana: { desde: FechaKey | null; hasta: FechaKey };
  marcadoPor: string;
  origen: "manual" | "masivo";
}

/** Ya normalizada y lista para escribir — o para leer, si `quitar`. */
export interface MarcaNormalizada {
  colaboradorId: string;
  fecha: FechaKey;
  quitar: boolean;
  estado: EstadoAsistencia | null;
  entradaMin: number | null;
  salidaMin: number | null;
  refrigerioMin: number;
  horas: number | null;
  nota: string | null;
  marcadoPor: string;
  origen: "manual" | "masivo";
}

export type RevisionMarca =
  | { ok: true; marca: MarcaNormalizada }
  | { ok: false; motivo: MotivoRechazo; message: string };

/**
 * Revisa una marca ANTES de guardarla. El orden importa: primero quién es y
 * cuándo (eliminado, futuro, ventana, ingreso, cese) — esas rechazan sin mirar
 * el estado — y recién después las reglas de horas, que sólo aplican si hay
 * algo que guardar.
 */
export function revisarMarca(input: MarcaInput, ctx: RevisarMarcaCtx): RevisionMarca {
  if (ctx.colaborador.eliminado) {
    return { ok: false, motivo: "colaborador_eliminado", message: "Esta persona fue eliminada." };
  }
  if (input.fecha > ctx.hoy) {
    return { ok: false, motivo: "futuro", message: `Todavía no llega el ${etiquetaDia(input.fecha, ctx.hoy)}.` };
  }
  if (ctx.ventana.desde != null && input.fecha < ctx.ventana.desde) {
    return {
      ok: false,
      motivo: "fuera_de_ventana",
      message: `Sólo puedes corregir desde el ${etiquetaDia(ctx.ventana.desde, ctx.hoy)}.`,
    };
  }
  const { fechaIngreso, fechaCese } = ctx.colaborador;
  if (fechaIngreso && input.fecha < fechaIngreso) {
    return {
      ok: false,
      motivo: "antes_del_ingreso",
      message: `Ingresó el ${etiquetaCorta(fechaIngreso)}: no se le puede marcar antes.`,
    };
  }
  if (fechaCese && input.fecha > fechaCese) {
    return {
      ok: false,
      motivo: "despues_del_cese",
      message: `Cesó el ${etiquetaCorta(fechaCese)}: no se le puede marcar el ${etiquetaCorta(input.fecha)}.`,
    };
  }

  // Quitar la marca del día: nada más que revisar.
  if (input.estado === null) {
    return {
      ok: true,
      marca: {
        colaboradorId: input.colaboradorId,
        fecha: input.fecha,
        quitar: true,
        estado: null,
        entradaMin: null,
        salidaMin: null,
        refrigerioMin: 0,
        horas: null,
        nota: null,
        marcadoPor: ctx.marcadoPor,
        origen: ctx.origen,
      },
    };
  }

  const conTrabajo = ESTADOS_CON_HORAS.includes(input.estado);
  const entradaMin = minutosDeHora(input.entrada ?? null);
  const salidaMin = minutosDeHora(input.salida ?? null);
  const refrigerioMin = input.refrigerioMin ?? 0;
  const horasTipeadas = input.horas ?? null;

  if (!conTrabajo && (entradaMin != null || salidaMin != null || horasTipeadas != null)) {
    return { ok: false, motivo: "horas_en_estado_sin_trabajo", message: "Una falta no lleva horas." };
  }

  if (entradaMin != null && salidaMin != null && salidaMin <= entradaMin) {
    return { ok: false, motivo: "turno_cruza_medianoche", message: "La salida tiene que ser después de la entrada." };
  }

  const horas = conTrabajo ? calcularHoras({ entradaMin, salidaMin, refrigerioMin, horasTipeadas }) : null;
  if (horas != null && horas <= 0) {
    return { ok: false, motivo: "horas_invalidas", message: "El refrigerio no puede ser mayor que el turno." };
  }

  return {
    ok: true,
    marca: {
      colaboradorId: input.colaboradorId,
      fecha: input.fecha,
      quitar: false,
      estado: input.estado,
      entradaMin: conTrabajo ? entradaMin : null,
      salidaMin: conTrabajo ? salidaMin : null,
      refrigerioMin: conTrabajo ? refrigerioMin : 0,
      horas,
      nota: input.nota?.trim() || null,
      marcadoPor: ctx.marcadoPor,
      origen: ctx.origen,
    },
  };
}

// ── ¿Cambió algo? ────────────────────────────────────────────────────────────

export interface MarcaComparable {
  estado: EstadoAsistencia | null;
  entradaMin: number | null;
  salidaMin: number | null;
  refrigerioMin: number;
  horas: number | null;
  nota: string | null;
}

/**
 * ¿La marca nueva es idéntica a la viva? Si sí, no se escribe nada
 * (`sinCambio`, ADR-414 §4) — evita una versión nueva por cada autosave que
 * no cambió realmente la celda.
 */
export function esIgualALaViva(viva: MarcaComparable | null, nueva: MarcaComparable): boolean {
  if (nueva.estado === null) return viva === null;
  if (!viva) return false;
  return (
    viva.estado === nueva.estado &&
    viva.entradaMin === nueva.entradaMin &&
    viva.salidaMin === nueva.salidaMin &&
    viva.refrigerioMin === nueva.refrigerioMin &&
    viva.horas === nueva.horas &&
    (viva.nota ?? null) === (nueva.nota ?? null)
  );
}

// ── Masivo del día ───────────────────────────────────────────────────────────

export interface ColaboradorParaMasivo {
  id: string;
  nombre: string;
  estado: EstadoColaborador;
  fechaIngreso: FechaKey | null;
}

export interface OmitidoMasivo {
  colaboradorId: string;
  nombre: string;
  motivo: "ya_marcado" | "no_activo" | "no_ingresado" | "cesado";
}

/**
 * Quiénes entran a «Todos presentes» y quiénes quedan afuera, y por qué.
 *
 * Sólo `ACTIVO` con `fechaIngreso ≤ fecha` (o sin fecha) entra al cálculo;
 * `VACACIONES/LICENCIA/SUSPENDIDO` y `CESADO` quedan en «No incluidos» — cada
 * uno con su propio botón en la pantalla, nunca marcados de arrastre. Sin
 * `sobrescribir`, a quien ya tiene marca viva ese día no se le toca nada.
 */
export function incluidosEnMasivo(
  colaboradores: readonly ColaboradorParaMasivo[],
  fecha: FechaKey,
  vivas: ReadonlySet<string>,
  opts: { colaboradorIds?: readonly string[] | null; sobrescribir: boolean },
): { incluidos: string[]; omitidos: OmitidoMasivo[] } {
  const filtro = opts.colaboradorIds ? new Set(opts.colaboradorIds) : null;
  const incluidos: string[] = [];
  const omitidos: OmitidoMasivo[] = [];

  for (const c of colaboradores) {
    if (filtro && !filtro.has(c.id)) continue;
    if (c.estado === "CESADO") {
      omitidos.push({ colaboradorId: c.id, nombre: c.nombre, motivo: "cesado" });
      continue;
    }
    if (c.estado !== "ACTIVO") {
      omitidos.push({ colaboradorId: c.id, nombre: c.nombre, motivo: "no_activo" });
      continue;
    }
    if (c.fechaIngreso != null && c.fechaIngreso > fecha) {
      omitidos.push({ colaboradorId: c.id, nombre: c.nombre, motivo: "no_ingresado" });
      continue;
    }
    if (!opts.sobrescribir && vivas.has(c.id)) {
      omitidos.push({ colaboradorId: c.id, nombre: c.nombre, motivo: "ya_marcado" });
      continue;
    }
    incluidos.push(c.id);
  }

  return { incluidos, omitidos };
}
