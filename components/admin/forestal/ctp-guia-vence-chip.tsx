/**
 * El chip «vence en 2 días» / «vence hoy» / «vencida hace 3 días» de una guía
 * guardada que espera su madera (ADR-442), y el «Vence» de su ficha resumida.
 * Lo usan la fila de la bandeja y del listado y la ficha del modal de la guía;
 * vive aparte para que esos dos módulos no se importen en círculo.
 *
 * El chip recibe el vencimiento ya calculado (`vencimientoDeGuiaGuardada`):
 * la bandeja lo calcula una vez para ordenar, contar y dibujar.
 */

import { CalendarClock, CalendarOff } from "@buleje/design-system/icons";
import type { GuiaGuardadaVista } from "@/lib/forestal/guias-guardadas";
import { diaConNombre } from "@/lib/forestal/plazo-de-apartado";
import {
  vencimientoDeGuiaGuardada,
  type VencimientoGuardada,
} from "@/lib/forestal/vencimiento-guia-guardada";

/* El tono va también en palabras: el chip dice «vencida», no sólo el color.
   «Vencida» es ámbar, igual que «vencida sin recibir» en la tabla de Ingresos
   (`CtpChipVencimiento`): allá el rojo es para la que YA entró vencida, un
   hecho consumado; acá la madera todavía no llegó. «Pronto» va en azul: en
   oscuro el coral y el ámbar se confundían con «vencida». */
const TONO: Record<VencimientoGuardada["tono"], string> = {
  vencida:
    "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  hoy: "bg-[var(--data-warning-500)]/20 text-[var(--data-warning-ink)] ring-1 ring-inset ring-[var(--data-warning-500)]/60",
  pronto:
    "bg-[var(--data-info-500)]/12 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
  ok: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  sin_fecha: "border border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]",
};

const ICONO = {
  vencida: CalendarOff,
  hoy: CalendarClock,
  pronto: CalendarClock,
  ok: CalendarClock,
  sin_fecha: CalendarOff,
} as const;

export function ChipVencimiento({ v }: { v: VencimientoGuardada }) {
  const Icono = ICONO[v.tono];
  return (
    <span
      title={v.detalle}
      data-tono-vence={v.tono}
      className={`inline-flex min-h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${TONO[v.tono]}`}
    >
      <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {v.texto}
      {/* El title no lo lee un lector de pantalla ni se ve en el celular. */}
      <span className="sr-only">. {v.detalle}</span>
    </span>
  );
}

/**
 * «Vence · jueves 24/09» dentro del `<dl>` de la ficha y, si la madera todavía
 * no entró, cuánto le queda. En una ingresada sólo la fecha: `ingreso.en` es
 * cuándo se registró, no cuándo llegó, y no se afirma lo que no se sabe.
 */
export function DatoVence({ g, hoy }: { g: GuiaGuardadaVista; hoy: string }) {
  const v = vencimientoDeGuiaGuardada(g, hoy);
  return (
    <div className="min-w-0" data-testid="ficha-vence">
      <dt className="text-xs font-medium text-[var(--text-tertiary)]">Vence</dt>
      <dd className="text-sm font-bold text-[var(--text-primary)]" title={g.resumen?.fechaVencimiento ?? undefined}>
        {v.vencimiento ? diaConNombre(v.vencimiento) : "—"}
      </dd>
      {!g.ingreso && (
        <dd className="mt-1">
          <ChipVencimiento v={v} />
        </dd>
      )}
    </div>
  );
}

/** La guía sin ficha de SERFOR: una línea, sin inventar la fecha. */
export function SinFechaDeVencimiento({ g, hoy }: { g: GuiaGuardadaVista; hoy: string }) {
  const v = vencimientoDeGuiaGuardada(g, hoy);
  return (
    <p data-testid="ficha-vence" className="flex items-start gap-1.5 text-sm text-[var(--text-secondary)]">
      <CalendarOff className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      {v.detalle}
    </p>
  );
}
