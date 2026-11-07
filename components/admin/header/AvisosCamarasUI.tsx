"use client";

/**
 * Las piezas visibles de Cámaras en la cabecera: el contador de avisos sin
 * ver (sobre el ícono de Cámaras, o sobre «Accesos» cuando Cámaras no está a
 * la vista), la fila de una opción (ícono + nombre + detalle) y las filas de
 * Cámaras del panel «Accesos» (en celular, donde no hay menú al pasar el
 * mouse). Las opciones salen de `opcionesCamaras`, igual que en `MenuCamaras`.
 */
import { Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { opcionesCamaras, type OpcionCamaras } from "./opciones-camaras";
import type { CamarasCabecera } from "./use-camaras-cabecera";

/**
 * Coral vivo con número oscuro en los dos temas (medido 10-10): el `-700` con
 * blanco daba 3,3:1 en oscuro, y el `-ink` con blanco (13:1) casi no se veía
 * sobre la cabecera oscura del panel.
 */
export const TONO_CONTADOR =
  "bg-[var(--data-warning-500)] text-[var(--text-primary)] dark:text-[var(--surface-canvas)]";

/** Número sobre un botón de 48 px (como el de la campana, a 14 px). */
export function ContadorAvisos({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      aria-hidden
      data-contador-avisos-camaras={n}
      className={cn(
        "pointer-events-none absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-sm font-bold leading-none tabular-nums shadow-[var(--shadow-sm)]",
        TONO_CONTADOR,
        className,
      )}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}

/** Ícono + nombre (+ una línea de detalle). La comparten el menú y el panel «Accesos». */
export function FilaOpcion({ o }: { o: OpcionCamaras }) {
  const Icono = o.ocupado ? Loader2 : o.icon;
  return (
    <>
      <Icono
        className={cn(
          "h-5 w-5 shrink-0",
          o.ocupado && "animate-spin",
          o.aviso ? "text-[var(--data-warning-ink)]" : "text-[var(--accent-ink)] dark:text-[var(--accent)]",
        )}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className={cn("font-semibold", o.aviso ? "text-[var(--data-warning-ink)]" : "text-[var(--text-primary)]")}>
          {o.label}
        </span>
        {o.detalle && <span className="truncate text-sm text-[var(--text-secondary)]">{o.detalle}</span>}
      </span>
    </>
  );
}

/** El tono de una opción que pide acción (sonido bloqueado, cámaras en pausa). */
export const FONDO_AVISO = "bg-[var(--data-warning-500)]/10";

/* «Abrir Cámaras» y «N avisos sin ver» ya están en la grilla de accesos (con su contador). */
const YA_EN_LA_GRILLA = new Set(["abrir", "sin-ver"]);

/**
 * Las opciones de Cámaras dentro del panel «Accesos»: las que piden acción a
 * todo el ancho, el resto de a dos (como la grilla de arriba).
 */
export function FilasCamarasAccesos({
  cam,
  alElegir,
  className,
}: {
  cam: CamarasCabecera;
  alElegir: (o: OpcionCamaras) => void;
  className?: string;
}) {
  const opciones = opcionesCamaras(cam).filter((o) => !YA_EN_LA_GRILLA.has(o.id));
  return (
    <div
      role="group"
      aria-label="Cámaras"
      data-filas-camaras
      className={cn("mt-1 grid grid-cols-2 gap-1 border-t border-[var(--rule-base)] pt-2", className)}
    >
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          role="menuitem"
          disabled={o.ocupado}
          aria-haspopup={o.abreVentana ? "dialog" : undefined}
          data-opcion-camaras={o.id}
          onClick={() => alElegir(o)}
          className={cn(
            "flex min-h-12 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-wait",
            "hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
            o.aviso && cn("col-span-2", FONDO_AVISO),
          )}
        >
          <FilaOpcion o={o} />
        </button>
      ))}
    </div>
  );
}
