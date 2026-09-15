"use client";

/**
 * La celda APARTADO de una fila del stock: para quién está comprometida y hasta cuándo.
 *
 * ## Por qué existe
 *
 * En el libro real de Blas, **9 de 14 corridas** salieron del stock por «marcar
 * como usado»: sin guía y sin cliente. Y entre que el operador tilda los
 * paquetes y registra la GTF no había NINGÚN estado intermedio — nada impedía
 * que otro despachara los mismos paquetes mientras tanto.
 *
 * Apartar es eso que faltaba: **reservar**. No saca la madera del patio (sigue
 * disponible y sigue contando en los m³), la marca como comprometida.
 *
 * ## Lo que hay que ver de un golpe
 *
 * Una reserva **vencida que nadie soltó es stock congelado por error**, y es
 * exactamente lo que esta celda tiene que gritar: va en tono de peligro con
 * «venció hace N días». La vigente se lee tranquila, la que vence hoy o mañana
 * avisa en ámbar — todavía se puede llamar al cliente.
 *
 * El «hoy» entra por prop (`ahora`) y no se lee del reloj acá adentro: así el
 * vencimiento se prueba sin congelar el tiempo de todo el test.
 */

import { AlertTriangle, Bookmark, BookmarkPlus } from "@buleje/design-system/icons";
import { limaDateKey } from "@/lib/utils";

/** El apartado tal como viaja en cada fila (corrida y paquete) desde la API. */
export interface ApartadoDeFila {
  id: string;
  para: string;
  /** Fecha date-only «YYYY-MM-DD». `null` = reserva sin plazo. */
  hasta: string | null;
  nota: string | null;
  creadoAt?: string | null;
}

export type EstadoApartado = "vencido" | "vence-hoy" | "por-vencer" | "vigente" | "sin-plazo";

export interface PlazoDeApartado {
  estado: EstadoApartado;
  /** Días de hoy al plazo: negativo = ya venció. `null` cuando no hay plazo. */
  dias: number | null;
  /** Cómo se lee el plazo en la pastilla. */
  texto: string;
}

const DIA_MS = 86_400_000;
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Medianoche UTC de una fecha date-only del libro (aritmética sin off-by-one Lima). */
const aUtc = (clave: string): number => Date.parse(`${clave.slice(0, 10)}T00:00:00.000Z`);

/** El plazo que proponen los atajos del modal: hoy + N días, en clave del libro. */
export const sumarDias = (clave: string, dias: number): string =>
  new Date(Date.parse(`${clave}T00:00:00.000Z`) + dias * DIA_MS).toISOString().slice(0, 10);

/** «10/09» — lo que entra en una pastilla de tabla. La fecha completa va en el title. */
export const fechaCorta = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}` : iso;
};

/** «jueves 10/09» — el formato en el que se habla de un plazo en el patio. */
export const diaConNombre = (iso: string): string => {
  const t = aUtc(iso);
  if (!Number.isFinite(t)) return iso;
  return `${DIAS_SEMANA[new Date(t).getUTCDay()]} ${fechaCorta(iso)}`;
};

/**
 * En qué anda el plazo de una reserva.
 *
 * Exportada aparte del componente porque la misma cuenta la necesita el modal
 * (para avisar que el plazo que se está por poner ya pasó) y cualquier KPI que
 * quiera contar el stock congelado: una sola fórmula, no tres parecidas.
 */
export function plazoDeApartado(hasta: string | null, ahora: Date = new Date()): PlazoDeApartado {
  if (!hasta) return { estado: "sin-plazo", dias: null, texto: "sin plazo" };
  const fin = aUtc(hasta);
  if (!Number.isFinite(fin)) return { estado: "sin-plazo", dias: null, texto: "sin plazo" };
  const dias = Math.round((fin - aUtc(limaDateKey(ahora))) / DIA_MS);
  if (dias < 0) {
    const n = -dias;
    return { estado: "vencido", dias, texto: `venció hace ${n} día${n === 1 ? "" : "s"}` };
  }
  if (dias === 0) return { estado: "vence-hoy", dias, texto: "vence hoy" };
  if (dias === 1) return { estado: "por-vencer", dias, texto: "vence mañana" };
  if (dias <= 3) return { estado: "por-vencer", dias, texto: `vence en ${dias} días` };
  return { estado: "vigente", dias, texto: `hasta ${fechaCorta(hasta)}` };
}

/**
 * Un tono por estado: sólo el vencido y el que está por vencer piden mirar la fila.
 *
 * Los tonos van como color con alpha sobre la superficie (`/15`), NUNCA con
 * `--accent-soft`: medido en el navegador, ese token resuelve a un menta claro
 * fijo dentro del panel (y a coral sobre `html`), así que en oscuro pintaba un
 * bloque claro con texto turquesa — 2,2:1, ilegible.
 */
const TONO: Record<EstadoApartado, string> = {
  vencido:
    "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/25",
  "vence-hoy":
    "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)]/25",
  "por-vencer":
    "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)]/25",
  vigente:
    "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)] hover:bg-[var(--data-info-500)]/25",
  "sin-plazo":
    "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)] hover:bg-[var(--data-info-500)]/25",
};

export function CeldaApartado({
  apartado,
  onAbrir,
  ahora,
  mostrarVacio = true,
}: {
  /** `null` = la fila no está comprometida con nadie. */
  apartado: ApartadoDeFila | null;
  /** Abre `CtpApartarModal` con esta fila (para apartar, cambiar o liberar). */
  onAbrir: () => void;
  /** El «hoy» con el que se mide el vencimiento. Por defecto, el reloj. */
  ahora?: Date;
  /**
   * Sin apartado, ¿se ofrece la puerta «Apartar»? En la columna ACCIONES sí;
   * pegada al código de la fila no, o cada fila libre repetiría el mismo botón.
   */
  mostrarVacio?: boolean;
}) {
  if (!apartado) {
    if (!mostrarVacio) return null;
    return (
      <button
        type="button"
        onClick={onAbrir}
        title="Reservar esta madera para un cliente, con plazo. Sigue en el patio y sigue contando en los m³."
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-sans text-sm font-bold text-[var(--accent-dark)] underline decoration-dotted underline-offset-4 transition-colors hover:bg-[var(--accent)]/10 dark:text-[var(--accent)]"
      >
        <BookmarkPlus className="h-4 w-4 shrink-0" aria-hidden /> Apartar
      </button>
    );
  }

  const plazo = plazoDeApartado(apartado.hasta, ahora);
  const vencido = plazo.estado === "vencido";
  const detalle = [
    `Apartado para ${apartado.para}`,
    apartado.hasta ? `hasta el ${diaConNombre(apartado.hasta)}` : "sin plazo",
    vencido
      ? "La reserva venció: si ya no va, libérala para que la madera vuelva a estar libre."
      : null,
    apartado.nota ? `Nota: ${apartado.nota}` : null,
    "Toca para cambiarla o liberarla.",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onAbrir}
      title={detalle}
      className={`inline-flex min-h-11 max-w-full flex-wrap items-center gap-1.5 rounded-xl px-2 py-1 text-left font-sans text-xs font-bold transition-colors ${TONO[plazo.estado]}`}
    >
      {vencido ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <Bookmark className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      <span className="max-w-[9rem] truncate sm:max-w-[12rem]">Apartado: {apartado.para}</span>
      <span className="shrink-0 font-normal opacity-90">· {plazo.texto}</span>
    </button>
  );
}
