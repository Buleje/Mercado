/**
 * marcas-para-revisar.ts — de las marcas de los últimos días, SÓLO las
 * dudosas (Brandon 26-10: en Blas son 123 marcas al mes, todas a mano; nadie
 * mira 123). Las reglas leen lo que la hoja ya tiene — estado, horas, origen,
 * nota, horario del puesto (ADR-417) — y no inventan datos.
 *
 * Una marca por persona y día (ADR-414 §4): «dos entradas seguidas» no puede
 * existir en la hoja; el kiosko ya las frena a los 2 min (`MS_ENTRE_MARCAS`).
 *
 * PURO: sin Prisma, React ni fetch.
 */

import { tardanzaDe } from "./asistencia";
import { esMarcaDelKiosko, type AsistenciaDTO, type ColaboradorMinDTO, type EstadoAsistencia, type FechaKey } from "./tipos";
import { minutosDeHora } from "./fechas";

export type CodigoRevision = "sin_salida" | "salida_antes_de_entrada" | "kiosko_sin_foto" | "fuera_de_horario" | "tarde_sin_tardanza" | "jornada_larga";

export interface MotivoRevision {
  codigo: CodigoRevision;
  /** Frase para el dueño, en tuteo y sin jerga. */
  texto: string;
}

export interface HorarioDelPuesto {
  horaEntrada: string | null;
  toleranciaMin: number;
}

export interface MarcaParaRevisar {
  marca: AsistenciaDTO;
  nombre: string;
  motivos: MotivoRevision[];
}

/** Más lejos que esto de la hora del puesto (antes o después de la tolerancia): se mira. */
export const DESVIO_MAX_MIN = 90;
/** Una jornada de más horas que esto es casi seguro una salida mal tipeada. */
export const HORAS_MAX_JORNADA = 14;

/** Una marca del kiosko sin foto lleva esta frase en su nota (`app/api/kiosko/asistencia`). */
export const NOTA_KIOSKO_SIN_FOTO = "Sin foto en el kiosko";

const DE_TRABAJO: ReadonlySet<EstadoAsistencia> = new Set(["PRESENTE", "TARDANZA", "MEDIO_DIA"]);

const minutosTexto = (n: number) => `${n} min`;

/** Los motivos de UNA marca (vacío = está bien). */
export function motivosDeLaMarca(m: AsistenciaDTO, horario: HorarioDelPuesto | null, hoy: FechaKey, desvioMax = DESVIO_MAX_MIN): MotivoRevision[] {
  if (!DE_TRABAJO.has(m.estado)) return [];
  const motivos: MotivoRevision[] = [];
  const entradaMin = minutosDeHora(m.entrada);
  const salidaMin = minutosDeHora(m.salida);

  if (entradaMin != null && salidaMin == null && m.fecha < hoy) {
    motivos.push({ codigo: "sin_salida", texto: `Marcó entrada ${m.entrada} y nunca salida` });
  }
  if (entradaMin != null && salidaMin != null && salidaMin < entradaMin) {
    motivos.push({ codigo: "salida_antes_de_entrada", texto: `La salida (${m.salida}) es antes que la entrada (${m.entrada})` });
  }
  if (m.horas != null && m.horas > HORAS_MAX_JORNADA) {
    motivos.push({ codigo: "jornada_larga", texto: `Salen ${m.horas} horas en un día` });
  }
  if (esMarcaDelKiosko(m.origen, m.marcadoPor) && (m.nota ?? "").includes(NOTA_KIOSKO_SIN_FOTO)) {
    motivos.push({ codigo: "kiosko_sin_foto", texto: "La marcó la tablet sin foto: no hay cómo saber quién fue" });
  }

  // Medio día no se juzga contra la hora de entrada del puesto: el de la tarde entra a las 13:00
  // a propósito y saldría «fuera de horario» todos los días (revisión 26-10).
  if (horario?.horaEntrada && entradaMin != null && m.estado !== "MEDIO_DIA") {
    const t = tardanzaDe(m.entrada, horario.horaEntrada, horario.toleranciaMin);
    if (t) {
      const gracia = Math.max(0, Math.trunc(horario.toleranciaMin) || 0);
      if (t.minutos > gracia + desvioMax || t.minutos < -desvioMax) {
        const cuando = t.minutos < 0 ? `${minutosTexto(-t.minutos)} antes` : `${minutosTexto(t.minutos)} después`;
        motivos.push({ codigo: "fuera_de_horario", texto: `Entró ${m.entrada}, ${cuando} de las ${horario.horaEntrada}` });
      } else if (t.tarde && m.estado === "PRESENTE") {
        motivos.push({ codigo: "tarde_sin_tardanza", texto: `Entró ${minutosTexto(t.minutos)} tarde y está como Presente` });
      }
    }
  }
  return motivos;
}

export interface EntradaRevision {
  marcas: AsistenciaDTO[];
  colaboradores: Pick<ColaboradorMinDTO, "id" | "nombre" | "puesto">[];
  /** Por id de puesto. */
  horarios: ReadonlyMap<string, HorarioDelPuesto>;
  hoy: FechaKey;
  /** Ids de marca que el dueño ya aprobó. */
  revisadas: ReadonlySet<string>;
}

/** Sólo las dudosas y no aprobadas; lo más reciente primero, y a igual día por nombre. */
export function marcasParaRevisar(e: EntradaRevision): MarcaParaRevisar[] {
  const personas = new Map(e.colaboradores.map((c) => [c.id, c]));
  const salida: MarcaParaRevisar[] = [];
  for (const marca of e.marcas) {
    if (e.revisadas.has(marca.id)) continue;
    const persona = personas.get(marca.colaboradorId);
    if (!persona) continue;
    const horario = persona.puesto ? (e.horarios.get(persona.puesto.id) ?? null) : null;
    const motivos = motivosDeLaMarca(marca, horario, e.hoy);
    if (motivos.length > 0) salida.push({ marca, nombre: persona.nombre, motivos });
  }
  return salida.sort((a, b) => (a.marca.fecha === b.marca.fecha ? a.nombre.localeCompare(b.nombre, "es") : a.marca.fecha < b.marca.fecha ? 1 : -1));
}
