/**
 * ¿Lo cubicado en «Producir sin lote» es de OTRO día que la jornada que se va a
 * declarar? (radar 2026-09-15, medido: 1 pieza sobrevivió a Escape y reapareció.)
 *
 * La libreta del modal vive en el `localStorage` y sobrevive a cerrarlo. Nada
 * decía de cuándo era: la jornada del sábado podía declararse con la fecha del
 * lunes ante SERFOR. Junto a lo cubicado se guarda ahora CUÁNDO se cubicó (y la
 * jornada que se eligió); al reabrir, si no coincide con la fecha elegida, se
 * avisa antes de declarar. Esta función es sólo la decisión —qué día, cuántos
 * días, si avisar—; guardar y leer es de `hooks/libreta-produccion.ts`.
 *
 * Todo en días de Pucallpa (`limaDateKey`): a las 20:00 locales el UTC ya está
 * en el día siguiente y cubicar el sábado de noche no puede contar como domingo.
 */
import { limaDateKey } from "@/lib/utils";
import { esIsoValido, hoyEnLima, nombreDelDia } from "./semana-de-registro";

/** Lo que se guarda al lado de las filas. Todo opcional: lo viejo no trae nada. */
export interface CuandoCubicado {
  /** Instante (ISO) en que entró la PRIMERA pieza de lo que hay ahora. */
  desde?: string;
  /** Instante (ISO) del último cambio. */
  ultima?: string;
  /** Última jornada (`YYYY-MM-DD`) que la persona eligió con las piezas a la vista. */
  jornada?: string;
  /** La persona ya dijo que lo cubicado sin fecha es de la jornada elegida. */
  sinFechaOk?: boolean;
}

export type AvisoCubicado =
  | {
      tipo: "otro-dia";
      /** Día (Lima) en que entró la primera pieza. */
      desdeDia: string;
      /** Día (Lima) del último cambio; igual a `desdeDia` si fue todo el mismo día. */
      hastaDia: string;
      /** Días entre `desdeDia` y hoy. */
      hace: number;
      /** La fecha de jornada que le corresponde a lo cubicado (la que ofrece el botón). */
      usarFecha: string;
      /** Jornada elegida cuando es otra que el día en que se cubicó; si no, `null`. */
      paraJornada: string | null;
    }
  | { tipo: "sin-fecha" };

/** Días enteros de `a` a `b` (ambos `YYYY-MM-DD`). */
export function diasEntre(a: string, b: string): number {
  const MS_DIA = 86_400_000;
  return Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / MS_DIA);
}

/**
 * Devuelve el aviso que corresponde, o `null` si no hay nada que decir (libreta
 * vacía, o lo cubicado ya es de la jornada elegida).
 *
 * - Sin `desde` (lo guardado antes de que existiera esta marca) → «sin fecha»,
 *   hasta que la persona lo confirme.
 * - Con `desde`: el día de referencia es la jornada que se eligió (`jornada`) o,
 *   si nunca se eligió, el día en que se cubicó. Si es distinto de `fecha` → aviso.
 */
export function avisoDeCubicadoViejo({
  cuando,
  cantidad,
  fecha,
  hoy = hoyEnLima(),
}: {
  cuando: CuandoCubicado | null | undefined;
  /** Piezas (suma de cantidades) que hay cubicadas ahora. */
  cantidad: number;
  /** La fecha de jornada elegida en el modal. */
  fecha: string;
  hoy?: string;
}): AvisoCubicado | null {
  if (!(cantidad > 0)) return null;
  const desdeDia = cuando?.desde ? limaDateKey(cuando.desde) : "";
  if (!esIsoValido(desdeDia)) return cuando?.sinFechaOk ? null : { tipo: "sin-fecha" };

  const jornada = cuando?.jornada && esIsoValido(cuando.jornada) ? cuando.jornada : null;
  const referencia = jornada ?? desdeDia;
  if (referencia === fecha) return null;

  const ultimaDia = cuando?.ultima ? limaDateKey(cuando.ultima) : "";
  const hastaDia = esIsoValido(ultimaDia) && ultimaDia > desdeDia ? ultimaDia : desdeDia;
  return {
    tipo: "otro-dia",
    desdeDia,
    hastaDia,
    hace: Math.max(0, diasEntre(desdeDia, hoy)),
    usarFecha: referencia,
    paraJornada: jornada && jornada !== desdeDia ? jornada : null,
  };
}

/** `"sáb 01-11"` — el día como se dice en el aserradero. */
export function diaYMes(iso: string): string {
  return `${nombreDelDia(iso).toLowerCase()} ${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
}

/** `"01-11"` — para el botón. */
export const diaMes = (iso: string): string => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

const haceTexto = (n: number) => (n === 0 ? "hoy" : n === 1 ? "hace 1 día" : `hace ${n} días`);

/** «Lo cubicado es del sáb 01-11 (hace 3 días) — 12 piezas». `piezas` ya viene formateado. */
export function textoDelAviso(aviso: AvisoCubicado, piezas: string): string {
  if (aviso.tipo === "sin-fecha") return `Lo cubicado no dice de qué día es — ${piezas}`;
  const { desdeDia, hastaDia, hace, paraJornada } = aviso;
  const cuando =
    desdeDia === hastaDia
      ? `Lo cubicado es del ${diaYMes(desdeDia)} (${haceTexto(hace)})`
      : `Lo cubicado va del ${diaYMes(desdeDia)} al ${diaYMes(hastaDia)} (desde ${haceTexto(hace)})`;
  return `${cuando}${paraJornada ? `, para la jornada del ${diaYMes(paraJornada)}` : ""} — ${piezas}`;
}
