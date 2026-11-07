import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";

/**
 * La tarjeta del tablero denso del Resumen (2026-10-29): título + ⓘ a la
 * izquierda, la cifra que resume el bloque a la derecha, una línea de datos
 * («Promedio S/ 31 por día · Mejor día…») y el dibujo. Sin kicker, sin
 * bajada, sin plegar: cada bloque mide lo que su dato necesita.
 *
 * Se apila en `GrillaTablero` (`@container` del tablero): 1 columna en el
 * celular, 2 desde ~42rem y 3 desde ~56rem de ancho.
 */
export function TarjetaTablero({
  id,
  titulo,
  ayuda,
  cifra,
  cifraTono = "normal",
  datos,
  pie,
  children,
  className,
}: {
  /** `data-tarjeta` (para medir y probar). */
  id: string;
  titulo: string;
  /** ⓘ al lado del título: qué cuenta y de dónde sale. */
  ayuda?: string;
  /** La cifra del bloque, ya formateada («S/ 1,234.50»). */
  cifra?: string | null;
  cifraTono?: "normal" | "aviso" | "bien" | "mal";
  /** Fila de datos concretos bajo el título (`DatosEnLinea`). */
  datos?: ReactNode;
  /** Una línea al pie (enlace al módulo, «y 4 más»). */
  pie?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-tarjeta={id}
      className={cn(
        "@container flex min-w-0 flex-col border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4",
        className,
      )}
    >
      {/* flex-wrap: si el título y la cifra no entran juntos, la cifra baja a su
          propia línea (a la derecha) en vez de cortar el título. */}
      <header className="mb-2 flex flex-wrap items-start gap-x-3 gap-y-0.5">
        <div className="flex min-w-0 max-w-full flex-[1_1_auto] items-center gap-1">
          <CardTitle className="min-w-0 truncate text-sm font-bold">
            {titulo}
          </CardTitle>
          {ayuda && (
            <InfoTip title={titulo} what={ayuda} className="-my-1 shrink-0" ariaLabel={`Qué muestra «${titulo}»`} />
          )}
        </div>
        {cifra && (
          <p
            className={cn(
              "ml-auto shrink-0 text-right text-[length:var(--ts-lg)] font-extrabold leading-tight tabular-nums",
              TONO[cifraTono],
            )}
          >
            {cifra}
          </p>
        )}
      </header>
      {datos && <div className="mb-3">{datos}</div>}
      {/* Arriba, pegado a sus datos: si la fila estira la tarjeta, el aire queda al pie. */}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      {pie && <div className="mt-2 text-sm font-medium text-[var(--text-tertiary)]">{pie}</div>}
    </section>
  );
}

const TONO = {
  normal: "text-[var(--text-primary)]",
  // Texto semántico chico → `-ink` (el preset del panel deja los -500/-700 bajo AA).
  aviso: "text-[var(--data-warning-ink)]",
  bien: "text-[var(--data-success-ink)]",
  mal: "text-[var(--data-error-ink)]",
} as const;

/** Un dato de la fila: «Promedio por día **S/ 31.03**». */
export interface DatoEnLinea {
  label: string;
  valor: string | null | undefined;
  /** Línea chica al lado del valor («S/ 900.00»). */
  extra?: string;
}

/**
 * Fila de datos concretos (rótulo chico + valor en negrita). Los que no tienen
 * valor no se dibujan: nada de «—» ocupando lugar.
 */
export function DatosEnLinea({ datos }: { datos: DatoEnLinea[] }) {
  const con = datos.filter((d) => d.valor != null && d.valor !== "" && d.valor !== "—");
  if (con.length === 0) return null;
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
      {con.map((d) => (
        <div key={d.label} className="flex min-w-0 items-baseline gap-1.5">
          <dt className="font-medium text-[var(--text-tertiary)]">{d.label}</dt>
          <dd className="font-extrabold tabular-nums text-[var(--text-primary)]">
            {d.valor}
            {d.extra && <span className="ml-1 font-semibold text-[var(--text-secondary)]">{d.extra}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Las tarjetas del tablero, de a 1/2/3 por fila según el ancho del TABLERO
 * (no de la pantalla). Las de una misma fila se estiran al alto de la más
 * alta; las filas no se igualan entre sí (a diferencia de `DraggableSections`).
 */
export function GrillaTablero({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="@container">
      {/* dense: si una tarjeta no tiene dato (null), la siguiente sube a su hueco. */}
      <div className={cn("grid grid-flow-row-dense grid-cols-1 gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3", className)}>
        {children}
      </div>
    </div>
  );
}

/**
 * Dos tarjetas cortas apiladas en UNA celda de la grilla (p. ej. «Cómo te
 * pagan» + «Por reponer» al lado de las ventas por día): la de abajo se estira
 * hasta el alto de la fila. Si las dos vienen vacías, la celda desaparece
 * (`empty:hidden`) y la grilla densa sube la siguiente.
 */
export function PilaTablero({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-3 empty:hidden [&>*:last-child]:flex-1">{children}</div>;
}
