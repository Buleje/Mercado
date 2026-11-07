/**
 * La cabecera de la tarjeta de una troza: la marca que se pinta en la testa, la
 * especie con su nombre científico y dónde está hoy. Es lo que se lee de lejos
 * con el celular en la mano, así que va grande y sobre la franja de la marca.
 *
 * El dibujo de los anillos es sólo decoración (la testa del tronco): no dice
 * nada que no diga el texto.
 */

import { Kicker, PageTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import type { EstadoTroza, TonoEstado } from "@/lib/forestal/tarjeta-troza";

/** El punto de color de la pastilla. El texto dice el estado: el color acompaña. */
const PUNTO: Record<TonoEstado, string> = {
  ok: "bg-[var(--data-success-500)]",
  info: "bg-[var(--data-info-500)]",
  warn: "bg-[var(--data-warning-500)]",
  neutral: "bg-[var(--text-tertiary)]",
};

/**
 * Fondo de la franja: el turquesa oscuro de la marca (`--accent-dark`,
 * #007F7A), bajado hacia el negro para que el texto blanco pase AA sobrado en
 * toda la franja. Medido con canvas (26-09): la punta clara sale rgb(0,103,99)
 * → blanco 6,73:1 y blanco al 90 % 5,79:1; la oscura, 14,89:1. El
 * `--accent-dark` a secas da 4,9:1: justo, y el kicker es de 12 px.
 */
const FONDO_FRANJA = {
  background:
    "linear-gradient(140deg, color-mix(in oklab, var(--accent-dark) 86%, black) 0%, color-mix(in oklab, var(--accent-dark) 50%, black) 100%)",
} as const;

export function PastillaEstado({ estado, className }: { estado: EstadoTroza; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 max-w-full items-center gap-2 rounded-full bg-[var(--surface-raised)] px-3 py-1 text-sm font-bold text-[var(--text-primary)] shadow-sm ring-1 ring-white/25",
        className,
      )}
      data-estado-troza={estado.clave}
    >
      <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PUNTO[estado.tono])} />
      <span className="truncate">{estado.texto}</span>
    </span>
  );
}

/** La testa del tronco: anillos un poco corridos, como los de verdad, y dos rajaduras. */
function Testa({ className }: { className?: string }) {
  const anillos = [
    { r: 84, dx: 1.5, dy: -1 },
    { r: 72, dx: 2.5, dy: -0.5 },
    { r: 61, dx: 3, dy: 0.5 },
    { r: 51, dx: 3.5, dy: 1 },
    { r: 42, dx: 3.5, dy: 1.5 },
    { r: 33, dx: 3, dy: 2 },
    { r: 25, dx: 2.5, dy: 2 },
    { r: 17, dx: 2, dy: 2 },
    { r: 9, dx: 1.5, dy: 1.5 },
  ];
  return (
    <svg viewBox="0 0 200 200" aria-hidden focusable="false" className={className} fill="none" stroke="currentColor">
      <circle cx="100" cy="100" r="95" strokeWidth="7" />
      {anillos.map((a) => (
        <ellipse key={a.r} cx={100 + a.dx} cy={100 + a.dy} rx={a.r} ry={a.r * 0.97} strokeWidth="1.6" />
      ))}
      <path d="M103 102 L150 58 M103 102 L70 168" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function TarjetaHero({
  codigo,
  bosque,
  especie,
  cientifica,
  estado,
}: {
  codigo: string;
  /** La marca del bosque, sólo si no es la misma que va grande. */
  bosque: string | null;
  especie: string | null;
  cientifica: string | null;
  estado: EstadoTroza;
}) {
  /* Una marca de planta es corta («118», «115-A») o de ocho cifras («90100135»);
     la del bosque puede tener catorce caracteres («13/A (0000044)»). Medido a
     400 px: ocho cifras en text-6xl se partían en dos renglones. */
  const tamano =
    codigo.length <= 5 ? "text-6xl sm:text-7xl" : codigo.length <= 8 ? "text-5xl sm:text-7xl" : "text-4xl sm:text-5xl";
  return (
    <header className="relative isolate overflow-hidden px-5 pb-6 pt-5 text-white sm:px-7 sm:pb-7" style={FONDO_FRANJA}>
      <Testa className="pointer-events-none absolute -bottom-20 -right-14 -z-10 h-64 w-64 text-white/12 sm:h-80 sm:w-80" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Kicker className="text-white/90">Troza · Libro CTP</Kicker>
        <PastillaEstado estado={estado} />
      </div>
      <PageTitle
        className={cn(
          "mt-4 break-words leading-none tracking-tight tabular-nums text-white",
          tamano,
        )}
      >
        <span className="sr-only">Troza </span>
        {codigo}
      </PageTitle>
      <p className="mt-4 text-2xl font-bold leading-tight">{especie ?? "Sin especie"}</p>
      {cientifica && <p className="mt-0.5 text-base italic text-white/90">{cientifica}</p>}
      {bosque && (
        <p className="mt-3 text-sm text-white/90">
          Cód. bosque <span className="font-mono font-semibold">{bosque}</span>
        </p>
      )}
    </header>
  );
}
