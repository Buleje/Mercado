/**
 * Las marcas de origen y salida, dibujadas (ADR-445). Qué dice cada una vive en
 * `marcas-del-dia.ts`; acá, cómo se ve:
 *
 *  · `MarcasDelCasillero` — dos cuadraditos con ícono dentro del casillero de
 *    la tira. A 400 px el casillero mide ~40 px por dentro: dos de 18 px entran
 *    en una fila sin empujar la fecha.
 *  · `MarcaConTexto` — la pastilla con ícono y palabra, para el detalle del día
 *    y las corridas del modal, donde sí hay ancho.
 *  · `ChipsDeLaSemana` — «3 por tipo · 1 sin guía»: tocar uno resalta esos
 *    días en la tira.
 *
 * Color por token y además ícono y borde: los estados pendientes (en patio,
 * por declarar) llevan borde punteado, así se leen distinto sin color.
 */

import { cn } from "@/lib/utils";
import type { OrigenYSalida } from "@/lib/forestal/origen-y-salida-del-dia";
import {
  claveDeFiltro,
  fraseDeSalida,
  MARCA_ORIGEN,
  MARCA_SALIDA,
  origenVisibleDelDia,
  type ChipDeLaSemana,
  type FiltroDeDias,
  type Marca,
  type TonoDeMarca,
} from "./marcas-del-dia";

/* `-ink` y no `-700`: texto e íconos chicos de color semántico no llegan a
   4,5:1 con el -700 del preset (memoria `texto-semantico-chico-usa-ink`). */
const TINTA: Record<TonoDeMarca, string> = {
  exito: "text-[var(--data-success-ink)]",
  info: "text-[var(--data-info-ink)]",
  aviso: "text-[var(--data-warning-ink)]",
  neutro: "text-[var(--text-secondary)]",
};
const BORDE: Record<TonoDeMarca, string> = {
  exito: "border-[var(--data-success-500)]/60",
  info: "border-[var(--data-info-500)]/60",
  aviso: "border-[var(--data-warning-500)]/70",
  neutro: "border-dashed border-[var(--rule-strong)]/50",
};

/** Un cuadradito con el ícono de la marca. `role="img"`: el lector dice la frase entera. */
export function MarcaIcono({ marca, etiqueta }: { marca: Marca; etiqueta: string }) {
  const { Icono } = marca;
  return (
    <span
      role="img"
      aria-label={etiqueta}
      title={etiqueta}
      data-tono={marca.tono}
      className={cn(
        "grid size-[1.125rem] shrink-0 place-items-center rounded-[5px] border bg-[var(--surface-raised)]",
        TINTA[marca.tono],
        BORDE[marca.tono],
      )}
    >
      <Icono className="size-3.5" aria-hidden />
    </span>
  );
}

/** Las dos marcas del día, en el casillero de la tira. */
export function MarcasDelCasillero({ os }: { os: OrigenYSalida }) {
  const origen = MARCA_ORIGEN[origenVisibleDelDia(os)];
  const salida = MARCA_SALIDA[os.salida.estado];
  return (
    <span className="mt-0.5 flex items-center justify-center gap-0.5" data-marcas-del-dia>
      <MarcaIcono marca={origen} etiqueta={`Origen: ${origen.largo}`} />
      <MarcaIcono
        marca={salida}
        etiqueta={`Salida: ${fraseDeSalida(os.salida.estado, os.salida.guias)}`}
      />
    </span>
  );
}

/** Pastilla con ícono y palabra: el detalle del día y las corridas del modal. */
export function MarcaConTexto({
  marca,
  etiqueta,
  className,
}: {
  marca: Marca;
  /** El globo; sin él, la frase larga de la marca. */
  etiqueta?: string;
  className?: string;
}) {
  const { Icono } = marca;
  return (
    <span
      title={etiqueta ?? marca.largo}
      data-tono={marca.tono}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-bold",
        TINTA[marca.tono],
        BORDE[marca.tono],
        className,
      )}
    >
      <Icono className="size-3.5 shrink-0" aria-hidden />
      {marca.corto}
    </span>
  );
}

/**
 * «3 por tipo · 1 sin guía» — lo de la semana, contado por día. Tocar un chip
 * resalta esos días en la tira; tocarlo otra vez lo suelta.
 */
export function ChipsDeLaSemana({
  chips,
  filtro,
  onFiltro,
}: {
  chips: readonly ChipDeLaSemana[];
  filtro: FiltroDeDias | null;
  onFiltro: (f: FiltroDeDias | null) => void;
}) {
  if (chips.length === 0) return null;
  const activo = filtro ? claveDeFiltro(filtro) : null;
  return (
    <div
      role="group"
      aria-label="Resaltar días de la semana"
      className="flex flex-wrap items-center gap-1"
      data-chips-semana
    >
      {chips.map((c) => {
        const clave = claveDeFiltro(c.filtro);
        const encendido = clave === activo;
        const { Icono } = c.marca;
        const texto = `${c.dias} ${c.dias === 1 ? c.marca.uno : c.marca.varios}`;
        return (
          <button
            key={clave}
            type="button"
            aria-pressed={encendido}
            onClick={() => onFiltro(encendido ? null : c.filtro)}
            title={`${c.marca.largo}. ${encendido ? "Toca para dejar de resaltar" : "Toca para resaltar esos días"}`}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-bold transition-colors",
              encendido
                ? /* Como el casillero elegido: tinte + anillo. Blanco sobre el
                     turquesa no llega a 4,5:1 en letra chica. */
                  "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] ring-1 ring-[var(--accent)] dark:text-[var(--accent)]"
                : cn(
                    "bg-[var(--surface-raised)] hover:border-[var(--accent)]",
                    TINTA[c.marca.tono],
                    BORDE[c.marca.tono],
                  ),
            )}
          >
            <Icono className="size-3.5 shrink-0" aria-hidden />
            <span className="tabular-nums">{texto}</span>
          </button>
        );
      })}
    </div>
  );
}
